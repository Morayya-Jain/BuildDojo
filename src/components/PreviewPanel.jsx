import { useCallback, useEffect, useRef, useState } from 'react'

const DEVICE_PRESETS = [
  { label: 'Mobile', width: 375 },
  { label: 'Tablet', width: 768 },
  { label: 'Desktop', width: null },
]

function PreviewPanel({ srcDoc, error, onPreviewConsole }) {
  const [activePreset, setActivePreset] = useState('Desktop')
  const iframeRef = useRef(null)

  const handleMessage = useCallback(
    (event) => {
      // Only accept messages from our own iframe
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow
      ) {
        return
      }

      if (!event.data || event.data.type !== 'preview-console') {
        return
      }

      if (typeof onPreviewConsole === 'function') {
        onPreviewConsole({
          level: event.data.level || 'log',
          message: (event.data.args || []).join(' '),
        })
      }
    },
    [onPreviewConsole],
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  const selectedPreset = DEVICE_PRESETS.find((p) => p.label === activePreset)
  const iframeWidth = selectedPreset?.width ? `${selectedPreset.width}px` : '100%'

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {DEVICE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              activePreset === preset.label
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setActivePreset(preset.label)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-slate-300 bg-slate-100 p-2">
        <iframe
          ref={iframeRef}
          title="Project preview"
          srcDoc={srcDoc || '<p style="color:#888;font-family:sans-serif;padding:1rem;">No preview available. Add an HTML file to your project.</p>'}
          sandbox="allow-scripts"
          className="h-full rounded border border-slate-200 bg-white"
          style={{ width: iframeWidth, maxWidth: '100%' }}
        />
      </div>
    </div>
  )
}

export default PreviewPanel
