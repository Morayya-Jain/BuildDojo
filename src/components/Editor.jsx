import MonacoEditor from '@monaco-editor/react'
import { detectLanguage } from '../lib/detectLanguage'

function Editor({
  projectDescription,
  value,
  onChange,
  readOnly,
  language,
  tabs = [],
  activeTabId = null,
  onSelectTab,
}) {
  const editorLanguage = language || detectLanguage(projectDescription, value)

  return (
    <section className="border p-2 h-full">
      <h2 className="text-lg font-semibold mb-2">Editor</h2>
      {tabs.length > 0 ? (
        <div className="flex gap-2 mb-2 overflow-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`border px-2 py-1 text-sm ${tab.id === activeTabId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
              onClick={() => onSelectTab?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <MonacoEditor
        height="70vh"
        language={editorLanguage}
        theme="vs-dark"
        value={value ?? ''}
        onChange={(newValue) => onChange(newValue || '')}
        options={{
          readOnly,
          minimap: { enabled: false },
        }}
      />
    </section>
  )
}

export default Editor
