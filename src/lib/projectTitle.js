const TITLE_MIN_WORDS = 3
const TITLE_MAX_WORDS = 7
const TITLE_MAX_CHARS = 64
const FALLBACK_SUFFIX_WORDS = ['project', 'plan']

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

function collapseWhitespace(text) {
  return toText(text).replace(/\s+/g, ' ').trim()
}

function stripLeadingPromptPrefix(text) {
  const normalized = collapseWhitespace(text)
  return normalized
    .replace(/^(i\s+(want|need|would\s+like)\s+to)\s+/i, '')
    .replace(/^(can\s+you|could\s+you|please|help\s+me)\s+/i, '')
    .replace(/^(let'?s)\s+/i, '')
    .replace(/^(build|create|make|develop)\s+(me\s+)?/i, '')
    .trim()
}

function extractWords(text) {
  return collapseWhitespace(text).match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []
}

function ensureTitleLength(words) {
  const boundedWords = words.slice(0, TITLE_MAX_WORDS)
  while (boundedWords.length > 0 && boundedWords.join(' ').length > TITLE_MAX_CHARS) {
    boundedWords.pop()
  }
  return boundedWords
}

function sentenceCase(value) {
  const trimmed = collapseWhitespace(value)
  if (!trimmed) {
    return ''
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
}

function normalizeCandidateTitle(value) {
  const lines = toText(value)
    .split('\n')
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  return lines[0]
    .replace(/^[-*#>\d.)\s]+/, '')
    .replace(/^["'`([{<\s]+/, '')
    .replace(/["'`)\]}>.,!?;:\s]+$/, '')
    .trim()
}

export function buildProjectTitleFallback(description) {
  const withoutPromptPrefix = stripLeadingPromptPrefix(description)
  const descriptionWords = extractWords(withoutPromptPrefix)
  const normalizedWords = descriptionWords.length > 0 ? descriptionWords : ['untitled']
  const seededWords = normalizedWords.slice(0, TITLE_MAX_WORDS)
  let suffixIndex = 0

  while (seededWords.length < TITLE_MIN_WORDS) {
    seededWords.push(FALLBACK_SUFFIX_WORDS[suffixIndex % FALLBACK_SUFFIX_WORDS.length])
    suffixIndex += 1
  }

  const boundedWords = ensureTitleLength(seededWords)
  return sentenceCase(boundedWords.join(' '))
}

export function sanitizeProjectTitle(rawTitle, fallbackDescription = '') {
  const normalizedCandidate = normalizeCandidateTitle(rawTitle)
  const candidateWords = extractWords(normalizedCandidate)

  if (candidateWords.length < TITLE_MIN_WORDS) {
    return buildProjectTitleFallback(fallbackDescription)
  }

  const boundedWords = ensureTitleLength(candidateWords)
  if (boundedWords.length < TITLE_MIN_WORDS) {
    return buildProjectTitleFallback(fallbackDescription)
  }

  return sentenceCase(boundedWords.join(' '))
}

export function getProjectDisplayTitle(project) {
  return sanitizeProjectTitle(project?.title, project?.description)
}
