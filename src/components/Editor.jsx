import MonacoEditor from '@monaco-editor/react'

function detectLanguage(description) {
  const text = description.toLowerCase()

  if (text.includes('python')) {
    return 'python'
  }

  if (text.includes('react') || text.includes('jsx')) {
    return 'javascript'
  }

  if (text.includes('html') || text.includes('css')) {
    return 'html'
  }

  return 'javascript'
}

function Editor({ projectDescription, value, onChange, readOnly }) {
  return (
    <section className="border p-2 h-full">
      <h2 className="text-lg font-semibold mb-2">Editor</h2>
      <MonacoEditor
        height="70vh"
        language={detectLanguage(projectDescription)}
        theme="vs-dark"
        value={value || '// Start coding here'}
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
