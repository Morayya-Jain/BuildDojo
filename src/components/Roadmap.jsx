import { memo } from 'react'

function Roadmap({ tasks, currentTaskIndex, onSelectTask }) {
  return (
    <aside className="overflow-auto" aria-label="Project roadmap">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Roadmap</h2>

      <div className="relative space-y-3">
        <div className="absolute bottom-8 left-[18px] top-8 w-px bg-slate-200" />
        {tasks.map((task, index) => {
          const isCurrent = index === currentTaskIndex
          const isCompleted = task.completed
          return (
            <div key={task.id} className="relative flex gap-3">
              <div
                className={`z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 bg-white text-sm font-semibold ${
                  isCurrent
                    ? 'border-emerald-500 text-emerald-600'
                    : isCompleted
                      ? 'border-emerald-300 text-emerald-500'
                      : 'border-slate-300 text-slate-700'
                }`}
                aria-label={`Task ${index + 1}${isCompleted ? ', completed' : isCurrent ? ', current' : ''}`}
              >
                {index + 1}
              </div>

              <button
                type="button"
                onClick={() => onSelectTask(index)}
                className={`flex-1 rounded-xl border-2 p-3 text-left transition ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-50'
                    : isCompleted
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="text-lg font-semibold leading-snug text-slate-900">{task.title}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {isCompleted ? 'Completed' : `Task ${index + 1} of ${tasks.length}`}
                </p>
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export default memo(Roadmap)
