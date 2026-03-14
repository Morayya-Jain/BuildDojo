function HintBox({
  task,
  hintsUsed,
  exampleViewed,
  onGiveHint,
  onShowExample,
  isDisabled,
}) {
  return (
    <section className="border p-3 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Hints</h2>

      <div className="flex gap-2">
        <button
          type="button"
          className="border px-3 py-1"
          onClick={onGiveHint}
          disabled={isDisabled}
        >
          Give me a hint
        </button>
        <button
          type="button"
          className="border px-3 py-1"
          onClick={onShowExample}
          disabled={isDisabled || hintsUsed < 1}
        >
          Show example
        </button>
      </div>

      {hintsUsed > 0 && (
        <div>
          <h3 className="font-semibold">Hint</h3>
          <p>{task?.hint}</p>
        </div>
      )}

      {exampleViewed && (
        <div>
          <h3 className="font-semibold">Example Output</h3>
          <pre className="border p-2 overflow-auto whitespace-pre-wrap">
            {task?.exampleOutput}
          </pre>
        </div>
      )}
    </section>
  )
}

export default HintBox
