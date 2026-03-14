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

function isLikelySentence(line) {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }

  return (
    /^[A-Za-z]/.test(trimmed) &&
    /[.?!]$/.test(trimmed) &&
    !/[{}()[\];=<>&]/.test(trimmed)
  )
}

function isCodeLikeLine(line) {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }

  if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return false
  }

  if (/^>{1,}\s+/.test(trimmed) || /^#{1,6}\s+/.test(trimmed)) {
    return false
  }

  if (isLikelySentence(trimmed)) {
    return false
  }

  if (/^<\/?[a-z][\w-]*(\s+[^>]*)?>$/i.test(trimmed)) {
    return true
  }

  if (/[{}()[\];]/.test(trimmed)) {
    return true
  }

  if (/(=>|===|!==|:=|::|\+\+|--|&&|\|\|)/.test(trimmed)) {
    return true
  }

  if (
    /^\s*(const|let|var|function|if|else|for|while|switch|case|return|class|import|export|from|async|await|try|catch|throw|new|def|print|lambda|select|insert|update|delete|create|alter|drop|with|where|join|public|private|protected|interface|type|enum)\b/i.test(
      trimmed,
    )
  ) {
    return true
  }

  if (/\b(console\.log|document\.|window\.|setTimeout|fetch)\b/.test(trimmed)) {
    return true
  }

  if (/^[\w$.]+\([^)]*\)\s*;?$/.test(trimmed)) {
    return true
  }

  if (/^[\w$]+\s*=\s*.+/.test(trimmed)) {
    return true
  }

  if (/^\s{2,}\S+/.test(line) || /^\t\S+/.test(line)) {
    return true
  }

  return false
}

function isLikelyCodeRun(lines) {
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
  if (nonEmptyLines.length < 2) {
    return false
  }

  const codeLikeCount = nonEmptyLines.filter((line) => isCodeLikeLine(line)).length
  if (codeLikeCount < 2) {
    return false
  }

  const ratio = codeLikeCount / nonEmptyLines.length
  if (ratio >= 0.75) {
    return true
  }

  if (
    ratio >= 0.6 &&
    nonEmptyLines.some((line) => /^\s{2,}\S+/.test(line) || /^\t\S+/.test(line))
  ) {
    return true
  }

  return false
}

function splitFencedCodeBlocks(text) {
  const segments = []
  const fencedRegex = /```([a-zA-Z0-9_+-]*)[ \t]*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match = fencedRegex.exec(text)

  while (match) {
    const blockStart = match.index
    const blockEnd = fencedRegex.lastIndex

    if (blockStart > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, blockStart),
      })
    }

    const language = (match[1] || '').trim().toLowerCase()
    const code = (match[2] || '').replace(/\n$/, '')
    segments.push({
      type: 'code',
      content: code,
      language,
    })

    lastIndex = blockEnd
    match = fencedRegex.exec(text)
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  if (segments.length === 0) {
    return [{ type: 'text', content: text }]
  }

  return segments
}

function splitUnfencedMultilineCode(text) {
  if (!text.includes('\n')) {
    return [{ type: 'text', content: text }]
  }

  const lines = text.split('\n')
  const segments = []
  let textBuffer = []
  let index = 0

  const flushTextBuffer = () => {
    if (textBuffer.length === 0) {
      return
    }

    segments.push({
      type: 'text',
      content: textBuffer.join('\n'),
    })
    textBuffer = []
  }

  while (index < lines.length) {
    if (lines[index].trim() === '') {
      textBuffer.push(lines[index])
      index += 1
      continue
    }

    let runEnd = index
    while (runEnd < lines.length && lines[runEnd].trim() !== '') {
      runEnd += 1
    }

    const runLines = lines.slice(index, runEnd)
    if (isLikelyCodeRun(runLines)) {
      flushTextBuffer()
      segments.push({
        type: 'code',
        content: runLines.join('\n'),
        language: '',
      })
    } else {
      textBuffer.push(...runLines)
    }

    index = runEnd
  }

  flushTextBuffer()

  if (segments.length === 0) {
    return [{ type: 'text', content: text }]
  }

  return segments
}

export function parseRichTextSegments(input) {
  const text = toText(input)

  if (!text) {
    return [{ type: 'text', content: '' }]
  }

  try {
    const segments = splitFencedCodeBlocks(text).flatMap((segment) => {
      if (segment.type !== 'text') {
        return [segment]
      }

      return splitUnfencedMultilineCode(segment.content)
    })

    if (segments.length === 0) {
      return [{ type: 'text', content: text }]
    }

    return segments
  } catch {
    return [{ type: 'text', content: text }]
  }
}

