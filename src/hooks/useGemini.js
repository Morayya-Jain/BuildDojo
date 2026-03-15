import { useCallback } from 'react'
import { buildFollowUpPrompt } from '../lib/followUpMentor.js'
import { MENTOR_SNIPPET_MAX_LINES } from '../lib/mentorSnippetGuardrail.js'
import {
  INTEREST_OPTIONS,
  SKILL_OPTIONS,
  expertiseLabel,
  labelsForValues,
  normalizeProfile,
} from '../lib/profile.js'
import { sanitizeProjectTitle } from '../lib/projectTitle.js'
import { sanitizeLanguage } from '../lib/runtimeUtils.js'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL_FLASH = 'gemini-2.5-flash'
const GEMINI_MODEL_PRO = 'gemini-2.5-pro'
const TIMEOUT_MS = 15000
const GEMINI_API_KEY = import.meta.env?.VITE_GEMINI_API_KEY?.trim()
const DEFAULT_PROJECT_SKILL_LEVEL = 'intermediate'
const PROJECT_SKILL_LEVELS = new Set(['beginner', 'intermediate', 'advanced', 'master'])
const FOLLOW_UP_SUGGESTION_COUNT = 2
const CODE_CHECK_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['PASS', 'FAIL'] },
    feedback: { type: 'STRING' },
    outputMatch: { type: 'BOOLEAN' },
    outputReason: { type: 'STRING' },
  },
  required: ['status', 'feedback', 'outputMatch', 'outputReason'],
}
const ROADMAP_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    skillLevel: {
      type: 'STRING',
      enum: ['beginner', 'intermediate', 'advanced', 'master'],
    },
    tasks: {
      type: 'ARRAY',
      minItems: 6,
      maxItems: 6,
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          hint: { type: 'STRING' },
          exampleOutput: { type: 'STRING' },
          language: { type: 'STRING' },
        },
        required: ['title', 'description', 'hint'],
      },
    },
  },
  required: ['skillLevel', 'tasks'],
}
const FOLLOW_UP_SUGGESTIONS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      minItems: FOLLOW_UP_SUGGESTION_COUNT,
      maxItems: FOLLOW_UP_SUGGESTION_COUNT,
    },
  },
  required: ['suggestions'],
}
const DEFAULT_CLARIFYING_ANSWERS = {
  skillLevelPreference: 'beginner',
  experience: 'Not specified.',
  scope: 'Start with a simple MVP.',
  time: 'Moderate pace.',
}
const STARTER_CONTEXT_KEYWORDS =
  /(command|terminal|run|create|init|install|folder|file|structure|scaffold|entry|index|main|setup|starter|start|first step)/i
const STAGE_ONE_STARTER_FALLBACKS = {
  javascript: {
    description:
      'Start by setting up a small project skeleton and confirming your entry file runs. Create your initial files and verify a basic script can execute before adding features.',
    hint:
      'In your terminal, initialize the project and create the first files (for example, package config and a main entry file). Run a simple starter command to confirm your setup works.',
  },
  typescript: {
    description:
      'Start by creating a basic TypeScript project structure with a clear entry point. Confirm your compiler/tooling can run before implementing feature logic.',
    hint:
      'Set up TypeScript config and an entry file first, then run a compile or dev command to verify the environment is ready.',
  },
  python: {
    description:
      'Start with a clean Python project layout and an entry script. Verify your environment can execute the starter file before building any task-specific behavior.',
    hint:
      'Create a virtual environment, add a starter script, and run it once from the terminal to confirm your setup.',
  },
  html: {
    description:
      'Start by creating the base page structure and identifying where each main section of your UI will live. Keep the first pass minimal so you can build incrementally.',
    hint:
      'Create an `index.html` with basic document structure and placeholder sections, then open it in the browser to validate your starting layout.',
  },
  sql: {
    description:
      'Start by defining the core table structure and relationships needed for the smallest working version. Validate schema creation before writing complex queries.',
    hint:
      'Write and run your initial `CREATE TABLE` statements for the key entities first, then verify the schema exists before adding inserts or joins.',
  },
  default: {
    description:
      'Start with a minimal project scaffold and verify your environment works before building features. Focus on the first executable step and basic file structure.',
    hint:
      'Use one concrete startup action first (create core files or run initial setup command), then confirm it runs so you can iterate safely.',
  },
}

function cleanJsonString(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractLooseJsonFieldValues(source, key, nextKey = '') {
  const normalizedSource = toText(source)
  if (!normalizedSource) {
    return []
  }

  const escapedKey = escapeRegExp(key)
  const escapedNextKey = nextKey ? escapeRegExp(nextKey) : ''
  const pattern = nextKey
    ? new RegExp(
        `"${escapedKey}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"${escapedNextKey}"\\s*:`,
        'gi',
      )
    : new RegExp(`"${escapedKey}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,|\\})`, 'gi')

  const values = []
  let match = pattern.exec(normalizedSource)
  while (match) {
    values.push(normalizeLooseJsonString(match[1] || ''))
    match = pattern.exec(normalizedSource)
  }

  return values
}

function parseJsonObjectCandidate(text) {
  const cleaned = cleanJsonString(text)
  const candidates = []

  if (cleaned) {
    candidates.push(cleaned)
    candidates.push(cleaned.replace(/,\s*([}\]])/g, '$1'))
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = cleaned.slice(firstBrace, lastBrace + 1)
    candidates.push(sliced)
    candidates.push(sliced.replace(/,\s*([}\]])/g, '$1'))
  }

  const uniqueCandidates = Array.from(
    new Set(candidates.map((entry) => entry.trim()).filter(Boolean)),
  )

  let lastError = null
  for (const candidate of uniqueCandidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('No JSON object found.')
}

function normalizeLooseJsonString(value) {
  return toText(value)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim()
}

function normalizeFollowUpSuggestion(value, maxChars = 96) {
  let text = toText(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^(question|suggestion)\s*\d*\s*:\s*/i, '')
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim()

  text = text
    .replace(/\s+\?/g, '?')
    .replace(/\s+([,.;:!])/g, '$1')
    .trim()

  if (/no code was provided for evaluation/i.test(text)) {
    return 'What should I implement first so this task can be evaluated?'
  }

  if (!text || !/[a-z0-9]/i.test(text)) {
    return ''
  }

  if (text.length > maxChars) {
    const slice = text.slice(0, maxChars)
    const lastSpace = slice.lastIndexOf(' ')
    const shortened = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim()
    text = `${shortened}...`
  }

  if (!/[?]$/.test(text)) {
    text = `${text.replace(/[.!]+$/, '').trim()}?`
  }

  return text
}

function compactText(value, maxChars = 240) {
  const normalized = toText(value).replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  if (normalized.length <= maxChars) {
    return normalized
  }

  return `${normalized.slice(0, maxChars).trim()}...`
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500
}

function isRetryableError(error) {
  if (!error) {
    return false
  }

  if (error.name === 'AbortError') {
    return true
  }

  const message = toText(error.message).toLowerCase()
  return /rate limit|429|timeout|temporar|unavailable|internal|try again/i.test(message)
}

function toText(value) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value == null) {
    return ''
  }

  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function getGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function expertiseResponseStyle(expertiseLevel) {
  if (expertiseLevel === 'beginner') {
    return 'Explain from first principles in small steps, define basic terms, and avoid assumptions.'
  }

  if (expertiseLevel === 'intermediate') {
    return 'Use clear practical guidance with short explanations and one concrete next action.'
  }

  if (expertiseLevel === 'advanced') {
    return 'Be concise and technical, focus on tradeoffs, edge cases, and advanced execution detail.'
  }

  if (expertiseLevel === 'master') {
    return 'Be highly concise and technical. Prioritize architecture, performance, reliability, scalability, validation strategy, and explicit tradeoffs.'
  }

  return 'Use balanced coaching with clear, practical guidance.'
}

function buildProfilePromptBlock(profileContext) {
  const normalized = normalizeProfile(profileContext)
  const skillLabels = labelsForValues(normalized.skills, SKILL_OPTIONS)
  const interestLabels = labelsForValues(normalized.interests, INTEREST_OPTIONS)
  const styleGuide = expertiseResponseStyle(normalized.expertiseLevel)

  return `Learner profile:
- Expertise: ${expertiseLabel(normalized.expertiseLevel)}
- Skills to explore: ${skillLabels.length > 0 ? skillLabels.join(', ') : 'None specified'}
- Interests: ${interestLabels.length > 0 ? interestLabels.join(', ') : 'None specified'}

Personalization rules:
- ${styleGuide}
- If skills/interests are provided, bias examples and language toward those areas.
- If skills/interests are missing, keep examples generally relevant and beginner-safe.`
}

function parseCodeCheckResult(text) {
  const parsed = parseJsonObjectCandidate(text)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Code check response is not a JSON object.')
  }

  const normalizedStatus = toText(parsed.status).trim().toUpperCase()
  if (normalizedStatus !== 'PASS' && normalizedStatus !== 'FAIL') {
    throw new Error('Code check response must include status PASS or FAIL.')
  }

  const feedback = toText(parsed.feedback).trim()
  if (!feedback) {
    throw new Error('Code check response must include non-empty feedback.')
  }

  const normalizedOutputMatch = toText(parsed.outputMatch).trim().toLowerCase()
  if (normalizedOutputMatch !== 'true' && normalizedOutputMatch !== 'false') {
    throw new Error('Code check response must include boolean outputMatch.')
  }

  const outputReason = toText(parsed.outputReason).trim()

  return {
    status: normalizedStatus,
    feedback,
    outputMatch: normalizedOutputMatch === 'true',
    outputReason,
  }
}

export function parseFollowUpSuggestionsResult(text) {
  const parsed = parseJsonObjectCandidate(text)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Follow-up suggestions response is not a JSON object.')
  }

  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('Follow-up suggestions response must include a suggestions array.')
  }

  if (parsed.suggestions.length !== FOLLOW_UP_SUGGESTION_COUNT) {
    throw new Error(
      `Follow-up suggestions response must include exactly ${FOLLOW_UP_SUGGESTION_COUNT} suggestions.`,
    )
  }

  const normalizedSuggestions = parsed.suggestions.map((entry) =>
    normalizeFollowUpSuggestion(entry),
  )
  if (normalizedSuggestions.some((entry) => entry.length === 0)) {
    throw new Error('Follow-up suggestions response must include non-empty strings.')
  }

  const uniqueCount = new Set(
    normalizedSuggestions.map((entry) => entry.toLowerCase()),
  ).size
  if (uniqueCount !== FOLLOW_UP_SUGGESTION_COUNT) {
    throw new Error('Follow-up suggestions response must include unique suggestions.')
  }

  return normalizedSuggestions
}

export function parseCodeCheckResultLenient(text) {
  const source = cleanJsonString(text)

  const statusMatch =
    source.match(/"status"\s*:\s*"(PASS|FAIL)"/i) ||
    source.match(/\b(PASS|FAIL)\b/i)
  const outputMatchMatch = source.match(/"outputMatch"\s*:\s*(true|false)/i)
  const feedbackMatch =
    source.match(/"feedback"\s*:\s*"([\s\S]*?)"\s*,\s*"outputMatch"/i) ||
    source.match(/"feedback"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/i)
  const outputReasonMatch =
    source.match(/"outputReason"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/i)

  const status = toText(statusMatch?.[1]).trim().toUpperCase()
  const feedback = normalizeLooseJsonString(feedbackMatch?.[1] || '')

  if ((status !== 'PASS' && status !== 'FAIL') || !feedback) {
    throw new Error('Code check response was malformed and could not be recovered.')
  }

  return {
    status,
    feedback,
    outputMatch: toText(outputMatchMatch?.[1]).trim().toLowerCase() === 'true',
    outputReason: normalizeLooseJsonString(outputReasonMatch?.[1] || ''),
  }
}

export function parseFollowUpSuggestionsResultLenient(text) {
  const source = cleanJsonString(text)
  const candidates = []

  for (const line of source.split('\n')) {
    const normalizedLine = line
      .trim()
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^["']/, '')
      .replace(/["']$/, '')
      .trim()

    if (!normalizedLine) {
      continue
    }

    candidates.push(normalizedLine)
  }

  const questionMatches = source.match(/[^?\n]{6,220}\?/g) || []
  candidates.push(...questionMatches)

  const normalized = []
  const seen = new Set()
  for (const entry of candidates) {
    const collapsed = normalizeFollowUpSuggestion(entry)
    if (collapsed.length < 8) {
      continue
    }
    const question = collapsed

    const key = question.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push(question)
    if (normalized.length === FOLLOW_UP_SUGGESTION_COUNT) {
      break
    }
  }

  if (normalized.length !== FOLLOW_UP_SUGGESTION_COUNT) {
    throw new Error('Follow-up suggestions response was malformed and could not be recovered.')
  }

  return normalized
}

function buildFallbackFollowUpSuggestions(task, mentorFeedback) {
  const normalizedFeedback = toText(mentorFeedback).toLowerCase()
  const noCodeDetected = /no code was provided|empty submission|no submission|missing code/i.test(
    normalizedFeedback,
  )

  const baseSuggestions = noCodeDetected
    ? [
        'What should I implement first so this task can be evaluated?',
        'Can you give me a tiny first step to start this task?',
      ]
    : [
        'Which one fix should I make first?',
        'How can I quickly verify that fix before checking again?',
      ]

  return baseSuggestions.map((entry) => normalizeFollowUpSuggestion(entry))
}

function normalizeProjectSkillLevel(value) {
  const normalized = toText(value).trim().toLowerCase()
  if (PROJECT_SKILL_LEVELS.has(normalized)) {
    return normalized
  }

  return DEFAULT_PROJECT_SKILL_LEVEL
}

function normalizeModelSkillLevel(value) {
  const normalized = toText(value).trim().toLowerCase()

  if (normalized === 'hard') {
    return 'advanced'
  }

  if (PROJECT_SKILL_LEVELS.has(normalized)) {
    return normalized
  }

  return ''
}

export function selectGeminiModel(skillLevel) {
  const normalizedSkillLevel = normalizeModelSkillLevel(skillLevel)
  if (normalizedSkillLevel === 'advanced' || normalizedSkillLevel === 'master') {
    return GEMINI_MODEL_PRO
  }

  return GEMINI_MODEL_FLASH
}

function isMissingStarterContext(text) {
  const normalized = toText(text).trim()
  if (!normalized) {
    return true
  }

  if (normalized.length < 60) {
    return true
  }

  return !STARTER_CONTEXT_KEYWORDS.test(normalized)
}

function getStageOneStarterFallback(language) {
  const normalizedLanguage = sanitizeLanguage(language)
  if (normalizedLanguage && STAGE_ONE_STARTER_FALLBACKS[normalizedLanguage]) {
    return STAGE_ONE_STARTER_FALLBACKS[normalizedLanguage]
  }

  return STAGE_ONE_STARTER_FALLBACKS.default
}

function normalizeTaskWithStarterFallback(task, index) {
  const title = toText(task.title) || `Task ${index + 1}`
  const description = toText(task.description)
  const hint = toText(task.hint)
  const exampleOutput = toText(task.exampleOutput)
  const lockedLanguage = sanitizeLanguage(task.language)

  if (index !== 0) {
    return {
      id: task.id || `ai-task-${index + 1}`,
      title,
      description,
      hint,
      exampleOutput,
      language: lockedLanguage,
      completed: false,
      task_index: index,
    }
  }

  const fallback = getStageOneStarterFallback(lockedLanguage)

  return {
    id: task.id || `ai-task-${index + 1}`,
    title,
    description: isMissingStarterContext(description)
      ? fallback.description
      : description,
    hint: isMissingStarterContext(hint) ? fallback.hint : hint,
    exampleOutput,
    language: lockedLanguage,
    completed: false,
    task_index: index,
  }
}

export function normalizeClarifyingAnswers(clarifyingAnswers) {
  const source =
    clarifyingAnswers && typeof clarifyingAnswers === 'object' ? clarifyingAnswers : {}
  const rawSkillLevelPreference = toText(source.skillLevelPreference).trim().toLowerCase()
  const skillLevelPreference = PROJECT_SKILL_LEVELS.has(rawSkillLevelPreference)
    ? rawSkillLevelPreference
    : DEFAULT_CLARIFYING_ANSWERS.skillLevelPreference

  return {
    skillLevelPreference,
    experience: toText(source.experience).trim() || DEFAULT_CLARIFYING_ANSWERS.experience,
    scope: toText(source.scope).trim() || DEFAULT_CLARIFYING_ANSWERS.scope,
    time: toText(source.time).trim() || DEFAULT_CLARIFYING_ANSWERS.time,
  }
}

function normalizeRoadmapGenerationPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Roadmap response is not a JSON object.')
  }

  if (!Array.isArray(parsed.tasks)) {
    throw new Error('Roadmap response must include a tasks array.')
  }

  if (parsed.tasks.length !== 6) {
    throw new Error('Roadmap must contain exactly 6 tasks.')
  }

  return {
    skillLevel: normalizeProjectSkillLevel(parsed.skillLevel),
    tasks: parsed.tasks.map((task, index) => normalizeTaskWithStarterFallback(task, index)),
  }
}

export function buildFallbackRoadmap(projectDescription, clarifyingAnswers) {
  const normalizedAnswers = normalizeClarifyingAnswers(clarifyingAnswers)
  const fallbackSkillLevel = normalizeProjectSkillLevel(normalizedAnswers.skillLevelPreference)
  const projectLabel = compactText(projectDescription, 96) || 'your coding project'

  const fallbackTasks = [
    {
      id: 'ai-task-1',
      title: 'Set up the project foundation',
      description: `Initialize the base structure for ${projectLabel}. Create the first files/folders and confirm your entry point can run before adding feature logic.`,
      hint: 'Use one startup command, create your entry file, and run it once to verify setup.',
      exampleOutput: '',
      language: '',
    },
    {
      id: 'ai-task-2',
      title: 'Define core data and flow',
      description:
        'Identify the core data your app needs and map the smallest end-to-end user flow. Focus on one clear path that proves the project concept.',
      hint: 'Write down the key inputs, outputs, and state changes for one happy-path flow.',
      exampleOutput: '',
      language: '',
    },
    {
      id: 'ai-task-3',
      title: 'Implement the first MVP feature',
      description:
        'Build one primary feature from the core flow and get it working with simple test data. Keep the implementation narrow and iterative.',
      hint: 'Start with basic behavior first, then verify it manually with a quick check.',
      exampleOutput: '',
      language: '',
    },
    {
      id: 'ai-task-4',
      title: 'Add the second key capability',
      description:
        'Implement the next most important capability that makes the project useful in practice. Reuse existing structure rather than rewriting from scratch.',
      hint: 'Add this in small slices and validate each slice before moving forward.',
      exampleOutput: '',
      language: '',
    },
    {
      id: 'ai-task-5',
      title: 'Handle errors and edge cases',
      description:
        'Improve reliability by adding validation, error handling, and edge-case coverage for your main flows. Make failures visible and understandable.',
      hint: 'Test empty, invalid, and boundary inputs to confirm safe behavior.',
      exampleOutput: '',
      language: '',
    },
    {
      id: 'ai-task-6',
      title: 'Finalize and verify',
      description:
        'Review the full workflow, polish naming/structure, and verify the MVP can be demonstrated end to end. Capture short notes on what to build next.',
      hint: 'Run through the complete flow once as if you are the user and note any rough spots.',
      exampleOutput: '',
      language: '',
    },
  ]

  return normalizeRoadmapGenerationPayload({
    skillLevel: fallbackSkillLevel,
    tasks: fallbackTasks,
  })
}

function parseRoadmapGenerationResultStrict(text) {
  const parsed = parseJsonObjectCandidate(text)
  return normalizeRoadmapGenerationPayload(parsed)
}

export function parseRoadmapGenerationResultLenient(text) {
  const source = cleanJsonString(text)
  const titles = extractLooseJsonFieldValues(source, 'title', 'description')
  const descriptions = extractLooseJsonFieldValues(source, 'description', 'hint')
  const hints = extractLooseJsonFieldValues(source, 'hint', 'exampleOutput')
  const exampleOutputs = extractLooseJsonFieldValues(source, 'exampleOutput', 'language')
  const languages = extractLooseJsonFieldValues(source, 'language')
  const ids = extractLooseJsonFieldValues(source, 'id', 'title')

  const taskCount = Math.min(titles.length, descriptions.length, hints.length)
  if (taskCount !== 6) {
    throw new Error('Roadmap response was malformed and could not be recovered.')
  }

  const skillLevelMatch =
    source.match(/"skillLevel"\s*:\s*"(beginner|intermediate|advanced|master|hard)"/i) ||
    source.match(/\b(beginner|intermediate|advanced|master|hard)\b/i)
  const rawSkillLevel = toText(skillLevelMatch?.[1]).trim().toLowerCase()
  const normalizedSkillLevel = normalizeModelSkillLevel(rawSkillLevel) || rawSkillLevel

  const recoveredTasks = Array.from({ length: taskCount }, (_, index) => ({
    id: ids[index] || `ai-task-${index + 1}`,
    title: titles[index] || `Task ${index + 1}`,
    description: descriptions[index] || '',
    hint: hints[index] || '',
    exampleOutput: exampleOutputs[index] || '',
    language: languages[index] || '',
  }))

  return normalizeRoadmapGenerationPayload({
    skillLevel: normalizedSkillLevel,
    tasks: recoveredTasks,
  })
}

export function parseRoadmapGenerationResult(text) {
  try {
    return parseRoadmapGenerationResultStrict(text)
  } catch (strictError) {
    try {
      return parseRoadmapGenerationResultLenient(text)
    } catch {
      throw strictError
    }
  }
}

async function callGemini(prompt, options = {}) {
  const {
    temperature = 0.5,
    maxOutputTokens = 256,
    model = GEMINI_MODEL_FLASH,
    responseMimeType = null,
    responseSchema = null,
    retryCount = 0,
  } = options

  if (!GEMINI_API_KEY) {
    return {
      data: null,
      error: new Error(
        'Missing required environment variable: VITE_GEMINI_API_KEY. Add it in Netlify Site configuration > Environment variables and redeploy.',
      ),
    }
  }

  const maxAttempts = Math.max(1, retryCount + 1)
  const generationConfig = {
    temperature,
    maxOutputTokens,
    ...(responseMimeType ? { responseMimeType } : {}),
    ...(responseSchema ? { responseSchema } : {}),
  }

  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(
        `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig,
          }),
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        let message = `Gemini request failed (${response.status})`
        try {
          const errorData = await response.json()
          const apiMessage = errorData?.error?.message
          if (apiMessage) {
            message = apiMessage
          }
        } catch {
          // Ignore JSON parse issues for error body.
        }

        const responseError = new Error(message)
        if (attempt < maxAttempts - 1 && isRetryableStatus(response.status)) {
          await sleep(300 * (attempt + 1))
          continue
        }

        throw responseError
      }

      const data = await response.json()
      const text = getGeminiText(data)

      if (!text) {
        throw new Error('Gemini returned an empty response.')
      }

      return { data: text, error: null }
    } catch (error) {
      lastError = error

      if (attempt < maxAttempts - 1 && isRetryableError(error)) {
        await sleep(300 * (attempt + 1))
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  if (lastError?.name === 'AbortError') {
    return {
      data: null,
      error: new Error('Request timed out after 15 seconds. Please try again.'),
    }
  }

  return { data: null, error: lastError || new Error('Gemini request failed.') }
}

export function buildRoadmapPrompt(projectDescription, clarifyingAnswers, profileContext = null) {
  const normalizedAnswers = normalizeClarifyingAnswers(clarifyingAnswers)
  const profileBlock = buildProfilePromptBlock(profileContext)

  return `You are a coding mentor.
The user wants to build: ${projectDescription}.

Initial clarifying answers:
- Selected skill level preference: ${normalizedAnswers.skillLevelPreference}
- Prior experience: ${normalizedAnswers.experience}
- Smallest MVP scope: ${normalizedAnswers.scope}
- Weekly pace/time commitment: ${normalizedAnswers.time}

${profileBlock}

Infer the project skill level from the user project context.
Allowed skill levels: beginner, intermediate, advanced, master.
Use selected skill level preference as the target skillLevel unless it clearly conflicts with project scope.
Always tailor the roadmap tasks intelligently based on project complexity and clarifying context.

Generate a learning roadmap as exactly 6 tasks.
Each task guides the user to implement one specific piece of the project themselves.
Never give complete code solutions in the description or hint fields.
Special Stage 1 requirement:
- Task 1 must explain how to start from zero.
- Task 1 must include at least one practical starter cue: command(s), file/folder structure, or first entry point setup.
- Task 1 should name the first concrete action the learner can execute immediately.
- Keep Stage 1 guidance instructional and partial, never full solution code.

Return ONLY a valid raw JSON object. No markdown, no backticks, no explanation.
Schema:
{
  "skillLevel": "beginner|intermediate|advanced|master",
  "tasks": [{ "id", "title", "description", "hint", "exampleOutput", "language" }]
}
The language field must be one of: javascript, typescript, python, html, sql, java, csharp, go, rust, ruby, php, swift, kotlin.
Use language only as a task-level lock when clearly appropriate.
The exampleOutput field may contain code as it is shown only when explicitly requested.`
}

export function buildProjectTitlePrompt(projectDescription) {
  return `You create concise titles for coding projects.

Project description:
${toText(projectDescription)}

Rules:
- Return a plain-text title only.
- Use 3 to 7 words.
- No markdown, no quotes, no numbering, no punctuation-only output.
- No code snippets.
- Keep it specific to the project goal.

Return ONLY the title text.`
}

export function buildCodeCheckPrompt(task, userCode, profileContext = null) {
  const exampleOutput = toText(task?.exampleOutput ?? '').trim()
  const profileBlock = buildProfilePromptBlock(profileContext)

  return `You are a strict coding mentor and code evaluator.
Evaluate whether the user's code satisfies the current task and expected output.

Task title: ${toText(task?.title)}
Task description: ${toText(task?.description)}
Expected example output (may be empty): ${exampleOutput || 'N/A'}
${profileBlock}

User code:
${userCode}

Rules:
- Never provide complete working code or a full-file answer.
- If you include code, keep each snippet at ${MENTOR_SNIPPET_MAX_LINES} lines max and only include minimal illustrative fragments.
- Be specific and concise.
- If expected example output is provided, check if behavior/output aligns with it.
- If expected example output is not provided, set outputMatch to true and explain that in outputReason.
- Return status PASS only when task requirements are satisfied.
- Return status FAIL if anything required is missing or incorrect.

Return ONLY raw JSON with this exact schema:
{"status":"PASS|FAIL","feedback":"string","outputMatch":true|false,"outputReason":"string"}
No markdown. No extra keys.`
}

export function buildFollowUpSuggestionsPrompt(
  task,
  userCode,
  mentorFeedback,
  profileContext = null,
) {
  const normalizedProfile = normalizeProfile(profileContext)
  const expertise = expertiseLabel(normalizedProfile.expertiseLevel)
  const taskTitle = compactText(task?.title, 120) || 'Current task'
  const taskDescription = compactText(task?.description, 280) || 'No description provided.'
  const feedbackSummary = compactText(mentorFeedback, 800)
  const codeExcerpt = compactText(userCode, 280)

  return `You are a coding mentor helping a learner ask strong follow-up questions.

Task title: ${taskTitle}
Task description: ${taskDescription}
Task language: ${toText(task?.language) || 'unspecified'}
Learner expertise: ${expertise}
Mentor feedback from the latest code check:
${feedbackSummary}

Current code excerpt (truncated):
${codeExcerpt || 'N/A'}

Rules:
- Generate exactly ${FOLLOW_UP_SUGGESTION_COUNT} concise follow-up questions.
- Keep each suggestion beginner-friendly and focused on the mentor feedback above.
- Each suggestion must be a single question the learner can ask next.
- Never provide complete working code or a full-file answer.
- Do not include explanations, numbering, or markdown.

Return ONLY raw JSON with this exact schema:
{"suggestions":["question 1","question 2"]}
No markdown. No extra keys.`
}

export function useGemini() {
  const generateRoadmap = useCallback(async (projectDescription, clarifyingAnswers, profileContext = null) => {
    const basePrompt = buildRoadmapPrompt(
      projectDescription,
      clarifyingAnswers,
      profileContext,
    )
    const model = selectGeminiModel(clarifyingAnswers?.skillLevelPreference)

    const firstAttempt = await callGemini(basePrompt, {
      temperature: 0.7,
      maxOutputTokens: 1024,
      model,
      responseMimeType: 'application/json',
      responseSchema: ROADMAP_RESPONSE_SCHEMA,
      retryCount: 1,
    })
    if (firstAttempt.error) {
      return { data: null, error: firstAttempt.error }
    }

    try {
      const roadmap = parseRoadmapGenerationResult(firstAttempt.data)
      return { data: roadmap, error: null }
    } catch {
      const retryPrompt = `${basePrompt}\nYou must return only raw JSON matching the schema exactly.`
      const secondAttempt = await callGemini(retryPrompt, {
        temperature: 0.7,
        maxOutputTokens: 1024,
        model,
        responseMimeType: 'application/json',
        responseSchema: ROADMAP_RESPONSE_SCHEMA,
        retryCount: 1,
      })

      if (secondAttempt.error) {
        return { data: null, error: secondAttempt.error }
      }

      try {
        const roadmap = parseRoadmapGenerationResult(secondAttempt.data)
        return { data: roadmap, error: null }
      } catch (error) {
        console.warn('Roadmap parsing failed after retry. Falling back to local roadmap.', error)
        return {
          data: buildFallbackRoadmap(projectDescription, clarifyingAnswers),
          error: null,
        }
      }
    }
  }, [])

  const generateProjectTitle = useCallback(async (projectDescription, skillLevel = '') => {
    const prompt = buildProjectTitlePrompt(projectDescription)
    const model = selectGeminiModel(skillLevel)

    const result = await callGemini(prompt, {
      temperature: 0.3,
      maxOutputTokens: 48,
      model,
    })

    if (result.error) {
      return { data: null, error: result.error }
    }

    return {
      data: sanitizeProjectTitle(result.data, projectDescription),
      error: null,
    }
  }, [])

  const checkUserCode = useCallback(
    async (task, userCode, profileContext = null, skillLevel = '') => {
      const model = selectGeminiModel(skillLevel)
      const prompt = buildCodeCheckPrompt(task, userCode, profileContext)

      const firstAttempt = await callGemini(prompt, {
        temperature: 0.2,
        maxOutputTokens: 260,
        model,
        responseMimeType: 'application/json',
        responseSchema: CODE_CHECK_RESPONSE_SCHEMA,
        retryCount: 1,
      })
      if (firstAttempt.error) {
        return { data: null, error: firstAttempt.error }
      }

      try {
        const parsed = parseCodeCheckResult(firstAttempt.data)
        return { data: parsed, error: null }
      } catch {
        try {
          const parsed = parseCodeCheckResultLenient(firstAttempt.data)
          return { data: parsed, error: null }
        } catch {
          // Continue to strict retry before failing.
        }

        const retryPrompt = `${prompt}\nYou must return only raw JSON matching the schema exactly.`
        const secondAttempt = await callGemini(retryPrompt, {
          temperature: 0.2,
          maxOutputTokens: 260,
          model,
          responseMimeType: 'application/json',
          responseSchema: CODE_CHECK_RESPONSE_SCHEMA,
          retryCount: 1,
        })

        if (secondAttempt.error) {
          return { data: null, error: secondAttempt.error }
        }

        try {
          const parsed = parseCodeCheckResult(secondAttempt.data)
          return { data: parsed, error: null }
        } catch (error) {
          try {
            const parsed = parseCodeCheckResultLenient(secondAttempt.data)
            return { data: parsed, error: null }
          } catch {
            return {
              data: null,
              error: new Error(
                `Could not parse code check JSON after retry: ${error.message}`,
              ),
            }
          }
        }
      }
    },
    [],
  )

  const askFollowUp = useCallback(
    async (
      task,
      userCode,
      userQuestion,
      feedbackHistory,
      skillLevel,
      profileContext = null,
    ) => {
      const prompt = buildFollowUpPrompt({
        task,
        userCode,
        userQuestion,
        feedbackHistory,
        skillLevel,
        profileContext,
      })
      const model = selectGeminiModel(skillLevel)

      const result = await callGemini(prompt, {
        temperature: 0.4,
        maxOutputTokens: 320,
        model,
      })
      if (result.error) {
        return { data: null, error: result.error }
      }

      return { data: result.data, error: null }
    },
    [],
  )

  const suggestFollowUpQuestions = useCallback(
    async (
      task,
      userCode,
      mentorFeedback,
      skillLevel,
      profileContext = null,
    ) => {
      const prompt = buildFollowUpSuggestionsPrompt(
        task,
        userCode,
        mentorFeedback,
        profileContext,
      )
      const model = selectGeminiModel(skillLevel)
      const fallbackSuggestions = buildFallbackFollowUpSuggestions(task, mentorFeedback)

      const firstAttempt = await callGemini(prompt, {
        temperature: 0.2,
        maxOutputTokens: 140,
        model,
        responseMimeType: 'application/json',
        responseSchema: FOLLOW_UP_SUGGESTIONS_RESPONSE_SCHEMA,
        retryCount: 2,
      })
      if (firstAttempt.error) {
        return { data: fallbackSuggestions, error: null }
      }

      try {
        const parsed = parseFollowUpSuggestionsResult(firstAttempt.data)
        return { data: parsed, error: null }
      } catch {
        try {
          const parsed = parseFollowUpSuggestionsResultLenient(firstAttempt.data)
          return { data: parsed, error: null }
        } catch {
          // Continue to strict retry before failing.
        }

        const retryPrompt = `${prompt}\nYou must return only raw JSON matching the schema exactly.`
        const secondAttempt = await callGemini(retryPrompt, {
          temperature: 0.2,
          maxOutputTokens: 140,
          model,
          responseMimeType: 'application/json',
          responseSchema: FOLLOW_UP_SUGGESTIONS_RESPONSE_SCHEMA,
          retryCount: 2,
        })

        if (secondAttempt.error) {
          return { data: fallbackSuggestions, error: null }
        }

        try {
          const parsed = parseFollowUpSuggestionsResult(secondAttempt.data)
          return { data: parsed, error: null }
        } catch (error) {
          try {
            const parsed = parseFollowUpSuggestionsResultLenient(secondAttempt.data)
            return { data: parsed, error: null }
          } catch {
            console.error(
              'Could not parse follow-up suggestions after retry, using fallback suggestions.',
              error,
            )
            return { data: fallbackSuggestions, error: null }
          }
        }
      }
    },
    [],
  )

  return {
    generateRoadmap,
    generateProjectTitle,
    checkUserCode,
    askFollowUp,
    suggestFollowUpQuestions,
  }
}
