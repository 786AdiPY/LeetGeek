// Runs in CodeChef page context — intercepts fetch/XHR for AC submission
(function () {
  console.log('[LeetGeek] inject_codechef.js active');

  let _lastSubmittedCode = null;
  let _lastSubmittedLang = null;

  function extractCodeFromBody(body) {
    if (!body) return null;
    try {
      if (typeof body === 'string') {
        const json = JSON.parse(body);
        return json.sourceCode ?? json.code ?? json.source ?? json.userCode ?? null;
      }
      if (body instanceof FormData) {
        return body.get('sourceCode') ?? body.get('code') ?? body.get('source') ?? null;
      }
    } catch {}
    return null;
  }

  function extractLangFromBody(body) {
    if (!body) return null;
    try {
      if (typeof body === 'string') {
        const json = JSON.parse(body);
        return json.language ?? json.lang ?? json.languageId ?? json.language_id ?? json.langName ?? json.language_name ?? null;
      }
      if (body instanceof FormData) {
        return body.get('language') ?? body.get('lang') ?? body.get('languageId') ?? body.get('language_id') ?? body.get('language_name') ?? null;
      }
    } catch {}
    return null;
  }

  function isAccepted(data) {
    if (!data) return false;
    const raw = data?.result_code ?? data?.status ?? data?.verdict ??
                data?.result?.result_code ?? data?.data?.result_code ?? '';
    const code = String(raw).toLowerCase().trim();
    // "AC"/"accepted" = fully correct; "scored"/"partial" = subtask — check score too
    if (code === 'ac' || code === 'accepted') return true;
    if (code === 'scored' || code === 'partial') {
      const score = parseFloat(data?.score ?? data?.total_score ?? data?.result?.score ?? 0);
      const max = parseFloat(data?.max_score ?? data?.result?.max_score ?? 100);
      return max > 0 && score >= max;
    }
    return false;
  }

  function getSubmissionId(data) {
    return String(
      data?.submission_id ?? data?.upid ?? data?.id ??
      data?.result?.submission_id ?? data?.result?.upid ?? Date.now()
    );
  }

  function tryParse(raw) {
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function dispatch(data) {
    const submissionId = getSubmissionId(data);
    console.log('[LeetGeek] CodeChef: Accepted/Full-score', submissionId, data);
    window.dispatchEvent(new CustomEvent('__leetgeek_cc_accepted', {
      detail: {
        submissionId,
        code: _lastSubmittedCode,
        language: _lastSubmittedLang,
        raw: data
      },
    }));
  }

  function dispatchWrong(data) {
    const raw = data?.result_code ?? data?.status ?? data?.verdict ?? data?.result?.result_code ?? '';
    if (!raw || String(raw).toLowerCase() === 'running' || String(raw).toLowerCase() === 'compiling') return;
    window.dispatchEvent(new CustomEvent('__leetgeek_cc_wrong', {
      detail: { status: String(raw) }
    }));
  }

  // EXCLUDE /run endpoints — only intercept real submission endpoints
  function isSubmitUrl(url) {
    if (/\/api\/ide\/run/i.test(url)) return false; // Ignore custom run testcases
    return /\/api\/ide\/(submit|status)/i.test(url) ||
           /ide\/submit/i.test(url) ||
           /\/submissions?(\/|$)/i.test(url) ||
           /\/status(\/|\?|$)/i.test(url) ||
           /\/result(\/|\?|$)/i.test(url);
  }

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');

    // Capture submitted code from POST request body if present
    if (isSubmitUrl(url) && args[1]?.body) {
      const extractedCode = extractCodeFromBody(args[1].body);
      if (extractedCode) _lastSubmittedCode = extractedCode;
      const extractedLang = extractLangFromBody(args[1].body);
      if (extractedLang) _lastSubmittedLang = extractedLang;
    }

    const res = await _fetch.apply(this, args);

    if (isSubmitUrl(url)) {
      res.clone().json().then((data) => {
        if (isAccepted(data)) dispatch(data);
        else dispatchWrong(data);
      }).catch(() => {});
    }

    return res;
  };

  // XHR fallback
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__lg_url = url;
    return _open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body, ...args) {
    const url = this.__lg_url ?? '';
    if (isSubmitUrl(url) && body) {
      const extractedCode = extractCodeFromBody(body);
      if (extractedCode) _lastSubmittedCode = extractedCode;
      const extractedLang = extractLangFromBody(body);
      if (extractedLang) _lastSubmittedLang = extractedLang;
    }

    this.addEventListener('load', function () {
      if (!isSubmitUrl(url)) return;
      const data = tryParse(this.responseText);
      if (data) {
        if (isAccepted(data)) dispatch(data);
        else dispatchWrong(data);
      }
    });
    return _send.call(this, body, ...args);
  };
})();

