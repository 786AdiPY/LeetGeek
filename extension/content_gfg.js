const BACKEND = 'https://leet-geek.vercel.app';

console.log('[LeetGeek] GFG content script loaded');

// Inject page-context interceptor
(function injectScript() {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('inject_gfg.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();

// Cache tags + slug at page load — before SPA navigates away on submit
let _cachedSlug = null;
let _cachedTags = [];

function cachePageData() {
  _cachedSlug = location.pathname.match(/\/problems?\/([\w-]+)/)?.[1] ?? null;
  const tags = getTagsFromDom();
  if (tags.length) {
    _cachedTags = tags;
    console.log('[LeetGeek] GFG: cached tags:', tags.map(t => t.name).join(', '));
  }
}

// Re-cache when DOM updates (SPA may lazy-load tags)
let _cacheTimer = null;
new MutationObserver(() => {
  if (_cacheTimer) clearTimeout(_cacheTimer);
  _cacheTimer = setTimeout(() => {
    const tags = getTagsFromDom();
    if (tags.length) { _cachedTags = tags; }
  }, 500);
}).observe(document.body, { childList: true, subtree: true });

// Retry until tags found (GFG may lazy-load topic tags section)
let _cacheRetries = 0;
function scheduleCacheRetry() {
  if (_cachedTags.length || _cacheRetries >= 10) return;
  _cacheRetries++;
  setTimeout(() => { cachePageData(); scheduleCacheRetry(); }, _cacheRetries * 1000);
}
setTimeout(() => { cachePageData(); scheduleCacheRetry(); }, 1000);

// Extract problem slug from URL
// URLs: /problems/second-largest3735/1  or  /problems/reverse-a-string/1
function getProblemSlug() {
  // Use cached slug (captured before SPA navigation)
  if (_cachedSlug) return _cachedSlug;
  const m = location.pathname.match(/\/problems?\/([\w-]+)/);
  return m ? m[1] : null;
}

// Clean slug for filename: strip trailing digits GFG appends (e.g. "second-largest3735" → "second-largest")
function cleanSlug(slug) {
  return slug.replace(/-?\d+$/, '');
}

// Scrape topic tags directly from page DOM
function getTagsFromDom() {
  const tags = [];
  const seen = new Set();

  function addTag(t) {
    t = t?.trim();
    if (t && t.length > 1 && t.length < 50 && !seen.has(t)) {
      seen.add(t);
      tags.push({ name: t });
    }
  }

  // Strategy 1: find "Topic Tags" heading, walk up to 4 levels to find chip container
  for (const el of document.querySelectorAll('h2, h3, h4, button, div, span, p, b, strong')) {
    const text = el.textContent?.trim() ?? '';
    // Use startsWith-style match — textContent may have chevron char appended
    if (/topic\s*tags?/i.test(text) && text.length < 80) {
      let node = el;
      for (let i = 0; i < 4 && node; i++) {
        node.querySelectorAll('a, [class*="tag"] span, [class*="chip"]').forEach((chip) => {
          const t = chip.textContent?.trim() ?? '';
          if (t && !/topic\s*tags?/i.test(t) && t.length < 40) addTag(t);
        });
        if (tags.length) break;
        node = node.parentElement;
      }
      if (tags.length) break;
    }
  }
  if (tags.length) return tags;

  // Strategy 2: known GFG class selectors
  for (const sel of [
    '[class*="problems_tag"] a',
    '.problems_tag_container__kWANg a',
    '[class*="tag_container"] a',
    '[class*="tagContainer"] a',
    '[class*="topic"][class*="tag"] a',
    '[class*="TopicTag"] a',
    '[class*="problemTag"] a',
    '[class*="badge"] a',
    '[class*="chip"] span',
    '[class*="chip"]',
  ]) {
    try {
      document.querySelectorAll(sel).forEach((el) => addTag(el.textContent?.trim()));
      if (tags.length) break;
    } catch {}
  }
  return tags;
}

// Fetch problem metadata from GFG practice API
async function fetchGFGProblemDetail(slug) {
  try {
    const res = await fetch(`https://practiceapi.geeksforgeeks.org/api/latest/problems/${slug}/`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Detect language from GFG editor dropdown
function detectLanguage() {
  // GFG shows language in a select or button label
  const candidates = [
    document.querySelector('[class*="language"] button'),
    document.querySelector('[class*="Language"] button'),
    document.querySelector('[class*="lang-selector"]'),
    document.querySelector('[data-mode]'),
    document.querySelector('select[name*="lang"]'),
  ];
  for (const el of candidates) {
    if (!el) continue;
    const val = (el.textContent ?? el.value ?? el.getAttribute('data-mode') ?? '').toLowerCase();
    if (!val) continue;
    if (val.includes('python')) return 'python3';
    if (val.includes('java') && !val.includes('script')) return 'java';
    if (val.includes('c++') || val.includes('cpp')) return 'cpp';
    if (val.includes('javascript')) return 'javascript';
    if (/\bc\b/.test(val)) return 'c';
  }
  return 'cpp'; // GFG default
}

// Get code from editor
function getEditorCode() {
  // Ace: read editor instance attached to DOM element (avoids virtual-scroll DOM trap)
  for (const el of document.querySelectorAll('.ace_editor')) {
    try {
      // Ace stores editor on element after init: el.env.editor
      const val = el.env?.editor?.getValue?.();
      if (val && val.trim().length > 10) return val;
    } catch {}
  }
  // Ace: internal registry
  if (window.ace) {
    try {
      const instances = window.ace.edit.__instances ?? {};
      for (const ed of Object.values(instances)) {
        const val = ed?.getValue?.();
        if (val && val.trim().length > 10) return val;
      }
    } catch {}
    // Ace: try common container IDs used by GFG
    for (const id of ['code', 'editor', 'aceEditor', 'code-editor', 'ide-code-editor', 'ide_editor']) {
      try {
        const val = window.ace.edit(id).getValue();
        if (val && val.trim().length > 10) return val;
      } catch {}
    }
  }
  // CodeMirror
  const cm = document.querySelector('.CodeMirror');
  if (cm?.CodeMirror) return cm.CodeMirror.getValue();
  // Monaco
  if (window.monaco?.editor) {
    const models = window.monaco.editor.getModels();
    if (models.length) return models[0].getValue();
  }
  // Textarea fallback (GFG sometimes syncs code to hidden textarea)
  for (const ta of document.querySelectorAll('textarea')) {
    const val = ta.value;
    if (val && val.trim().length > 10) return val;
  }
  return null;
}

const GFG_LANG_MAP = {
  cpp: 'cpp', 'c++': 'cpp', cpp14: 'cpp', cpp17: 'cpp',
  java: 'java', python: 'python3', python3: 'python3',
  c: 'c', javascript: 'javascript', js: 'javascript',
};

async function syncToBackend(token, submissionId, slug, detail, codeFromEvent, langFromEvent) {
  const rawLang = langFromEvent ?? null;
  const language = (rawLang && GFG_LANG_MAP[rawLang.toLowerCase()]) ?? detectLanguage();
  const code = codeFromEvent || getEditorCode();
  if (!code) {
    console.warn('[LeetGeek] GFG: could not extract code from editor');
    return;
  }

  const info = detail?.data ?? detail ?? {};

  // Extract numeric ID from URL slug (e.g. "binary-search-1587115620" → "1587115620")
  const slugIdMatch = slug.match(/-?(\d{6,})$/);
  const problemId = String(info?.problem_id ?? info?.id ?? slugIdMatch?.[1] ?? submissionId);

  // Clean title: use API name, else derive from clean slug (no trailing number)
  const cleanTitle = info?.problem_name
    ?? cleanSlug(slug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

  const difficulty = info?.difficulty ?? info?.difficulty_level ?? info?.difficulty_rating ?? 'Medium';

  // Topic: cached page tags first (captured before SPA nav), then DOM, then API
  const domTags = _cachedTags.length ? _cachedTags : getTagsFromDom();
  console.log('[LeetGeek] GFG API info keys:', Object.keys(info).join(', '));
  const rawApiTags = info?.topic_list ?? info?.tags ?? info?.topic_tags ?? info?.subject_list ?? [];
  const apiTags = rawApiTags.map((t) => ({ name: typeof t === 'string' ? t : (t.name ?? t) }));
  const category = info?.category ?? info?.subject ?? null;
  const tags = domTags.length
    ? domTags
    : apiTags.length
    ? apiTags
    : category
    ? [{ name: category }]
    : [{ name: 'Uncategorized' }];
  console.log('[LeetGeek] GFG: using tags:', tags.map(t => t.name).join(', '));

  const payload = {
    submissionId,
    code,
    language,
    platform: 'geeksforgeeks',
    problem: {
      questionId: problemId,
      title: cleanTitle,
      titleSlug: cleanSlug(slug),
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
    console.log('[LeetGeek] GFG sync result:', data);
    if (data.status === 'committed') {
      const paths = data.filePaths ?? [data.filePath];
      console.log(`[LeetGeek] GFG ✓ Committed: ${paths.join(', ')}`);
      try { chrome.runtime.sendMessage({ type: 'COMMITTED', filePath: paths[0] }); } catch {}
    } else if (data.status === 'already_synced') {
      console.log('[LeetGeek] GFG: already synced.');
    } else {
      console.error('[LeetGeek] GFG error:', data.error);
      try { chrome.runtime.sendMessage({ type: 'ERROR', error: data.error }); } catch {}
    }
  } catch (err) {
    console.error('[LeetGeek] GFG sync error:', err);
    try { chrome.runtime.sendMessage({ type: 'ERROR', error: String(err) }); } catch {}
  }
}

async function handleAccepted(submissionId, codeFromEvent, langFromEvent) {
  const slug = getProblemSlug();
  if (!slug) { console.warn('[LeetGeek] GFG: no problem slug in URL'); return; }

  if (typeof chrome === 'undefined' || !chrome?.storage?.sync) {
    console.warn('[LeetGeek] GFG: extension context lost — reload the page');
    return;
  }
  let token = null;
  try {
    token = await new Promise((resolve) => {
      chrome.storage.sync.get(['extensionToken'], (r) => resolve(r.extensionToken ?? null));
    });
  } catch {
    console.warn('[LeetGeek] GFG: extension context invalidated — reload the page');
    return;
  }
  if (!token) { console.warn('[LeetGeek] GFG: no token — visit LeetGeek app'); return; }

  const detail = await fetchGFGProblemDetail(slug);
  await syncToBackend(token, submissionId, slug, detail, codeFromEvent, langFromEvent);
}

// --- Primary: event from inject_gfg.js ---
let handled = false;
window.addEventListener('__leetgeek_gfg_accepted', async (e) => {
  if (handled) return;
  handled = true;
  setTimeout(() => { handled = false; }, 15000);
  console.log('[LeetGeek] GFG accepted event', e.detail.submissionId, 'code:', e.detail.code?.length ?? 0, 'chars');
  await handleAccepted(e.detail.submissionId, e.detail.code, e.detail.lang);
});

// --- DOM fallback: watch for "Accuracy : 100%" or "Points Scored X/X" ---
let domHandled = false;
let domTimer = null;

const observer = new MutationObserver(() => {
  if (domHandled) return;
  if (domTimer) clearTimeout(domTimer);
  domTimer = setTimeout(checkDomForAccepted, 1000);
});
observer.observe(document.body, { childList: true, subtree: true });

async function checkDomForAccepted() {
  if (domHandled || handled) return;

  // Block on submissions list page (SPA navigates to ?sortBy=submissions)
  if (location.search.includes('sortBy=') || location.search.includes('page=')) return;

  // Only trigger if editor is present
  if (!document.querySelector('.ace_editor, .CodeMirror, [class*="monaco"]')) return;

  if (!findSuccessElement()) return;

  domHandled = true;
  setTimeout(() => { domHandled = false; }, 15000);

  console.log('[LeetGeek] GFG DOM fallback: accepted detected');
  await handleAccepted(String(Date.now()));
}

function findSuccessElement() {
  for (const el of document.querySelectorAll('div, p, span, td')) {
    const t = el.textContent?.trim() ?? '';
    // "Accuracy : 100%" or "Accuracy: 100%"
    if (/Accuracy\s*:?\s*100%/i.test(t)) return el;
    // "Points Scored X / X" where both numbers match
    const pts = t.match(/Points\s+Scored[^0-9]*(\d+)\s*\/\s*(\d+)/i);
    if (pts && pts[1] === pts[2] && pts[1] !== '0') return el;
  }
  return null;
}
