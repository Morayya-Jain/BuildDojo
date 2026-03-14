import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCodeCheckPrompt,
  buildProjectTitlePrompt,
  buildRoadmapPrompt,
  normalizeClarifyingAnswers,
  parseRoadmapGenerationResult,
  selectGeminiModel,
} from '../src/hooks/useGemini.js'

function buildTask(index) {
  return {
    id: `task-${index + 1}`,
    title: `Task ${index + 1}`,
    description: `Description ${index + 1}`,
    hint: `Hint ${index + 1}`,
    exampleOutput: `Example ${index + 1}`,
    language: 'javascript',
  }
}

test('normalizeClarifyingAnswers applies defaults when values are missing', () => {
  assert.deepEqual(normalizeClarifyingAnswers({}), {
    skillLevelPreference: 'beginner',
    experience: 'Not specified.',
    scope: 'Start with a simple MVP.',
    time: 'Moderate pace.',
  })
})

test('normalizeClarifyingAnswers keeps valid skill preference and normalizes invalid to beginner', () => {
  assert.equal(
    normalizeClarifyingAnswers({ skillLevelPreference: 'Advanced' }).skillLevelPreference,
    'advanced',
  )
  assert.equal(
    normalizeClarifyingAnswers({ skillLevelPreference: 'Master' }).skillLevelPreference,
    'master',
  )
  assert.equal(
    normalizeClarifyingAnswers({ skillLevelPreference: 'guru' }).skillLevelPreference,
    'beginner',
  )
})

test('parseRoadmapGenerationResult parses a valid roadmap payload', () => {
  const input = JSON.stringify({
    skillLevel: 'advanced',
    tasks: Array.from({ length: 6 }, (_, index) => buildTask(index)),
  })

  const parsed = parseRoadmapGenerationResult(input)
  assert.equal(parsed.skillLevel, 'advanced')
  assert.equal(parsed.tasks.length, 6)
  assert.equal(parsed.tasks[0].task_index, 0)
})

test('parseRoadmapGenerationResult preserves master skill level', () => {
  const input = JSON.stringify({
    skillLevel: 'master',
    tasks: Array.from({ length: 6 }, (_, index) => buildTask(index)),
  })

  const parsed = parseRoadmapGenerationResult(input)
  assert.equal(parsed.skillLevel, 'master')
})

test('parseRoadmapGenerationResult falls back to intermediate for invalid skill level', () => {
  const input = JSON.stringify({
    skillLevel: 'expert-plus',
    tasks: Array.from({ length: 6 }, (_, index) => buildTask(index)),
  })

  const parsed = parseRoadmapGenerationResult(input)
  assert.equal(parsed.skillLevel, 'intermediate')
})

test('parseRoadmapGenerationResult throws when task count is not exactly 6', () => {
  const input = JSON.stringify({
    skillLevel: 'beginner',
    tasks: [buildTask(0)],
  })

  assert.throws(() => parseRoadmapGenerationResult(input), /exactly 6 tasks/i)
})

test('parseRoadmapGenerationResult injects Stage 1 starter fallback when context is missing', () => {
  const tasks = Array.from({ length: 6 }, (_, index) => buildTask(index))
  tasks[0] = {
    ...tasks[0],
    description: '',
    hint: 'Try coding.',
    language: 'javascript',
  }

  const input = JSON.stringify({
    skillLevel: 'beginner',
    tasks,
  })

  const parsed = parseRoadmapGenerationResult(input)
  assert.match(parsed.tasks[0].description, /project skeleton|entry file|setup/i)
  assert.match(parsed.tasks[0].hint, /terminal|entry file|setup|command/i)
})

test('parseRoadmapGenerationResult preserves strong Stage 1 guidance', () => {
  const tasks = Array.from({ length: 6 }, (_, index) => buildTask(index))
  tasks[0] = {
    ...tasks[0],
    description:
      'Open your terminal, initialize the project folder, create src/main.js, and confirm the entry point runs before adding app features.',
    hint:
      'Use a starter command to initialize project metadata, then run the entry file once to verify setup.',
    language: 'javascript',
  }

  const input = JSON.stringify({
    skillLevel: 'beginner',
    tasks,
  })

  const parsed = parseRoadmapGenerationResult(input)
  assert.equal(parsed.tasks[0].description, tasks[0].description)
  assert.equal(parsed.tasks[0].hint, tasks[0].hint)
})

test('buildRoadmapPrompt keeps no-solution guard and Stage 1 kickoff constraints', () => {
  const prompt = buildRoadmapPrompt(
    'I want to build a notes app',
    {
      skillLevelPreference: 'beginner',
      experience: 'Very new to coding',
      scope: 'Simple MVP',
      time: '3 hours weekly',
    },
    null,
  )

  assert.match(prompt, /Never give complete code solutions in the description or hint fields/i)
  assert.match(prompt, /Special Stage 1 requirement/i)
  assert.match(prompt, /Task 1 must explain how to start from zero/i)
  assert.match(prompt, /Allowed skill levels: beginner, intermediate, advanced, master\./i)
  assert.match(prompt, /"skillLevel": "beginner\|intermediate\|advanced\|master"/i)
})

test('selectGeminiModel routes advanced and master to pro model', () => {
  assert.equal(selectGeminiModel('beginner'), 'gemini-2.5-flash')
  assert.equal(selectGeminiModel('intermediate'), 'gemini-2.5-flash')
  assert.equal(selectGeminiModel('advanced'), 'gemini-2.5-pro')
  assert.equal(selectGeminiModel('master'), 'gemini-2.5-pro')
  assert.equal(selectGeminiModel('hard'), 'gemini-2.5-pro')
})

test('buildCodeCheckPrompt keeps short-snippet and no-full-solution guardrails', () => {
  const prompt = buildCodeCheckPrompt(
    {
      title: 'Build input validation',
      description: 'Validate empty values and show an inline error',
      exampleOutput: '',
    },
    'const value = input.trim()',
    null,
  )

  assert.match(prompt, /Never provide complete working code or a full-file answer/i)
  assert.match(prompt, /keep each snippet at 6 lines max/i)
  assert.match(prompt, /Return ONLY raw JSON with this exact schema/i)
})

test('buildProjectTitlePrompt enforces concise plain-text title output', () => {
  const prompt = buildProjectTitlePrompt('I want to build a real-time kanban board with auth')

  assert.match(prompt, /Return a plain-text title only/i)
  assert.match(prompt, /Use 3 to 7 words/i)
  assert.match(prompt, /No markdown, no quotes, no numbering/i)
  assert.match(prompt, /Return ONLY the title text\./i)
})
