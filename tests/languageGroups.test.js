import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLanguageGroups } from '../src/hooks/useGemini.js'

test('normalizeLanguageGroups preserves valid groups', () => {
  const input = [['javascript', 'html'], ['python'], ['java']]
  const result = normalizeLanguageGroups(input)
  assert.deepEqual(result, [['javascript', 'html'], ['python'], ['java']])
})

test('normalizeLanguageGroups returns all languages as fallback for empty input', () => {
  const result = normalizeLanguageGroups([])
  assert.equal(result.length, 13, 'should return all 13 supported languages')
  assert.ok(result.every((g) => Array.isArray(g) && g.length === 1), 'fallback groups should be single-element')
  assert.ok(result.some((g) => g[0] === 'javascript'), 'should include javascript')
  assert.ok(result.some((g) => g[0] === 'python'), 'should include python')
  assert.ok(result.some((g) => g[0] === 'html'), 'should include html')
})

test('normalizeLanguageGroups returns all languages as fallback for null input', () => {
  const result = normalizeLanguageGroups(null)
  assert.equal(result.length, 13)
})

test('normalizeLanguageGroups returns all languages as fallback for non-array input', () => {
  const result = normalizeLanguageGroups('javascript')
  assert.equal(result.length, 13)
})

test('normalizeLanguageGroups strips invalid language IDs', () => {
  const input = [['javascript', 'fakeLang'], ['python']]
  const result = normalizeLanguageGroups(input)
  assert.deepEqual(result, [['javascript'], ['python']])
})

test('normalizeLanguageGroups removes empty groups after sanitization', () => {
  const input = [['fakeLang1', 'fakeLang2'], ['python']]
  const result = normalizeLanguageGroups(input)
  assert.deepEqual(result, [['python']])
})

test('normalizeLanguageGroups deduplicates identical groups', () => {
  const input = [['javascript', 'html'], ['javascript', 'html'], ['python']]
  const result = normalizeLanguageGroups(input)
  assert.deepEqual(result, [['javascript', 'html'], ['python']])
})

test('normalizeLanguageGroups deduplicates groups regardless of order', () => {
  const input = [['html', 'javascript'], ['javascript', 'html']]
  const result = normalizeLanguageGroups(input)
  assert.equal(result.length, 1)
})

test('normalizeLanguageGroups skips non-array group entries', () => {
  const input = ['javascript', ['python'], null, ['java']]
  const result = normalizeLanguageGroups(input)
  assert.deepEqual(result, [['python'], ['java']])
})

test('normalizeLanguageGroups returns all languages as fallback when all groups become empty', () => {
  const input = [['fakeLang'], ['anotherFake']]
  const result = normalizeLanguageGroups(input)
  assert.equal(result.length, 13)
})
