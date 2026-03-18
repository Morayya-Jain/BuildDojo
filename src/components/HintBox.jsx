import { memo } from 'react'
import { buttonPrimary, buttonSecondary, sizeSm } from '../lib/buttonStyles'
import RichTextMessage from './RichTextMessage'

function HintBox({
  task,
  hintsUsed,
  exampleViewed,
  onGiveHint,
  onShowExample,
  isDisabled,
}) {
  const hintText =
    typeof task?.hint === 'string' && task.hint.trim().length > 0
      ? task.hint
      : 'No hint is available for this task yet. Ask the mentor a follow-up question for guidance.'

  const exampleText =
    typeof task?.exampleOutput === 'string' && task.exampleOutput.trim().length > 0
      ? task.exampleOutput
      : 'No example output is available for this task yet.'

  return (
    <section className="flex flex-col gap-3 border border-slate-300 bg-white p-4">
      <h2 className="text-2xl font-semibold text-slate-900">Hints</h2>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={`${buttonPrimary} ${sizeSm} w-full justify-between rounded-lg border-emerald-600 bg-emerald-500 hover:border-emerald-500 hover:bg-emerald-400`}
          onClick={onGiveHint}
          disabled={isDisabled}
        >
          Give me a hint
        </button>
        <button
          type="button"
          className={`${buttonSecondary} ${sizeSm} w-full justify-between rounded-lg border-slate-300 bg-white text-slate-700`}
          onClick={onShowExample}
          disabled={isDisabled || hintsUsed < 1}
          title={hintsUsed < 1 ? 'Reveal at least one hint first.' : undefined}
          aria-expanded={exampleViewed}
        >
          {exampleViewed ? 'Hide example' : 'Show example'}
        </button>
      </div>
      {hintsUsed < 1 && !isDisabled ? (
        <p className="text-sm text-slate-600">Reveal one hint to unlock the example.</p>
      ) : null}

      {hintsUsed > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <h3 className="font-semibold text-slate-900">Hint</h3>
          <RichTextMessage text={hintText} />
        </div>
      )}

      {exampleViewed && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="font-semibold text-slate-900">Example Output</h3>
          <RichTextMessage text={exampleText} />
        </div>
      )}
    </section>
  )
}

export default memo(HintBox)
