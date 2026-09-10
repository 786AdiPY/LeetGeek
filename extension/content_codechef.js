const BACKEND = 'https://leet-geek.vercel.app';

console.log('[LeetGeek] CodeChef content script loaded');

// Mark this platform as "seen" so the dashboard can show it as connected.
try { chrome.storage.local.get(['lg_seen'], (r) => { const s = r.lg_seen || {}; if (!s.codechef) { s.codechef = true; chrome.storage.local.set({ lg_seen: s }); } }); } catch {}

// Inject page-context interceptor
(function injectScript() {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('inject_codechef.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();

// Extract problem code from URL
// URLs: /problems/FLOW008  or  /COOK140/problems/FLOW008
function getProblemCode() {
  const m = location.pathname.match(/\/problems\/([\w]+)/);
  return m ? m[1] : null;
}

// Fetch problem metadata from CodeChef API
async function fetchCCProblemDetail(code) {
  try {
    // Try both endpoints — contest practice + direct problem API
    const urls = [
      `https://www.codechef.com/api/contests/PRACTICE/problems/${code}`,
      `https://www.codechef.com/api/problems/${code}`,
    ];
    for (const url of urls) {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) return await res.json();
    }
  } catch {}
  return null;
}

// Scrape tags from CodeChef problem page DOM
function getTagsFromDom() {
  const tags = [];
  for (const sel of [
    '[class*="tag"] a',
    '[class*="Tag"] a',
    '[class*="problem-tag"]',
    '[class*="problemTag"]',
    '.tags-list a',
    '[data-test-id*="tag"]',
    '#problem-tags a',
    '[class*="badge"] a',
  ]) {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        const t = el.textContent?.trim();
        if (t && t.length > 1 && t.length < 40) tags.push({ name: t });
      });
      if (tags.length) break;
    } catch {}
  }
  return tags;
}

// Detect language from CodeChef editor dropdown
function detectLanguage() {
  const candidates = [
    document.querySelector('[name="language"]'),
    document.querySelector('select[id*="lang"]'),
    document.querySelector('[class*="language"] select'),
    document.querySelector('[class*="LanguageSelector"] [class*="selected"]'),
    document.querySelector('[data-language]'),
    ...document.querySelectorAll('option:checked'),
  ];
  for (const el of candidates) {
    if (!el) continue;
    const val = (el.value ?? el.textContent ?? el.getAttribute('data-language') ?? '').toLowerCase();
    if (!val) continue;
    if (val.includes('python')) return 'python3';
    if (val.includes('java') && !val.includes('script')) return 'java';
    if (val.includes('c++') || val === 'cpp17' || val === 'cpp14' || val === 'cpp') return 'cpp';
    if (val.includes('javascript') || val === 'js') return 'javascript';
    if (val === 'c') return 'c';
  }
  return 'cpp';
}

// Get code from editor (DOM fallback)
function getEditorCode() {
  // Ace: read from element's attached instance (avoid output console)
  for (const el of document.querySelectorAll('.ace_editor:not([class*="output"]):not([id*="output"])')) {
    try {
      const val = el.env?.editor?.getValue?.();
      if (val && val.trim().length > 10 && !val.includes("Total Score =")) return val;
    } catch {}
  }
  // Ace: internal registry
  if (window.ace) {
    try {
      const instances = window.ace.edit.__instances ?? {};
      for (const ed of Object.values(instances)) {
        const val = ed?.getValue?.();
        if (val && val.trim().length > 10 && !val.includes("Total Score =")) return val;
      }
    } catch {}
    for (const id of ['code', 'editor', 'aceEditor', 'code-editor']) {
      try {
        const val = window.ace.edit(id).getValue();
        if (val && val.trim().length > 10 && !val.includes("Total Score =")) return val;
      } catch {}
    }
  }
  // Monaco
  if (window.monaco?.editor) {
    const models = window.monaco.editor.getModels();
    for (const m of models) {
      const val = m.getValue();
      if (val && val.trim().length > 10 && !val.includes("Total Score =") && !val.includes("Execution Time:")) return val;
    }
  }
  // CodeMirror
  const cm = document.querySelector('.CodeMirror');
  if (cm?.CodeMirror) return cm.CodeMirror.getValue();

  // Textarea fallback — explicitly skip output textareas
  for (const ta of document.querySelectorAll('textarea:not([readonly]):not([id*="output"]):not([class*="output"])')) {
    const val = ta.value;
    if (val && val.trim().length > 10 && !val.includes("Total Score =") && !val.includes("Execution Time:")) return val;
  }
  return null;
}

async function syncToBackend(token, submissionId, problemCode, detail, overrideCode, overrideLang) {
  const language = overrideLang ?? detectLanguage();
  const code = overrideCode ?? getEditorCode();
  if (!code) {
    console.warn('[LeetGeek] CodeChef: could not extract code from submission/editor');
    return;
  }

  const problemName = detail?.problem_name ?? problemCode;
  const difficulty = detail?.difficulty_rating
    ? (detail.difficulty_rating <= 1500 ? 'Easy' : detail.difficulty_rating <= 2500 ? 'Medium' : 'Hard')
    : 'Medium';
  // Tags: DOM first, then API, then Uncategorized
  const domTags = getTagsFromDom();
  const rawApiTags = detail?.tags ?? detail?.topic_list ?? detail?.categories ?? [];
  const apiTags = rawApiTags.map((t) => ({ name: typeof t === 'string' ? t : (t.name ?? t) }));
  const tags = domTags.length ? domTags : apiTags.length ? apiTags : [{ name: 'Uncategorized' }];

  const payload = {
    submissionId,
    code,
    language,
    platform: 'codechef',
    problem: {
      questionId: String(detail?.problem_id ?? problemCode),
      title: problemName,
      titleSlug: problemCode.toLowerCase(),
      difficulty,
      topicTags: tags,
    },
  };

  try {
    const res = await fetch(`${BACKEND}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-token': token,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('[LeetGeek] CodeChef sync result:', data);
    if (data.status === 'committed') {
      const paths = data.filePaths ?? [data.filePath];
      console.log(`[LeetGeek] CodeChef ✓ Committed: ${paths.join(', ')}`);
      chrome.runtime.sendMessage({ type: 'COMMITTED', filePath: paths[0] });
    } else if (data.status === 'already_synced') {
      console.log('[LeetGeek] CodeChef: already synced.');
    } else {
      console.error('[LeetGeek] CodeChef error:', data.error);
      chrome.runtime.sendMessage({ type: 'ERROR', error: data.error });
    }
  } catch (err) {
    console.error('[LeetGeek] CodeChef sync error:', err);
    chrome.runtime.sendMessage({ type: 'ERROR', error: String(err) });
  }
}

// --- Primary: event from inject_codechef.js ---
let handled = false;
let domHandled = false;

window.addEventListener('__leetgeek_cc_accepted', async (e) => {
  if (handled || domHandled) return;
  handled = true;
  domHandled = true;
  setTimeout(() => { handled = false; domHandled = false; }, 15000);

  const { submissionId, code: interceptedCode, language: interceptedLang } = e.detail;
  console.log('[LeetGeek] CodeChef accepted event', submissionId);

  const problemCode = getProblemCode();
  if (!problemCode) {
    console.warn('[LeetGeek] CodeChef: could not determine problem code from URL');
    return;
  }

  let token = null;
  try {
    token = await new Promise((resolve) => {
      chrome.storage.sync.get(['extensionToken'], (r) => resolve(r.extensionToken ?? null));
    });
  } catch {
    console.warn('[LeetGeek] CodeChef: extension context invalidated — reload page');
    return;
  }
  if (!token) {
    console.warn('[LeetGeek] CodeChef: no extension token — visit the LeetGeek app to get one');
    return;
  }

  const detail = await fetchCCProblemDetail(problemCode);
  await syncToBackend(token, submissionId, problemCode, detail, interceptedCode, interceptedLang);
});

// --- DOM fallback: watch for "Well done" or score 100% ---
let domTimer = null;

const observer = new MutationObserver(() => {
  if (domHandled || handled) return;
  if (domTimer) clearTimeout(domTimer);
  domTimer = setTimeout(checkDomForAccepted, 1000);
});
observer.observe(document.body, { childList: true, subtree: true });

async function checkDomForAccepted() {
  if (domHandled || handled) return;

  const successEl = findSuccessElement();
  if (!successEl) return;

  domHandled = true;
  handled = true;
  setTimeout(() => { domHandled = false; handled = false; }, 15000);

  console.log('[LeetGeek] CodeChef DOM fallback: accepted detected');

  const problemCode = getProblemCode();
  if (!problemCode) return;

  let token = null;
  try {
    token = await new Promise((resolve) => {
      chrome.storage.sync.get(['extensionToken'], (r) => resolve(r.extensionToken ?? null));
    });
  } catch {
    console.warn('[LeetGeek] CodeChef: extension context invalidated — reload page');
    return;
  }
  if (!token) {
    console.warn('[LeetGeek] CodeChef DOM: no extension token');
    return;
  }

  const submissionId = String(Date.now()); // DOM fallback has no submission ID
  const detail = await fetchCCProblemDetail(problemCode);
  await syncToBackend(token, submissionId, problemCode, detail);
}

function findSuccessElement() {
  // "Well done, it's correct!" banner
  for (const el of document.querySelectorAll('div, p, span, h2, h3')) {
    const t = el.textContent?.trim() ?? '';
    if (t.includes("Well done") && t.includes("correct")) return el;
  }
  // "Total Score = 100%" row
  for (const el of document.querySelectorAll('td, div')) {
    const t = el.textContent?.trim() ?? '';
    if (/Total\s+Score\s*=\s*100%/i.test(t)) return el;
  }
  return null;
}
