import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProjectTitleFallback,
  getProjectDisplayTitle,
  sanitizeProjectTitle,
} from '../src/lib/projectTitle.js'

test('buildProjectTitleFallback creates deterministic 3+ word title', () => {
  const title = buildProjectTitleFallback('Build weather dashboard')
  assert.equal(title, 'Weather dashboard project')
})

test('sanitizeProjectTitle trims markdown noise and clamps to 7 words', () => {
  const title = sanitizeProjectTitle(
    '### "Create a very detailed personal productivity dashboard with analytics and reminders"',
    'fallback description',
  )

  assert.equal(title, 'Create a very detailed personal productivity dashboard')
})

test('sanitizeProjectTitle falls back when title is too short', () => {
  const title = sanitizeProjectTitle('todo app', 'Plan tasks quickly')
  assert.equal(title, 'Plan tasks quickly')
})

test('getProjectDisplayTitle prefers stored title and falls back to description', () => {
  const explicit = getProjectDisplayTitle({
    title: 'Build collaborative roadmap editor',
    description: 'unused',
  })
  const derived = getProjectDisplayTitle({
    title: '',
    description: 'Create a chat interface for student mentors',
  })

  assert.equal(explicit, 'Build collaborative roadmap editor')
  assert.equal(derived, 'A chat interface for student mentors')
})

