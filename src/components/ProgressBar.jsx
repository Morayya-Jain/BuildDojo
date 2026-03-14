function ProgressBar({ completedCount, totalCount }) {
  const percent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <section className="border p-3">
      <p>
        Progress: {completedCount} of {totalCount} tasks complete ({percent}%)
      </p>
      <progress className="w-full" value={completedCount} max={totalCount || 1} />
    </section>
  )
}

export default ProgressBar
