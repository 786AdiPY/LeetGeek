// Runs in GFG page context — intercepts fetch/XHR for accepted submission
(function () {
  console.log('[LeetGeek] inject_gfg.js active');

  // Store code from submit request — result comes back via separate polling call
  let _pendingCode = null;
  let _pendingLang = null;

  function isAccepted(data) {
    if (!data) return false;

    // GFG format: {status:"SUCCESS", message:{accuracy:100, user_score:2, problem_max_score:"2"}}
    if (data?.status === 'SUCCESS' && data?.message) {
      const msg = data.message;
      const acc = parseFloat(msg?.accuracy ?? -1);
      if (acc === 100) return true;
      const scored = parseFloat(msg?.user_score ?? -1);
      const max = parseFloat(msg?.problem_max_score ?? -1);
      if (scored >= 0 && max > 0 && scored >= max) return true;
    }

    const d = data?.data ?? data?.result ?? data;
    const verdict = d?.verdict ?? d?.status ?? d?.compile_status ?? data?.verdict ?? data?.status ?? '';
    if (/^(accepted|ac)$/i.test(verdict)) return true;
    const acc = parseFloat(d?.accuracy ?? data?.message?.accuracy ?? data?.accuracy ?? -1);
    if (acc === 100) return true;
    const scored = parseFloat(d?.points_scored ?? d?.score ?? -1);
    const max = parseFloat(d?.max_points ?? d?.max_score ?? d?.total_points ?? -1);
    if (scored >= 0 && max > 0 && scored >= max) return true;
    return false;
  }

  function getSubmissionId(data) {
    const d = data?.data ?? data?.result ?? data;
    return String(d?.submission_id ?? d?.id ?? data?.submission_id ?? data?.id ?? Date.now());
  }

  function tryParse(raw) {
    if (typeof raw === 'object' && raw !== null) return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }

  const CODE_KEYS = ['code', 'source', 'typed_code', 'userCode', 'solution', 'source_code', 'program'];
  const LANG_KEYS = ['lang', 'language', 'languageId', 'language_id', 'selectedLang'];

  function extractCodeFromBody(body) {
    if (!body) return null;

    // FormData object (most common on GFG)
    if (body instanceof FormData) {
      for (const key of CODE_KEYS) {
        const v = body.get(key);
        if (v && String(v).trim().length > 5) return String(v);
      }
      // Iterate all entries as fallback
      for (const [, v] of body.entries()) {
        if (typeof v === 'string' && v.trim().length > 20 && v.includes('\n')) return v;
      }
      return null;
    }

    // JSON string or object
    const parsed = tryParse(body);
    if (parsed) {
      for (const key of CODE_KEYS) {
        const v = parsed?.[key] ?? parsed?.data?.[key] ?? parsed?.request?.[key];
        if (v && String(v).trim().length > 5) return String(v);
      }
    }

    // URLEncoded string
    if (typeof body === 'string' && body.includes('=')) {
      try {
        const p = new URLSearchParams(body);
        for (const key of CODE_KEYS) {
          const v = p.get(key);
          if (v && v.trim().length > 5) return decodeURIComponent(v);
        }
      } catch {}
    }

    return null;
  }

  function extractLangFromBody(body) {
    if (body instanceof FormData) {
      for (const key of LANG_KEYS) {
        const v = body.get(key);
        if (v) return String(v);
      }
      return null;
    }
    const parsed = tryParse(body);
    if (parsed) {
      for (const key of LANG_KEYS) {
        if (parsed?.[key]) return String(parsed[key]);
      }
    }
    if (typeof body === 'string') {
      try {
        const p = new URLSearchParams(body);
        for (const key of LANG_KEYS) {
          const v = p.get(key);
          if (v) return v;
        }
      } catch {}
    }
    return null;
  }

  function dispatch(data) {
    const submissionId = getSubmissionId(data);
    const code = _pendingCode ?? getEditorCode();
    const lang = _pendingLang;
    console.log('[LeetGeek] GFG: Accepted', submissionId, 'code length:', code?.length ?? 0);
    window.dispatchEvent(new CustomEvent('__leetgeek_gfg_accepted', {
      detail: { submissionId, code, lang, raw: data },
    }));
    _pendingCode = null;
    _pendingLang = null;
  }

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');
    const method = (args[1]?.method ?? 'GET').toUpperCase();
    const body = args[1]?.body ?? null;

    // Debug: log all requests so we can see what GFG calls
    console.log('[LeetGeek] GFG fetch:', method, url.replace('https://','').substring(0, 80));

    // Capture code from ANY POST
    if (method === 'POST' && body) {
      const code = extractCodeFromBody(body);
      const lang = extractLangFromBody(body);
      if (code && code.length > 20) {
        _pendingCode = code;
        _pendingLang = lang;
        console.log('[LeetGeek] GFG: captured code from POST', url, 'length:', code.length);
      } else {
        console.log('[LeetGeek] GFG: POST with no extractable code, body type:', typeof body, body instanceof FormData ? 'FormData' : '');
      }
    }

    const res = await _fetch.apply(this, args);

    // Check ALL responses for acceptance signal
    res.clone().json().then((data) => {
      if (isAccepted(data)) {
        dispatch(data);
      } else {
        // Log any response that looks submission-related
        const urlLower = url.toLowerCase();
        if (urlLower.includes('submit') || urlLower.includes('result') || urlLower.includes('verdict')) {
          console.log('[LeetGeek] GFG submission-related response:', JSON.stringify(data).substring(0, 200));
        }
      }
    }).catch(() => {});

    return res;
  };

  // XHR fallback
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__lg_url = url;
    this.__lg_method = method?.toUpperCase() ?? 'GET';
    return _open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body, ...rest) {
    const url = this.__lg_url ?? '';
    const method = this.__lg_method ?? 'GET';
    console.log('[LeetGeek] GFG XHR:', method, url.replace('https://','').substring(0, 80));
    if (method === 'POST' && body) {
      console.log('[LeetGeek] GFG XHR POST body type:', typeof body, body instanceof FormData ? 'FormData' : '', 'length:', String(body).length);
      const code = extractCodeFromBody(body);
      const lang = extractLangFromBody(body);
      if (code && code.length > 20) {
        _pendingCode = code;
        _pendingLang = lang;
        console.log('[LeetGeek] GFG XHR: captured code, length:', code.length);
      }
    }
    this.addEventListener('load', function () {
      const data = tryParse(this.responseText);
      if (data && isAccepted(data)) dispatch(data);
    });
    return _send.call(this, body, ...rest);
  };

  // Editor access — uses early hook capture first
  function getEditorCode() {
    // Early hook capture (most reliable — hooked before GFG init)
    try {
      const val = window.__leetgeek?._editor?.getValue?.();
      if (val && val.trim().length > 10) { console.log('[LeetGeek] GFG: got code from early hook'); return val; }
    } catch {}
    // Ace via DOM element
    for (const el of document.querySelectorAll('.ace_editor')) {
      try {
        const val = el.env?.editor?.getValue?.() ?? el.editor?.getValue?.() ?? window.ace?.edit(el)?.getValue?.();
        if (val && val.trim().length > 10) return val;
      } catch {}
    }
    // Textarea
    for (const ta of document.querySelectorAll('textarea')) {
      const val = ta.value;
      if (val && val.trim().length > 10) return val;
    }
    console.warn('[LeetGeek] GFG: all editor access methods failed');
    return null;
  }
})();
