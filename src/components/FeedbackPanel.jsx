import { memo, useState, useEffect, useRef } from 'react'
import { buttonPrimary, buttonSecondary, sizeLg } from '../lib/buttonStyles'
import RichTextMessage from './RichTextMessage'

function FeedbackPanel({
  feedbackHistory,
  isCheckingCode,
  isAskingFollowUp,
  followUpSuggestions = [],
  isGeneratingFollowUpSuggestions = false,
  followUpSuggestionsNotice = '',
  onCheckCode,
  onAskFollowUp,
  errorMessage,
}) {
  const [question, setQuestion] = useState('')
  const feedbackEndRef = useRef(null)
  const panelRef = useRef(null)

  // Auto-scroll feedback window to latest message
  useEffect(() => {
    if (feedbackHistory.length > 0 || isCheckingCode || isAskingFollowUp) {
      const timerId = setTimeout(() => {
        feedbackEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 0)
      return () => clearTimeout(timerId)
    }
  }, [feedbackHistory.length, isCheckingCode, isAskingFollowUp])

  // Auto-scroll right pane to show FeedbackPanel
  useEffect(() => {
    if (feedbackHistory.length > 0 || isCheckingCode || isAskingFollowUp) {
      const timerId = setTimeout(() => {
        panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return () => clearTimeout(timerId)
    }
  }, [feedbackHistory.length, isCheckingCode, isAskingFollowUp])

  const handleFollowUp = async (event) => {
    event.preventDefault()

    if (!question.trim()) {
      return
    }

    const result = await onAskFollowUp(question)
    if (result?.error == null) {
      setQuestion('')
    }
  }

  const handleSuggestionClick = (suggestion) => {
    setQuestion(suggestion)
  }

  return (
    <section ref={panelRef} className="flex flex-col gap-3 border border-slate-300 bg-white p-4">
      <h2 className="text-2xl font-semibold text-slate-900">Mentor Feedback</h2>

      <button
        type="button"
        className={`${buttonPrimary} ${sizeLg} w-full rounded-lg border-emerald-600 bg-emerald-500 hover:border-emerald-500 hover:bg-emerald-400`}
        onClick={onCheckCode}
        disabled={isCheckingCode}
      >
        {isCheckingCode ? 'Checking code...' : 'Check My Code'}
      </button>

      <div
        className="min-h-[200px] max-h-[min(380px,50svh)] overflow-auto rounded-xl border border-slate-300 bg-slate-50 p-3"
        role="log"
        aria-live="polite"
      >
        {feedbackHistory.length === 0 && !isCheckingCode && !isAskingFollowUp ? (
          <p className="text-sm leading-6 text-slate-500">No feedback yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {feedbackHistory.map((entry, index) => (
              <div
                key={`${entry.role}-${index}`}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <strong className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {entry.role === 'ai' ? 'Mentor' : 'You'}
                </strong>
                {entry.role === 'ai' ? (
                  <RichTextMessage text={entry.message} className="mt-1" />
                ) : (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                    {entry.message}
                  </p>
                )}
              </div>
            ))}
            {(isCheckingCode || isAskingFollowUp) && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <span className="inline-block h-2 w-2 animate-pulse motion-reduce:animate-none rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-500">
                  {isCheckingCode ? 'Checking your code...' : 'Thinking...'}
                </span>
              </div>
            )}
            <div ref={feedbackEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleFollowUp} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-900">
          Ask a follow-up question
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            placeholder="What should I fix next?"
          />
        </label>
        <button
          type="submit"
          className={`${buttonSecondary} ${sizeLg} w-full rounded-lg`}
          disabled={isAskingFollowUp}
        >
          {isAskingFollowUp ? 'Sending...' : 'Send question'}
        </button>

        {isGeneratingFollowUpSuggestions ? (
          <p className="text-xs text-slate-500">Generating suggested questions...</p>
        ) : null}

        {followUpSuggestions.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-medium text-slate-600">Suggested follow-up questions</p>
            <div className="mt-2 flex flex-col items-start gap-2">
              {followUpSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="inline-flex max-w-full items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                  disabled={isAskingFollowUp || isGeneratingFollowUpSuggestions}
                  title={suggestion}
                >
                  <span className="block max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap sm:max-w-[260px]">
                    {suggestion}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {followUpSuggestionsNotice ? (
          <p className="text-xs text-slate-500">{followUpSuggestionsNotice}</p>
        ) : null}
      </form>

      {errorMessage && <p className="text-red-600" role="alert">{errorMessage}</p>}
    </section>
  )
}

export default memo(FeedbackPanel)
