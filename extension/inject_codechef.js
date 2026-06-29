// Runs in CodeChef page context — intercepts fetch/XHR for AC submission
(function () {
  console.log('[LeetGeek] inject_codechef.js active');

  function isAccepted(data) {
    if (!data) return false;
    const code = data?.result_code ?? data?.status ?? data?.verdict ?? '';
    // "AC" = fully correct, "scored" = subtask partial/full — check score too
    if (code === 'AC' || code === 'Accepted') return true;
    if (code === 'scored') {
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
      detail: { submissionId, raw: data },
    }));
  }

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');

    // Run/submit + status polling endpoints
    if (/\/api\/ide\/(run|submit|status)/i.test(url) ||
        /\/submissions?(\/|$)/i.test(url)) {
      res.clone().json().then((data) => {
        if (isAccepted(data)) dispatch(data);
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
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url = this.__lg_url ?? '';
      if (!/submit|ide\/(run|status)/i.test(url)) return;
      const data = tryParse(this.responseText);
      if (data && isAccepted(data)) dispatch(data);
    });
    return _send.apply(this, args);
  };
})();
