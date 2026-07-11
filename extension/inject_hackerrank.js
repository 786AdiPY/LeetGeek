// Runs in HackerRank page context — captures submitted code and detects the
// "Accepted" verdict from the REST submission/polling responses.
(function () {
  console.log('[LeetGeek] inject_hackerrank.js active');

  let _pendingCode = null;
  let _pendingLang = null;

  function tryParse(raw) {
    if (typeof raw === 'object' && raw !== null) return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function isSubmissionUrl(url) {
    return /\/rest\/.*challenges\/[^/]+\/submissions/i.test(url) || /challenges\/[^/]+\/submissions/i.test(url);
  }

  function isAccepted(data) {
    const m = data?.model ?? data;
    if (!m) return false;
    const status = String(m.status ?? '').toLowerCase().trim();
    if (status === 'accepted') return true;
    // status_code 2 is HackerRank's historical "accepted"; guard against partials.
    if (m.status_code === 2 && status !== 'wrong answer' && status !== 'processing') return true;
    return false;
  }

  function getSubmissionId(data) {
    const m = data?.model ?? data;
    return String(m?.id ?? m?.submission_id ?? Date.now());
  }

  function captureFromBody(body) {
    const parsed = tryParse(body);
    if (!parsed) return;
    const code = parsed.code ?? parsed.source ?? parsed.contents;
    const lang = parsed.language ?? parsed.language_id ?? parsed.lang;
    if (code && String(code).trim().length > 5) {
      _pendingCode = String(code);
      _pendingLang = lang ? String(lang) : _pendingLang;
    }
  }

  function dispatch(data) {
    const submissionId = getSubmissionId(data);
    console.log('[LeetGeek] HackerRank: Accepted', submissionId, 'code length:', _pendingCode?.length ?? 0);
    window.dispatchEvent(new CustomEvent('__leetgeek_hr_accepted', {
      detail: { submissionId, code: _pendingCode, lang: _pendingLang, raw: data },
    }));
  }

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');
    const method = (args[1]?.method ?? 'GET').toUpperCase();
    const body = args[1]?.body ?? null;

    if (isSubmissionUrl(url) && method === 'POST' && body) captureFromBody(body);

    const res = await _fetch.apply(this, args);
    if (isSubmissionUrl(url)) {
      res.clone().json().then((data) => {
        console.log('[LeetGeek] HR intercept (fetch)', url, data);
        if (isAccepted(data)) dispatch(data);
      }).catch(() => {});
    }
    return res;
  };

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__lg_url = u; this.__lg_method = (m || 'GET').toUpperCase(); return _open.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.send = function (body, ...r) {
    const url = this.__lg_url ?? '';
    if (isSubmissionUrl(url) && this.__lg_method === 'POST' && body) captureFromBody(body);
    this.addEventListener('load', function () {
      if (!isSubmissionUrl(url)) return;
      const data = tryParse(this.responseText);
      console.log('[LeetGeek] HR intercept (xhr)', url, data);
      if (data && isAccepted(data)) dispatch(data);
    });
    return _send.call(this, body, ...r);
  };
})();
