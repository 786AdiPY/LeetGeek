// Runs at document_start — hooks window.ace before GFG's React app sets it
(function () {
  const code = `(function () {
    window.__leetgeek = window.__leetgeek || {};
    let _ace;
    try {
      Object.defineProperty(window, 'ace', {
        get() { return _ace; },
        set(v) {
          _ace = v;
          if (!v || typeof v.edit !== 'function') return;
          const _orig = v.edit.bind(v);
          v.edit = function (...args) {
            const editor = _orig(...args);
            if (editor && typeof editor.getValue === 'function') {
              window.__leetgeek._editor = editor;
              console.log('[LeetGeek] GFG: Ace editor captured via early hook');
            }
            return editor;
          };
        },
        configurable: true,
      });
    } catch (e) { console.log('[LeetGeek] early hook error:', e.message); }
  })();`;

  // GFG may block inline scripts via CSP — swallow error silently
  try {
    const s = document.createElement('script');
    s.textContent = code;
    const t = document.documentElement || document.head || document.body || document;
    t.appendChild(s);
    s.remove();
  } catch (e) {
    // CSP blocks inline injection — early hook unavailable, XHR fallback handles code capture
  }
})();
