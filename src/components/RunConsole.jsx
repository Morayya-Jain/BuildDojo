import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buttonDanger, buttonPrimary, buttonSecondary, sizeSm } from '../lib/buttonStyles'
import {
  EXTERNAL_PLAYGROUNDS,
  LANGUAGE_CHOICES,
  canRunInConsole,
  getProjectLanguageChoices,
  isPreviewLanguage,
  normalizeRunnableCode,
  prettyLanguageName,
  resolveRuntimeLanguage,
  sanitizeLanguage,
} from '../lib/runtimeUtils'
import { bundleProjectFiles, hasModuleSyntax } from '../lib/bundler'
import {
  createJavascriptWorkerScript,
  createPythonWorkerScript,
  PYODIDE_BASE_URL,
} from '../lib/workerScripts'

let sqlRuntimePromise = null

function toText(value) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value == null) {
    return 'undefined'
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}


function extractTypeScriptDiagnostics(tsApi, diagnostics = []) {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === tsApi.DiagnosticCategory.Error,
  )

  return errors.map((diagnostic) => {
    const message = tsApi.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

    if (!diagnostic.file || typeof diagnostic.start !== 'number') {
      return message
    }

    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start,
    )

    return `Line ${line + 1}, Col ${character + 1}: ${message}`
  })
}

async function getSqlRuntime() {
  if (!sqlRuntimePromise) {
    sqlRuntimePromise = (async () => {
      const [{ default: initSqlJs }, { default: sqlWasmUrl }] = await Promise.all([
        import('sql.js'),
        import('sql.js/dist/sql-wasm.wasm?url'),
      ])

      return initSqlJs({ locateFile: () => sqlWasmUrl })
    })()
  }

  return sqlRuntimePromise
}

function formatSqlResultSet(resultSet) {
  const columns = resultSet.columns || []
  const values = resultSet.values || []

  if (columns.length === 0) {
    return 'No rows returned.'
  }

  const lines = []
  lines.push(columns.join(' | '))
  lines.push(columns.map(() => '---').join(' | '))

  const maxRows = 20
  values.slice(0, maxRows).forEach((row) => {
    lines.push(row.map((value) => toText(value)).join(' | '))
  })

  if (values.length > maxRows) {
    lines.push(`... ${values.length - maxRows} more row(s)`)
  }

  return lines.join('\n')
}

function RunConsole({
  code,
  detectedLanguage,
  fileLanguage = '',
  lockedLanguage = '',
  projectLanguages = null,
  projectFiles = [],
  activeFilePath = '',
  hasLockedLanguageMismatch = false,
  onResolveLockedLanguageMismatch = null,
  onRunPreview,
  onCheckCode = null,
  fillHeight = false,
}) {
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [outputLines, setOutputLines] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [isPreparingRuntime, setIsPreparingRuntime] = useState(false)

  const [elapsedMs, setElapsedMs] = useState(0)

  const isMountedRef = useRef(true)
  const workersRef = useRef({ javascript: null, python: null })
  const pendingWorkerRunRef = useRef(null)
  const sqlCancelTokenRef = useRef(null)
  const runCounterRef = useRef(0)
  const pythonRunCountRef = useRef(0)
  const timerIntervalRef = useRef(null)
  const outputPanelRef = useRef(null)

  const normalizedLockedLanguage = sanitizeLanguage(lockedLanguage)
  const normalizedFileLanguage = sanitizeLanguage(fileLanguage)
  const normalizedDetectedLanguage = sanitizeLanguage(detectedLanguage)
  const resolvedLanguage = resolveRuntimeLanguage({
    detectedLanguage: normalizedDetectedLanguage || detectedLanguage,
    selectedLanguage,
    lockedLanguage: normalizedLockedLanguage,
  })
  const languageSelectValue = normalizedLockedLanguage || selectedLanguage

  const isJavascript = resolvedLanguage === 'javascript'
  const isTypescript = resolvedLanguage === 'typescript'
  const isPython = resolvedLanguage === 'python'
  const isSql = resolvedLanguage === 'sql'
  const isHtml = isPreviewLanguage(resolvedLanguage)
  const isConsoleRunnable = canRunInConsole(resolvedLanguage)
  const canTriggerPreview = isHtml && typeof onRunPreview === 'function'
  const isLanguageSelectorLocked = Boolean(normalizedLockedLanguage)
  const showLockedLanguageMismatchNotice = Boolean(
    normalizedLockedLanguage && hasLockedLanguageMismatch,
  )

  const languageChoices = useMemo(() => {
    // Start from a project-filtered set (or all defaults when no lock is set).
    const base = getProjectLanguageChoices(projectLanguages)
    // Always include the task-locked language even if it's outside the project set.
    if (normalizedLockedLanguage && !base.some((c) => c.value === normalizedLockedLanguage)) {
      return [...base, { value: normalizedLockedLanguage, label: prettyLanguageName(normalizedLockedLanguage) }]
    }
    return base
  }, [normalizedLockedLanguage, projectLanguages])

  const openOutputPanel = useCallback(({ scroll = false, behavior = 'smooth' } = {}) => {
    if (!scroll || typeof window === 'undefined') {
      return
    }

    window.setTimeout(() => {
      outputPanelRef.current?.scrollIntoView({
        behavior,
        block: 'start',
      })
    }, 0)
  }, [])

  const appendLine = useCallback(
    (type, message) => {
      setOutputLines((prev) => [
        ...prev,
        {
          type,
          message,
        },
      ])

      if (type === 'runtime_error' || type === 'stderr') {
        openOutputPanel({ scroll: true })
      }
    },
    [openOutputPanel],
  )

  const replaceOutput = useCallback((lines) => {
    setOutputLines(Array.isArray(lines) ? lines : [])
  }, [])

  const clearOutput = useCallback(() => {
    setOutputLines([])
  }, [])

  const startTimer = useCallback(() => {
    setElapsedMs(0)
    clearInterval(timerIntervalRef.current)
    const start = Date.now()
    timerIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - start)
    }, 100)
  }, [])

  const stopTimer = useCallback(() => {
    clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = null
  }, [])

  const terminateWorker = useCallback((kind) => {
    const worker = workersRef.current[kind]
    if (!worker) {
      return
    }

    worker.terminate()
    workersRef.current[kind] = null
  }, [])

  const finishWorkerRun = useCallback((kind, runId) => {
    const pending = pendingWorkerRunRef.current

    if (!pending || pending.kind !== kind || pending.runId !== runId) {
      return
    }

    clearTimeout(pending.timeoutId)
    pendingWorkerRunRef.current = null
    stopTimer()

    if (!isMountedRef.current) {
      return
    }

    setIsRunning(false)
    setIsPreparingRuntime(false)
  }, [stopTimer])

  const createWorker = useCallback(
    (kind) => {
      const script =
        kind === 'python'
          ? createPythonWorkerScript(PYODIDE_BASE_URL)
          : createJavascriptWorkerScript()

      const workerBlob = new Blob([script], {
        type: 'application/javascript',
      })

      const workerUrl = URL.createObjectURL(workerBlob)
      const worker = new Worker(workerUrl)
      URL.revokeObjectURL(workerUrl)

      worker.onmessage = (event) => {
        const { runId, type, text } = event.data || {}
        const pending = pendingWorkerRunRef.current

        if (!pending || pending.kind !== kind || pending.runId !== runId) {
          return
        }

        const normalizedText = toText(text)
        appendLine(type || 'log', normalizedText)

        const lowerText = normalizedText.toLowerCase()
        if (type === 'info' && lowerText.includes('preparing')) {
          setIsPreparingRuntime(true)
        }

        if (type === 'info' && lowerText.includes('ready')) {
          setIsPreparingRuntime(false)
        }

        if (type === 'done' || type === 'runtime_error') {
          finishWorkerRun(kind, runId)
        }
      }

      worker.onerror = (event) => {
        const pending = pendingWorkerRunRef.current

        if (!pending || pending.kind !== kind) {
          return
        }

        appendLine('runtime_error', event.message || 'Worker runtime error.')
        terminateWorker(kind)
        finishWorkerRun(kind, pending.runId)
      }

      workersRef.current[kind] = worker
      return worker
    },
    [appendLine, finishWorkerRun, terminateWorker],
  )

  const getWorker = useCallback(
    (kind) => {
      const existing = workersRef.current[kind]
      if (existing) {
        return existing
      }

      return createWorker(kind)
    },
    [createWorker],
  )

  const runInWorker = useCallback(
    async ({ kind, sourceCode, timeoutMs }) => {
      if (pendingWorkerRunRef.current) {
        return
      }

      try {
        setIsRunning(true)
        setIsPreparingRuntime(kind === 'python')
        setOutputLines([])
        startTimer()

        if (kind === 'python') {
          pythonRunCountRef.current += 1
          if (pythonRunCountRef.current > 10) {
            terminateWorker('python')
            pythonRunCountRef.current = 0
          }
        }

        const worker = getWorker(kind)
        const runId = runCounterRef.current + 1
        runCounterRef.current = runId

        const timeoutId = window.setTimeout(() => {
          const pending = pendingWorkerRunRef.current

          if (!pending || pending.kind !== kind || pending.runId !== runId) {
            return
          }

          appendLine(
            'runtime_error',
            `Execution timed out after ${timeoutMs / 1000} seconds.`,
          )
          terminateWorker(kind)
          finishWorkerRun(kind, runId)
        }, timeoutMs)

        pendingWorkerRunRef.current = {
          kind,
          runId,
          timeoutId,
        }

        worker.postMessage({
          command: 'run',
          runId,
          code: sourceCode || '',
        })
      } catch (error) {
        appendLine('runtime_error', error.message || 'Could not start runtime worker.')
        setIsRunning(false)
        setIsPreparingRuntime(false)
      }
    },
    [appendLine, finishWorkerRun, getWorker, startTimer, terminateWorker],
  )

  const runSqlCode = useCallback(
    async (sourceCode) => {
      if (sqlCancelTokenRef.current && !sqlCancelTokenRef.current.cancelled) {
        return
      }

      const token = {
        id: runCounterRef.current + 1,
        cancelled: false,
      }
      runCounterRef.current = token.id
      sqlCancelTokenRef.current = token

      setIsRunning(true)
      setIsPreparingRuntime(true)
      setOutputLines([])
      startTimer()

      let db = null

      try {
        appendLine('info', 'Preparing SQL runtime...')
        const SQL = await getSqlRuntime()

        if (token.cancelled) {
          appendLine('warn', 'SQL execution stopped.')
          return
        }

        setIsPreparingRuntime(false)
        appendLine('info', 'SQL runtime ready.')

        db = new SQL.Database()
        const statements = sourceCode
          .split(';')
          .map((statement) => statement.trim())
          .filter(Boolean)

        if (statements.length === 0) {
          appendLine('warn', 'No SQL statements found.')
          return
        }

        for (let index = 0; index < statements.length; index += 1) {
          if (token.cancelled) {
            appendLine('warn', 'SQL execution stopped.')
            break
          }

          const statement = statements[index]

          try {
            const sql = `${statement};`
            const resultSets = db.exec(sql)

            if (resultSets.length === 0) {
              appendLine('info', `Statement ${index + 1} executed successfully.`)
              continue
            }

            resultSets.forEach((resultSet, resultIndex) => {
              appendLine(
                'result',
                `Statement ${index + 1}, Result ${resultIndex + 1}:\n${formatSqlResultSet(resultSet)}`,
              )
            })
          } catch (error) {
            appendLine(
              'runtime_error',
              `Statement ${index + 1} failed: ${error.message || 'Unknown SQL error.'}`,
            )
          }
        }
      } catch (error) {
        appendLine('runtime_error', error.message || 'Could not run SQL code.')
      } finally {
        if (db) {
          db.close()
        }

        if (sqlCancelTokenRef.current?.id === token.id) {
          sqlCancelTokenRef.current = null
        }

        stopTimer()

        if (isMountedRef.current) {
          setIsRunning(false)
          setIsPreparingRuntime(false)
        }
      }
    },
    [appendLine, startTimer, stopTimer],
  )

  const handleStop = useCallback(() => {
    const pending = pendingWorkerRunRef.current
    if (pending) {
      terminateWorker(pending.kind)
      finishWorkerRun(pending.kind, pending.runId)
      stopTimer()
      appendLine('warn', 'Execution stopped by user.')
    }

    if (sqlCancelTokenRef.current && !sqlCancelTokenRef.current.cancelled) {
      sqlCancelTokenRef.current.cancelled = true
      stopTimer()
      appendLine('warn', 'SQL execution stopped by user.')
      setIsRunning(false)
      setIsPreparingRuntime(false)
    }
  }, [appendLine, finishWorkerRun, stopTimer, terminateWorker])

  const handleRunCode = useCallback(async () => {
    openOutputPanel({ scroll: true })

    try {
      if (canTriggerPreview) {
        await onRunPreview()
        replaceOutput([
          {
            type: 'info',
            message: 'Preview refreshed.',
          },
        ])
        return
      }

      const normalized = normalizeRunnableCode(code, resolvedLanguage)

      if (!normalized.ok) {
        replaceOutput([
          {
            type: 'warn',
            message: normalized.message,
          },
        ])
        return
      }

      if (isJavascript) {
        let sourceCode = normalized.code

        // Bundle with esbuild if code has import/require and we have multiple project files
        if (hasModuleSyntax(sourceCode) && projectFiles.length > 1 && activeFilePath) {
          appendLine('info', 'Bundling modules...')
          const bundled = await bundleProjectFiles(projectFiles, activeFilePath)
          if (!bundled.ok) {
            replaceOutput(
              (bundled.errors || ['Bundling failed.']).map((message) => ({
                type: 'runtime_error',
                message,
              })),
            )
            return
          }
          sourceCode = bundled.code
        }

        await runInWorker({
          kind: 'javascript',
          sourceCode,
          timeoutMs: 5000,
        })
        return
      }

      if (isTypescript) {
        const tsModule = await import('typescript')
        const tsApi = tsModule.default || tsModule

        const transpileResult = tsApi.transpileModule(normalized.code, {
          reportDiagnostics: true,
          compilerOptions: {
            module: tsApi.ModuleKind.ESNext,
            target: tsApi.ScriptTarget.ES2020,
          },
        })

        const diagnostics = extractTypeScriptDiagnostics(
          tsApi,
          transpileResult.diagnostics,
        )

        if (diagnostics.length > 0) {
          replaceOutput(diagnostics.map((message) => ({ type: 'runtime_error', message })))
          return
        }

        let tsSourceCode = transpileResult.outputText

        // Bundle transpiled TypeScript if it has import/require
        if (hasModuleSyntax(tsSourceCode) && projectFiles.length > 1 && activeFilePath) {
          appendLine('info', 'Bundling modules...')
          const bundled = await bundleProjectFiles(
            projectFiles.map((f) =>
              f.path === activeFilePath ? { ...f, content: tsSourceCode } : f,
            ),
            activeFilePath,
          )
          if (!bundled.ok) {
            replaceOutput(
              (bundled.errors || ['Bundling failed.']).map((message) => ({
                type: 'runtime_error',
                message,
              })),
            )
            return
          }
          tsSourceCode = bundled.code
        }

        await runInWorker({
          kind: 'javascript',
          sourceCode: tsSourceCode,
          timeoutMs: 5000,
        })
        return
      }

      if (isPython) {
        await runInWorker({
          kind: 'python',
          sourceCode: normalized.code,
          timeoutMs: 20000,
        })
        return
      }

      if (isSql) {
        await runSqlCode(normalized.code)
      }
    } catch (error) {
      replaceOutput([
        {
          type: 'runtime_error',
          message: error.message || 'Could not run code.',
        },
      ])
      setIsRunning(false)
      setIsPreparingRuntime(false)
    }
  }, [
    openOutputPanel,
    code,
    isJavascript,
    canTriggerPreview,
    isPython,
    isSql,
    isTypescript,
    resolvedLanguage,
    onRunPreview,
    replaceOutput,
    runInWorker,
    runSqlCode,
    projectFiles,
    activeFilePath,
    appendLine,
  ])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false

      const pending = pendingWorkerRunRef.current
      if (pending) {
        clearTimeout(pending.timeoutId)
      }

      pendingWorkerRunRef.current = null

      if (sqlCancelTokenRef.current) {
        sqlCancelTokenRef.current.cancelled = true
      }

      terminateWorker('javascript')
      terminateWorker('python')
      clearInterval(timerIntervalRef.current)
    }
  }, [terminateWorker])

  // Keyboard shortcut: Ctrl/Cmd + Enter to run code
  // Only fires when not focused on text inputs, textareas, or contenteditable elements
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        const tag = event.target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) {
          return
        }
        event.preventDefault()
        if (!isRunning) {
          handleRunCode()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleRunCode, isRunning])

  const runButtonText = useMemo(() => {
    if (!isRunning) {
      if (isPython) {
        return 'Run Python'
      }

      if (isSql) {
        return 'Run SQL'
      }

      if (isTypescript) {
        return 'Run TypeScript'
      }

      if (canTriggerPreview) {
        return 'Refresh Preview'
      }

      return 'Run Code'
    }

    if (isPreparingRuntime) {
      return 'Preparing runtime...'
    }

    return 'Running...'
  }, [canTriggerPreview, isPreparingRuntime, isPython, isRunning, isSql, isTypescript])

  const compactActionButtonClass = 'px-2.5 py-1 text-xs leading-5'
  const containerClass = fillHeight
    ? 'flex min-h-0 flex-1 flex-col gap-2 border border-slate-300 bg-white p-2'
    : 'flex flex-col gap-2 border border-slate-300 bg-white p-2'
  const outputPanelClass = fillHeight
    ? 'min-h-32 flex-1 overflow-auto border bg-slate-950 p-2 font-mono text-sm whitespace-pre-wrap text-slate-100'
    : 'max-h-60 min-h-32 overflow-auto border bg-slate-950 p-2 font-mono text-sm whitespace-pre-wrap text-slate-100'

  return (
    <section className={containerClass}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2">
        <label htmlFor="runtime-language" className="text-xs text-slate-700">
          Language
        </label>
        <select
          id="runtime-language"
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none"
          value={languageSelectValue}
          onChange={(event) => setSelectedLanguage(event.target.value)}
          disabled={isRunning || isLanguageSelectorLocked}
        >
          {languageChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`${buttonPrimary} ${sizeSm} ${compactActionButtonClass}`}
          onClick={handleRunCode}
          disabled={isRunning || (!isConsoleRunnable && !canTriggerPreview)}
          title={!isConsoleRunnable && !canTriggerPreview ? `Run is not supported for ${prettyLanguageName(resolvedLanguage)} in the browser` : undefined}
        >
          {runButtonText}
        </button>

        {isRunning ? (
          <button
            type="button"
            className={`${buttonDanger} ${sizeSm} ${compactActionButtonClass}`}
            onClick={handleStop}
          >
            Stop
          </button>
        ) : null}

        <button
          type="button"
          className={`${buttonSecondary} ${sizeSm} ${compactActionButtonClass}`}
          onClick={clearOutput}
          disabled={outputLines.length === 0}
        >
          Clear Output
        </button>

        <button
          type="button"
          className={`${buttonSecondary} ${sizeSm} ${compactActionButtonClass}`}
          onClick={() => openOutputPanel({ scroll: true })}
        >
          Open Output
        </button>

        {isRunning && elapsedMs > 0 ? (
          <span className="text-xs text-slate-500">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>

      {showLockedLanguageMismatchNotice ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>
            This task is locked to{' '}
            <strong>{prettyLanguageName(normalizedLockedLanguage)}</strong>, but the active file
            appears to be <strong>{prettyLanguageName(normalizedFileLanguage || 'n/a')}</strong>.
          </p>
          <button
            type="button"
            className={`${buttonSecondary} ${sizeSm} w-fit border-amber-400 bg-white text-amber-900 hover:border-amber-500 hover:bg-amber-100`}
            onClick={() => onResolveLockedLanguageMismatch?.()}
            disabled={isRunning || typeof onResolveLockedLanguageMismatch !== 'function'}
          >
            Switch/Create {prettyLanguageName(normalizedLockedLanguage)} file
          </button>
        </div>
      ) : null}

      <div
        id="run-output-console"
        ref={outputPanelRef}
        className={outputPanelClass}
        role="log"
        aria-live="polite"
      >
        {!isConsoleRunnable && !canTriggerPreview ? (
          <div className="flex flex-col gap-3">
            <p className="text-slate-400">
              Browser execution is not available for {prettyLanguageName(resolvedLanguage)}.
            </p>
            {typeof onCheckCode === 'function' ? (
              <button
                type="button"
                className={`${buttonPrimary} ${sizeSm} w-fit`}
                onClick={onCheckCode}
              >
                Ask Mentor to Review
              </button>
            ) : null}
            {EXTERNAL_PLAYGROUNDS[resolvedLanguage] ? (
              <p className="text-xs text-slate-500">
                Try it online:{' '}
                <a
                  href={EXTERNAL_PLAYGROUNDS[resolvedLanguage].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 underline hover:text-emerald-300"
                >
                  {EXTERNAL_PLAYGROUNDS[resolvedLanguage].label}
                </a>
              </p>
            ) : null}
            <p className="text-[11px] text-slate-600">
              Cloud execution coming soon.
            </p>
          </div>
        ) : outputLines.length === 0 ? (
          <p className="text-slate-300">Run your code to see output.</p>
        ) : (
          outputLines.map((line, index) => (
            <p
              key={`${line.type}-${index}`}
              className={
                line.type === 'runtime_error' || line.type === 'stderr'
                  ? 'text-red-300'
                  : line.type === 'warn'
                    ? 'text-amber-300'
                    : line.type === 'result'
                      ? 'text-emerald-300'
                      : 'text-slate-100'
              }
            >
              <strong>{line.type}:</strong> {line.message}
            </p>
          ))
        )}
      </div>
    </section>
  )
}

export default RunConsole
