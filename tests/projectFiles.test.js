import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ZIP_IMPORT_LIMITS,
  buildPreviewSrcDoc,
  createDefaultProjectFiles,
  createStarterFileForLanguage,
  findFirstFileByLanguage,
  runtimeLanguageFromPath,
  validateZipImportFileDescriptors,
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

test('buildPreviewSrcDoc injects browser-executable JavaScript', () => {
  const html = buildPreviewSrcDoc([
    { path: 'index.html', content: '<!doctype html><html><body></body></html>' },
    { path: 'script.js', content: 'console.log("ok")' },
  ])

  assert.match(html, /injected-preview/)
  assert.match(html, /console\.log\("ok"\)/)
})

test('buildPreviewSrcDoc excludes TypeScript from injected script content', () => {
  const html = buildPreviewSrcDoc([
    { path: 'index.html', content: '<!doctype html><html><body></body></html>' },
    { path: 'script.ts', content: 'const value: number = 1' },
    { path: 'script.js', content: 'console.log("safe")' },
  ])

  assert.match(html, /console\.log\("safe"\)/)
  assert.doesNotMatch(html, /const value: number = 1/)
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

test('validateZipImportFileDescriptors accepts valid small descriptor sets', () => {
  const descriptors = [
    { path: 'src/main.js', sizeBytes: 1024 },
    { path: 'src/utils.js', sizeBytes: 2048 },
  ]

  const result = validateZipImportFileDescriptors(descriptors, ZIP_IMPORT_LIMITS)
  assert.equal(result.error, null)
  assert.equal(result.data?.estimatedTotalBytes, 3072)
})

test('validateZipImportFileDescriptors rejects descriptor count above limit', () => {
  const result = validateZipImportFileDescriptors(
    Array.from({ length: 3 }, (_, index) => ({
      path: `file-${index}.txt`,
      sizeBytes: 1,
    })),
    { ...ZIP_IMPORT_LIMITS, maxFileCount: 2 },
  )

  assert.match(result.error?.message || '', /too many files/i)
})

test('validateZipImportFileDescriptors rejects single descriptor above per-file size limit', () => {
  const result = validateZipImportFileDescriptors(
    [{ path: 'huge.txt', sizeBytes: 600 * 1024 }],
    { ...ZIP_IMPORT_LIMITS, maxFileBytes: 512 * 1024 },
  )

  assert.match(result.error?.message || '', /too large/i)
  assert.match(result.error?.message || '', /huge\.txt/i)
})

test('validateZipImportFileDescriptors rejects cumulative descriptor size above total limit', () => {
  const result = validateZipImportFileDescriptors(
    [
      { path: 'one.txt', sizeBytes: 4 * 1024 * 1024 },
      { path: 'two.txt', sizeBytes: 3 * 1024 * 1024 },
    ],
    {
      ...ZIP_IMPORT_LIMITS,
      maxFileBytes: 10 * 1024 * 1024,
      maxTotalBytes: 5 * 1024 * 1024,
    },
  )

  assert.match(result.error?.message || '', /total limit/i)
})
