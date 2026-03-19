/**
 * Generates a restrictive CSP meta tag for the preview iframe.
 * Blocks external network requests while allowing inline scripts/styles.
 */
function buildPreviewCspTag() {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;">`
}

/**
 * Generates a bridge script that captures console output and errors
 * from the preview iframe and forwards them to the parent window
 * via postMessage.
 */
function buildBridgeScript() {
  return `<script data-source="preview-bridge">
(function() {
  var _post = function(level, args) {
    try {
      parent.postMessage({
        type: 'preview-console',
        level: level,
        args: args.map(function(a) {
          if (typeof a !== 'object' || a === null) return String(a);
          try { return JSON.stringify(a); } catch(e) { return '[Object]'; }
        })
      }, '*');
    } catch(e) {}
  };
  var _origLog = console.log;
  var _origWarn = console.warn;
  var _origError = console.error;
  console.log = function() {
    var a = Array.prototype.slice.call(arguments);
    _origLog.apply(console, a);
    _post('log', a);
  };
  console.warn = function() {
    var a = Array.prototype.slice.call(arguments);
    _origWarn.apply(console, a);
    _post('warn', a);
  };
  console.error = function() {
    var a = Array.prototype.slice.call(arguments);
    _origError.apply(console, a);
    _post('error', a);
  };
  window.onerror = function(msg, src, line) {
    _post('runtime_error', [msg + ' at line ' + line]);
  };
  window.onunhandledrejection = function(e) {
    _post('runtime_error', ['Unhandled promise rejection: ' + (e.reason && e.reason.message || e.reason)]);
  };
})();
</script>`
}

/**
 * Strips <link> and <script> tags from HTML whose href/src matches
 * a project file path, preventing 404s and duplicate loads when
 * we already inject those files inline.
 */
function stripMatchingAssetTags(html, projectFilePaths) {
  if (!projectFilePaths || projectFilePaths.length === 0) {
    return html
  }

  const pathSet = new Set(
    projectFilePaths.map((p) => p.replace(/^\.\//, '').replace(/^\//, '')),
  )

  // Strip <link> tags whose href matches a project file
  let result = html.replace(
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      const normalized = href.replace(/^\.\//, '').replace(/^\//, '')
      return pathSet.has(normalized) ? '' : match
    },
  )

  // Strip <script> tags with src matching a project file (but not inline scripts)
  result = result.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      const normalized = src.replace(/^\.\//, '').replace(/^\//, '')
      return pathSet.has(normalized) ? '' : match
    },
  )

  return result
}

export { buildBridgeScript, buildPreviewCspTag, stripMatchingAssetTags }
