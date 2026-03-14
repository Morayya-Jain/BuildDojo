function Roadmap({ tasks, currentTaskIndex, onSelectTask }) {
  return (
    <aside className="border p-3 overflow-auto">
      <h2 className="text-lg font-semibold mb-3">Roadmap</h2>

      <div className="flex flex-col gap-2">
        {tasks.map((task, index) => {
          const isCurrent = index === currentTaskIndex
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectTask(index)}
              className={`text-left border p-2 ${isCurrent ? 'border-blue-600' : ''} ${task.completed ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {index + 1}. {task.title}
                </p>
                {task.completed ? <span>✓</span> : null}
              </div>
              <p className="text-sm">{task.description}</p>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export default Roadmap
