const MENTOR_SNIPPET_MAX_LINES = 6
const MENTOR_SNIPPET_TRUNCATION_NOTE = 'Snippet shortened for guidance.'

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

function normalizeMaxLines(maxLines) {
  const parsed = Number(maxLines)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return MENTOR_SNIPPET_MAX_LINES
  }

  return Math.floor(parsed)
}

function clampCodeSnippetLines(content, maxLines = MENTOR_SNIPPET_MAX_LINES) {
  const safeMaxLines = normalizeMaxLines(maxLines)
  const safeContent = toText(content)
  const lines = safeContent ? safeContent.split('\n') : []

  if (lines.length <= safeMaxLines) {
    return {
      content: safeContent,
      lineCount: lines.length,
      wasTrimmed: false,
    }
  }

  return {
    content: lines.slice(0, safeMaxLines).join('\n'),
    lineCount: lines.length,
    wasTrimmed: true,
  }
}

function limitMentorSnippetSegments(segments, maxLines = MENTOR_SNIPPET_MAX_LINES) {
  if (!Array.isArray(segments)) {
    return []
  }

  return segments.map((segment) => {
    if (!segment || segment.type !== 'code') {
      return segment
    }

    const limitedSnippet = clampCodeSnippetLines(segment.content, maxLines)
    return {
      ...segment,
      content: limitedSnippet.content,
      isTrimmedForGuidance: limitedSnippet.wasTrimmed,
    }
  })
}

export {
  MENTOR_SNIPPET_MAX_LINES,
  MENTOR_SNIPPET_TRUNCATION_NOTE,
  clampCodeSnippetLines,
  limitMentorSnippetSegments,
}
