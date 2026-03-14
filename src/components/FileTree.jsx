import { buttonDanger, buttonPrimary, buttonSecondary, sizeSm } from '../lib/buttonStyles'

function FileTree({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  isBusy,
  errorMessage,
}) {
  const handleCreate = () => {
    const nextPath = window.prompt('Enter a file path (example: src/main.js)', 'main.js')
    if (!nextPath) {
      return
    }

    onCreateFile(nextPath)
  }

  const handleRename = (file) => {
    const nextPath = window.prompt('Rename file path', file.path)
    if (!nextPath || nextPath === file.path) {
      return
    }

    onRenameFile(file.id, nextPath)
  }

  const handleDelete = (file) => {
    const confirmed = window.confirm(`Delete "${file.path}"?`)
    if (!confirmed) {
      return
    }

    onDeleteFile(file.id)
  }

  return (
    <section className="border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Files</h2>
        <button
          type="button"
          className={`${buttonPrimary} ${sizeSm}`}
          onClick={handleCreate}
          disabled={isBusy}
        >
          New File
        </button>
      </div>

      {isBusy ? <p className="text-sm text-slate-600">Saving files...</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      <div className="flex flex-col gap-2 max-h-80 overflow-auto">
        {files.length === 0 ? (
          <p className="text-sm text-slate-600">No files yet.</p>
        ) : (
          files.map((file) => {
            const isActive = file.id === activeFileId

            return (
              <article
                key={file.id}
                className={`border p-2 flex flex-col gap-2 ${isActive ? 'border-blue-600 bg-blue-50' : ''}`}
              >
                <button
                  type="button"
                  className={`text-left ${isActive ? 'font-semibold' : ''}`}
                  onClick={() => onSelectFile(file.id)}
                >
                  {file.path}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${buttonSecondary} ${sizeSm}`}
                    onClick={() => handleRename(file)}
                    disabled={isBusy}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className={`${buttonDanger} ${sizeSm}`}
                    onClick={() => handleDelete(file)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

export default FileTree
