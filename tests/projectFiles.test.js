import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDefaultProjectFiles,
  createStarterFileForLanguage,
  findFirstFileByLanguage,
  runtimeLanguageFromPath,
} from '../src/lib/projectFiles.js'

test('runtimeLanguageFromPath maps core runnable extensions', () => {
  assert.equal(runtimeLanguageFromPath('main.py'), 'python')
  assert.equal(runtimeLanguageFromPath('db/query.sql'), 'sql')
  assert.equal(runtimeLanguageFromPath('src/app.ts'), 'typescript')
  assert.equal(runtimeLanguageFromPath('src/app.tsx'), 'typescript')
  assert.equal(runtimeLanguageFromPath('index.html'), 'html')
  assert.equal(runtimeLanguageFromPath('styles/site.css'), 'html')
  assert.equal(runtimeLanguageFromPath('main.js'), 'javascript')
  assert.equal(runtimeLanguageFromPath('main.mjs'), 'javascript')
})

test('runtimeLanguageFromPath maps additional extensions for syntax/runtime hints', () => {
  assert.equal(runtimeLanguageFromPath('Program.java'), 'java')
  assert.equal(runtimeLanguageFromPath('server/main.go'), 'go')
  assert.equal(runtimeLanguageFromPath('src/lib.rs'), 'rust')
  assert.equal(runtimeLanguageFromPath('script.rb'), 'ruby')
  assert.equal(runtimeLanguageFromPath('index.php'), 'php')
  assert.equal(runtimeLanguageFromPath('Source.swift'), 'swift')
  assert.equal(runtimeLanguageFromPath('build.gradle.kts'), 'kotlin')
  assert.equal(runtimeLanguageFromPath('Program.CS'), 'csharp')
})

test('runtimeLanguageFromPath returns empty for unknown or invalid paths', () => {
  assert.equal(runtimeLanguageFromPath('README'), '')
  assert.equal(runtimeLanguageFromPath('notes.txt'), '')
  assert.equal(runtimeLanguageFromPath('../unsafe.py'), '')
})

test('createDefaultProjectFiles honors preferred runtime language lock', () => {
  const files = createDefaultProjectFiles('Build a React dashboard app', '', 'python')
  assert.equal(files.length, 1)
  assert.equal(files[0].path, 'main.py')
  assert.equal(files[0].language, 'python')
})

test('createDefaultProjectFiles supports preferred non-runnable language locks', () => {
  const files = createDefaultProjectFiles('Build a React dashboard app', '', 'java')
  assert.equal(files.length, 1)
  assert.equal(files[0].path, 'Main.java')
  assert.equal(files[0].language, 'java')
})

test('createDefaultProjectFiles keeps existing behavior when no preferred language is supplied', () => {
  const files = createDefaultProjectFiles('Build a React dashboard app', '')
  assert.equal(files.length, 1)
  assert.equal(files[0].path, 'main.js')
  assert.equal(files[0].language, 'javascript')
})

test('findFirstFileByLanguage matches by extension-derived runtime', () => {
  const files = [
    { path: 'main.js', content: '' },
    { path: 'src/main.py', content: '' },
  ]

  const matched = findFirstFileByLanguage(files, 'python')
  assert.equal(matched?.path, 'src/main.py')
})

test('createStarterFileForLanguage creates unique fallback paths when needed', () => {
  const starter = createStarterFileForLanguage('python', [{ path: 'main.py', content: '' }])
  assert.equal(starter?.path, 'main-2.py')
  assert.equal(starter?.language, 'python')
  assert.match(starter?.content || '', /Start coding here/i)
})
