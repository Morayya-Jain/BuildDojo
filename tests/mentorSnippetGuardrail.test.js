import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MENTOR_SNIPPET_MAX_LINES,
  clampCodeSnippetLines,
  limitMentorSnippetSegments,
} from '../src/lib/mentorSnippetGuardrail.js'
import { parseRichTextSegments } from '../src/lib/richTextParser.js'

test('clampCodeSnippetLines trims code content above the max line count', () => {
  const source = ['1', '2', '3', '4', '5', '6', '7'].join('\n')
  const limited = clampCodeSnippetLines(source, MENTOR_SNIPPET_MAX_LINES)

  assert.equal(limited.wasTrimmed, true)
  assert.equal(limited.lineCount, 7)
  assert.equal(limited.content, ['1', '2', '3', '4', '5', '6'].join('\n'))
})

test('clampCodeSnippetLines preserves snippets that are already short enough', () => {
  const source = ['const x = 1;', 'console.log(x);'].join('\n')
  const limited = clampCodeSnippetLines(source, MENTOR_SNIPPET_MAX_LINES)

  assert.equal(limited.wasTrimmed, false)
  assert.equal(limited.lineCount, 2)
  assert.equal(limited.content, source)
})

test('limitMentorSnippetSegments caps multiple code snippets independently', () => {
  const input = [
    'Intro text.',
    '```javascript',
    'line1',
    'line2',
    'line3',
    'line4',
    'line5',
    'line6',
    'line7',
    '```',
    'More context.',
    '```python',
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
    '```',
  ].join('\n')
  const segments = parseRichTextSegments(input)
  const limited = limitMentorSnippetSegments(segments, MENTOR_SNIPPET_MAX_LINES)
  const codeSegments = limited.filter((segment) => segment.type === 'code')

  assert.equal(codeSegments.length, 2)
  assert.equal(codeSegments[0].content.split('\n').length, MENTOR_SNIPPET_MAX_LINES)
  assert.equal(codeSegments[1].content.split('\n').length, MENTOR_SNIPPET_MAX_LINES)
  assert.equal(codeSegments[0].isTrimmedForGuidance, true)
  assert.equal(codeSegments[1].isTrimmedForGuidance, true)
})

test('limitMentorSnippetSegments leaves prose segments unchanged', () => {
  const textSegment = { type: 'text', content: 'Explain your reasoning.' }
  const segments = [textSegment, { type: 'code', content: 'x = 1', language: 'python' }]
  const limited = limitMentorSnippetSegments(segments, MENTOR_SNIPPET_MAX_LINES)

  assert.equal(limited[0], textSegment)
  assert.equal(limited[1].isTrimmedForGuidance, false)
  assert.equal(limited[1].content, 'x = 1')
})
