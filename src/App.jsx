import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthScreen from './components/AuthScreen'
import CompletionScreen from './components/CompletionScreen'
import Dashboard from './components/Dashboard'
import Editor from './components/Editor'
import FeedbackPanel from './components/FeedbackPanel'
import HintBox from './components/HintBox'
import Onboarding from './components/Onboarding'
import ProgressBar from './components/ProgressBar'
import Roadmap from './components/Roadmap'
import RunConsole from './components/RunConsole'
import { useAppState } from './hooks/useAppState'
import { useAuth } from './hooks/useAuth'
import { useGemini } from './hooks/useGemini'
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  sizeSm,
} from './lib/buttonStyles'
import {
  createProject,
  markProjectIncomplete,
  getProjectTasks,
  getUserProjects,
  markProjectComplete,
  markTaskComplete as markTaskCompleteInDb,
  markTaskIncomplete as markTaskIncompleteInDb,
  saveTasks,
} from './lib/db'
import { detectLanguage } from './lib/detectLanguage'
import { sanitizeLanguage } from './lib/runtimeUtils'

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

function normalizeTask(task) {
  return {
    id: task.id,
    title: toText(task.title),
    description: toText(task.description),
    hint: toText(task.hint),
    exampleOutput: toText(task.example_output ?? task.exampleOutput ?? ''),
    language: sanitizeLanguage(task.language),
    completed: Boolean(task.completed),
    task_index: typeof task.task_index === 'number' ? task.task_index : 0,
  }
}

function App() {
  const {
    user,
    isAuthenticating,
    authError,
    authInfo,
    setAuthError,
    signIn,
    signOut,
    signUp,
    resendConfirmation,
  } = useAuth()

  const { generateRoadmap, checkUserCode, askFollowUp } = useGemini()

  const {
    user: appUser,
    currentProjectId,
    projectDescription,
    skillLevel,
    tasks,
    currentTaskIndex,
    userCode,
    feedbackHistory,
    hintsUsed,
    exampleViewed,
    isGeneratingRoadmap,
    isCheckingCode,
    isAskingFollowUp,
    isLoadingProjects,
    isAuthenticating: isAuthenticatingState,
    setUser,
    setCurrentProjectId,
    setProjectDescription,
    setSkillLevel,
    setTasks,
    setCurrentTaskIndex,
    updateUserCode,
    markTaskComplete,
    markTaskIncomplete,
    incrementHints,
    setExampleViewed,
    resetTaskSupportState,
    resetApp,
    setIsGeneratingRoadmap,
    setIsCheckingCode,
    setIsAskingFollowUp,
    setIsLoadingProjects,
    setIsAuthenticating,
    setFeedbackHistory,
  } = useAppState()

  const [projects, setProjects] = useState([])
  const [screen, setScreen] = useState('dashboard')
  const [uiError, setUiError] = useState('')
  const [isCheckingBeforeComplete, setIsCheckingBeforeComplete] = useState(false)
  const [isMarkingTaskComplete, setIsMarkingTaskComplete] = useState(false)
  const lastCheckSignatureRef = useRef('')
  const lastCheckResultRef = useRef(null)
  const lastFollowUpSignatureRef = useRef('')
  const lastFollowUpResponseRef = useRef('')

  useEffect(() => {
    setUser(user)
  }, [setUser, user])

  useEffect(() => {
    setIsAuthenticating(isAuthenticating)
  }, [isAuthenticating, setIsAuthenticating])

  const loadProjects = useCallback(
    async (userId, autoRoute = false) => {
      setIsLoadingProjects(true)

      const { data, error } = await getUserProjects(userId)

      if (error) {
        console.error(error)
        setUiError(error.message || 'Could not load projects.')
        setIsLoadingProjects(false)
        return
      }

      const safeProjects = data ?? []
      setProjects(safeProjects)

      if (autoRoute) {
        setScreen(safeProjects.length === 0 ? 'onboarding' : 'dashboard')
      }

      setIsLoadingProjects(false)
    },
    [setIsLoadingProjects],
  )

  useEffect(() => {
    if (!user) {
      setProjects([])
      setScreen('dashboard')
      resetApp()
      return
    }

    loadProjects(user.id, true)
  }, [loadProjects, resetApp, user])

  const handleSignIn = useCallback(
    async (email, password) => {
      const { error } = await signIn(email, password)
      if (error) {
        setUiError(error.message || 'Log in failed.')
        return
      }

      setUiError('')
    },
    [signIn],
  )

  const handleSignUp = useCallback(
    async (email, password) => {
      const { error } = await signUp(email, password)
      if (error) {
        setUiError(error.message || 'Sign up failed.')
        return
      }

      setUiError('')
    },
    [signUp],
  )

  const handleLogOut = useCallback(async () => {
    const { error } = await signOut()
    if (error) {
      setUiError(error.message || 'Log out failed.')
      return
    }

    resetApp()
    setProjects([])
    setScreen('dashboard')
    setUiError('')
    setAuthError(null)
  }, [resetApp, setAuthError, signOut])

  const handleResendConfirmation = useCallback(
    async (email) => {
      const { error } = await resendConfirmation(email)
      if (error) {
        setUiError(error.message || 'Could not resend confirmation email.')
        return
      }

      setUiError('')
    },
    [resendConfirmation],
  )

  const handleStartNewProject = useCallback(() => {
    resetApp()
    setUiError('')
    setScreen('onboarding')
  }, [resetApp])

  const handleGenerateRoadmap = useCallback(
    async (description, nextSkillLevel) => {
      if (!user) {
        setUiError('You must be logged in to create a project.')
        return
      }

      setUiError('')
      setIsGeneratingRoadmap(true)
      setProjectDescription(description)
      setSkillLevel(nextSkillLevel)

      try {
        const roadmapResult = await generateRoadmap(description, nextSkillLevel)
        if (roadmapResult.error) {
          setUiError(roadmapResult.error.message)
          return
        }

        const { data: projectData, error: projectError } = await createProject(
          user.id,
          description,
          nextSkillLevel,
        )

        if (projectError || !projectData) {
          console.error(projectError)
          setUiError(projectError?.message || 'Could not create project.')
          return
        }

        const { data: savedTaskData, error: saveError } = await saveTasks(
          projectData.id,
          user.id,
          roadmapResult.data,
        )

        if (saveError || !savedTaskData) {
          console.error(saveError)
          setUiError(saveError?.message || 'Could not save tasks.')
          return
        }

        const normalizedTasks = savedTaskData.map(normalizeTask)

        setCurrentProjectId(projectData.id)
        setTasks(normalizedTasks)
        setCurrentTaskIndex(0)
        resetTaskSupportState()

        await loadProjects(user.id)
        setScreen('workspace')
      } catch (error) {
        console.error(error)
        setUiError(error.message || 'Roadmap generation failed.')
      } finally {
        setIsGeneratingRoadmap(false)
      }
    },
    [
      generateRoadmap,
      loadProjects,
      resetTaskSupportState,
      setCurrentProjectId,
      setCurrentTaskIndex,
      setIsGeneratingRoadmap,
      setProjectDescription,
      setSkillLevel,
      setTasks,
      user,
    ],
  )

  const handleContinueProject = useCallback(
    async (project) => {
      setUiError('')
      setIsLoadingProjects(true)

      try {
        const { data, error } = await getProjectTasks(project.id)
        if (error) {
          console.error(error)
          setUiError(error.message || 'Could not load project tasks.')
          return
        }

        const normalizedTasks = (data ?? []).map(normalizeTask)
        const firstIncomplete = normalizedTasks.findIndex((task) => !task.completed)

        setCurrentProjectId(project.id)
        setProjectDescription(project.description)
        setSkillLevel(project.skill_level)
        setTasks(normalizedTasks)
        setCurrentTaskIndex(firstIncomplete === -1 ? 0 : firstIncomplete)
        resetTaskSupportState()

        if (firstIncomplete === -1 && normalizedTasks.length > 0) {
          setScreen('completion')
        } else {
          setScreen('workspace')
        }
      } catch (error) {
        console.error(error)
        setUiError(error.message || 'Could not continue project.')
      } finally {
        setIsLoadingProjects(false)
      }
    },
    [
      resetTaskSupportState,
      setCurrentProjectId,
      setCurrentTaskIndex,
      setIsLoadingProjects,
      setProjectDescription,
      setSkillLevel,
      setTasks,
    ],
  )

  const currentTask = tasks[currentTaskIndex] ?? null
  const lockedTaskLanguage = sanitizeLanguage(currentTask?.language)
  const detectedLanguage = useMemo(
    () => detectLanguage(projectDescription, userCode),
    [projectDescription, userCode],
  )
  const runtimeLanguage = lockedTaskLanguage || detectedLanguage

  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  )

  const isAllTasksComplete = tasks.length > 0 && completedCount === tasks.length

  const firstIncompleteIndex = useMemo(
    () => tasks.findIndex((task) => !task.completed),
    [tasks],
  )

  const handleSelectTask = useCallback(
    (taskIndex) => {
      setCurrentTaskIndex(taskIndex)
      resetTaskSupportState()
    },
    [resetTaskSupportState, setCurrentTaskIndex],
  )

  const runCodeCheck = useCallback(async ({ useCached = true } = {}) => {
    if (!currentTask) {
      return { data: null, error: new Error('No current task selected.') }
    }

    const checkSignature = `${currentTask.id}::${userCode}`

    if (
      useCached &&
      checkSignature === lastCheckSignatureRef.current &&
      lastCheckResultRef.current
    ) {
      setUiError('')
      setFeedbackHistory([{ role: 'ai', message: lastCheckResultRef.current.feedback }])
      return { data: lastCheckResultRef.current, error: null }
    }

    setUiError('')
    setIsCheckingCode(true)
    setFeedbackHistory([])

    try {
      const result = await checkUserCode(currentTask, userCode)
      if (result.error) {
        setUiError(result.error.message)
        return { data: null, error: result.error }
      }

      lastCheckSignatureRef.current = checkSignature
      lastCheckResultRef.current = result.data
      setFeedbackHistory([{ role: 'ai', message: result.data.feedback }])
      return { data: result.data, error: null }
    } catch (error) {
      console.error(error)
      const normalizedError = new Error(error.message || 'Code check failed.')
      setUiError(normalizedError.message)
      return { data: null, error: normalizedError }
    } finally {
      setIsCheckingCode(false)
    }
  }, [
    checkUserCode,
    currentTask,
    setFeedbackHistory,
    setIsCheckingCode,
    userCode,
  ])

  const handleCheckCode = useCallback(async () => {
    await runCodeCheck({ useCached: true })
  }, [runCodeCheck])

  const handleFollowUp = useCallback(
    async (userQuestion) => {
      if (!currentTask) {
        return
      }

      const normalizedQuestion = userQuestion.trim()
      const followUpSignature = `${currentTask.id}::${userCode}::${normalizedQuestion}`

      if (
        followUpSignature === lastFollowUpSignatureRef.current &&
        lastFollowUpResponseRef.current
      ) {
        setUiError('')
        setFeedbackHistory([{ role: 'ai', message: lastFollowUpResponseRef.current }])
        return
      }

      setUiError('')
      setIsAskingFollowUp(true)
      setFeedbackHistory([])

      const updatedHistory = [
        ...feedbackHistory,
        { role: 'user', message: userQuestion },
      ]

      try {
        const result = await askFollowUp(
          currentTask,
          userCode,
          userQuestion,
          updatedHistory,
        )

        if (result.error) {
          setUiError(result.error.message)
          return
        }

        lastFollowUpSignatureRef.current = followUpSignature
        lastFollowUpResponseRef.current = result.data
        setFeedbackHistory([{ role: 'ai', message: result.data }])
      } catch (error) {
        console.error(error)
        setUiError(error.message || 'Follow-up request failed.')
      } finally {
        setIsAskingFollowUp(false)
      }
    },
    [
      askFollowUp,
      currentTask,
      feedbackHistory,
      setFeedbackHistory,
      setIsAskingFollowUp,
      userCode,
    ],
  )

  useEffect(() => {
    lastCheckSignatureRef.current = ''
    lastCheckResultRef.current = null
  }, [currentTask?.id, userCode])

  useEffect(() => {
    lastFollowUpSignatureRef.current = ''
    lastFollowUpResponseRef.current = ''
  }, [currentTask?.id])

  const handleMarkCurrentTaskComplete = useCallback(async () => {
    if (!currentTask || isMarkingTaskComplete) {
      return
    }

    setUiError('')
    setIsMarkingTaskComplete(true)

    try {
      if (currentTask.completed) {
        markTaskIncomplete(currentTask.id)

        const { error: taskError } = await markTaskIncompleteInDb(currentTask.id)
        if (taskError) {
          console.error(taskError)
          setUiError(taskError.message || 'Could not undo task completion in database.')
        }

        if (currentProjectId) {
          const { error: projectError } = await markProjectIncomplete(currentProjectId)
          if (projectError) {
            console.error(projectError)
            setUiError(projectError.message || 'Could not update project completion state.')
          }
        }

        return
      }

      const checkSignature = `${currentTask.id}::${userCode}`
      let validationResult = null

      if (
        checkSignature === lastCheckSignatureRef.current &&
        lastCheckResultRef.current
      ) {
        validationResult = lastCheckResultRef.current
        setFeedbackHistory([{ role: 'ai', message: validationResult.feedback }])
      } else {
        setIsCheckingBeforeComplete(true)
        const checkResult = await runCodeCheck({ useCached: true })
        setIsCheckingBeforeComplete(false)

        if (checkResult.error || !checkResult.data) {
          return
        }

        validationResult = checkResult.data
      }

      const hasPassingValidation =
        validationResult?.status === 'PASS' && validationResult?.outputMatch === true

      if (!hasPassingValidation) {
        const validationDetails = [
          validationResult?.feedback,
          validationResult?.outputReason,
        ]
          .filter(Boolean)
          .join(' ')

        setUiError(
          validationDetails
            ? `Task is not ready to complete yet. ${validationDetails}`
            : 'Task is not ready to complete yet. Fix the check feedback and try again.',
        )
        return
      }

      const updatedTasks = tasks.map((task) =>
        task.id === currentTask.id ? { ...task, completed: true } : task,
      )

      markTaskComplete(currentTask.id)

      const { error: taskError } = await markTaskCompleteInDb(currentTask.id)
      if (taskError) {
        console.error(taskError)
        setUiError(taskError.message || 'Could not update task status in database.')
      }

      const nextTaskIndex = updatedTasks.findIndex((task) => !task.completed)

      if (nextTaskIndex === -1) {
        if (currentProjectId) {
          const { error: projectError } = await markProjectComplete(currentProjectId)
          if (projectError) {
            console.error(projectError)
            setUiError(projectError.message || 'Could not mark project complete.')
          }
        }

        if (user) {
          await loadProjects(user.id)
        }

        setScreen('completion')
        return
      }

      setCurrentTaskIndex(nextTaskIndex)
      resetTaskSupportState()
    } catch (error) {
      console.error(error)
      setUiError(error.message || 'Could not complete task.')
    } finally {
      setIsCheckingBeforeComplete(false)
      setIsMarkingTaskComplete(false)
    }
  }, [
    currentProjectId,
    currentTask,
    isMarkingTaskComplete,
    loadProjects,
    markTaskComplete,
    markTaskIncomplete,
    resetTaskSupportState,
    runCodeCheck,
    setCurrentTaskIndex,
    setFeedbackHistory,
    tasks,
    user,
    userCode,
  ])

  const handleBackToDashboard = useCallback(async () => {
    resetApp()
    setScreen('dashboard')

    if (user) {
      await loadProjects(user.id)
    }
  }, [loadProjects, resetApp, user])

  const handleReopenLastTaskFromCompletion = useCallback(async () => {
    if (isMarkingTaskComplete || tasks.length === 0) {
      return
    }

    let reopenTaskIndex = -1
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
      if (tasks[index]?.completed) {
        reopenTaskIndex = index
        break
      }
    }

    if (reopenTaskIndex === -1) {
      setUiError('No completed task is available to reopen.')
      return
    }

    const reopenTask = tasks[reopenTaskIndex]
    if (!reopenTask?.id) {
      setUiError('Could not identify which task to reopen.')
      return
    }

    setUiError('')
    setIsMarkingTaskComplete(true)

    try {
      markTaskIncomplete(reopenTask.id)

      const { error: taskError } = await markTaskIncompleteInDb(reopenTask.id)
      if (taskError) {
        markTaskComplete(reopenTask.id)
        console.error(taskError)
        setUiError(taskError.message || 'Could not reopen task in database.')
        return
      }

      if (currentProjectId) {
        const { error: projectError } = await markProjectIncomplete(currentProjectId)
        if (projectError) {
          console.error(projectError)
          setUiError(projectError.message || 'Could not update project completion state.')
        }
      }

      setCurrentTaskIndex(reopenTaskIndex)
      resetTaskSupportState()
      setScreen('workspace')
    } catch (error) {
      console.error(error)
      setUiError(error.message || 'Could not reopen task.')
    } finally {
      setIsMarkingTaskComplete(false)
    }
  }, [
    currentProjectId,
    isMarkingTaskComplete,
    markTaskComplete,
    markTaskIncomplete,
    resetTaskSupportState,
    setCurrentTaskIndex,
    tasks,
  ])

  let markAsCompleteLabel = 'Mark as Complete'
  if (isCheckingBeforeComplete) {
    markAsCompleteLabel = 'Checking before completion...'
  } else if (isMarkingTaskComplete) {
    markAsCompleteLabel = 'Updating task status...'
  } else if (currentTask?.completed) {
    markAsCompleteLabel = 'Undo Complete'
  }

  if (isAuthenticatingState) {
    return <p className="p-4">Loading auth state...</p>
  }

  if (!appUser) {
    return (
      <AuthScreen
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onResendConfirmation={handleResendConfirmation}
        isAuthenticating={isAuthenticating}
        authError={authError || uiError}
        authInfo={authInfo}
      />
    )
  }

  if (screen === 'dashboard' && tasks.length === 0 && !currentProjectId) {
    return (
      <Dashboard
        projects={projects}
        isLoadingProjects={isLoadingProjects}
        onStartNewProject={handleStartNewProject}
        onContinueProject={handleContinueProject}
        onLogOut={handleLogOut}
        onRefresh={() => loadProjects(appUser.id)}
        errorMessage={uiError}
      />
    )
  }

  if (screen === 'onboarding' && tasks.length === 0) {
    return (
      <Onboarding
        onSubmit={handleGenerateRoadmap}
        isGeneratingRoadmap={isGeneratingRoadmap}
        errorMessage={uiError}
        defaultDescription={projectDescription}
        defaultSkillLevel={skillLevel}
      />
    )
  }

  if (screen === 'completion' || isAllTasksComplete) {
    return (
      <CompletionScreen
        onBackToDashboard={handleBackToDashboard}
        onStartNew={handleStartNewProject}
        onReopenLastTask={handleReopenLastTaskFromCompletion}
        isReopeningTask={isMarkingTaskComplete}
      />
    )
  }

  return (
    <main className="p-3 flex flex-col gap-3">
      <header className="flex items-center justify-between border p-3">
        <h1 className="text-xl font-bold">AI Coding Mentor Workspace</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${buttonSecondary} ${sizeSm}`}
            onClick={handleBackToDashboard}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`${buttonDanger} ${sizeSm}`}
            onClick={handleLogOut}
          >
            Log Out
          </button>
        </div>
      </header>

      <ProgressBar completedCount={completedCount} totalCount={tasks.length} />

      {uiError && <p className="text-red-600">{uiError}</p>}
      {isLoadingProjects && <p>Loading projects...</p>}
      {isGeneratingRoadmap && <p>Generating roadmap...</p>}
      {isCheckingCode && !isCheckingBeforeComplete && <p>Checking code...</p>}
      {isCheckingBeforeComplete && <p>Checking code before completion...</p>}
      {isMarkingTaskComplete && !isCheckingBeforeComplete && <p>Updating task status...</p>}
      {isAskingFollowUp && <p>Getting mentor reply...</p>}

      <section className="grid grid-cols-1 lg:grid-cols-[300px_1fr_360px] gap-3">
        <Roadmap
          tasks={tasks}
          currentTaskIndex={currentTaskIndex}
          onSelectTask={handleSelectTask}
        />

        <div className="flex flex-col gap-3">
          <section className="border p-3">
            <h2 className="text-lg font-semibold">
              Task {currentTaskIndex + 1}: {currentTask?.title}
            </h2>
            <p className="mt-2">{currentTask?.description}</p>
            <button
              type="button"
              className={`${buttonPrimary} ${sizeSm} mt-3`}
              onClick={handleMarkCurrentTaskComplete}
              disabled={
                !currentTask ||
                isCheckingCode ||
                isCheckingBeforeComplete ||
                isMarkingTaskComplete
              }
            >
              {markAsCompleteLabel}
            </button>
          </section>

          <Editor
            projectDescription={projectDescription}
            value={userCode}
            onChange={updateUserCode}
            readOnly={Boolean(currentTask?.completed) && firstIncompleteIndex !== -1}
            language={runtimeLanguage}
          />
          <RunConsole
            key={currentTask?.id || 'run-console'}
            code={userCode}
            detectedLanguage={detectedLanguage}
            lockedLanguage={lockedTaskLanguage}
          />
        </div>

        <div className="flex flex-col gap-3">
          <HintBox
            task={currentTask}
            hintsUsed={hintsUsed}
            exampleViewed={exampleViewed}
            onGiveHint={incrementHints}
            onShowExample={() => setExampleViewed((prev) => !prev)}
            isDisabled={!currentTask}
          />
          <FeedbackPanel
            feedbackHistory={feedbackHistory}
            isCheckingCode={isCheckingCode}
            isAskingFollowUp={isAskingFollowUp}
            onCheckCode={handleCheckCode}
            onAskFollowUp={handleFollowUp}
            errorMessage={uiError}
          />
        </div>
      </section>
    </main>
  )
}

export default App
