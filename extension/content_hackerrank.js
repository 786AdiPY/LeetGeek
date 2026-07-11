const BACKEND = 'https://leet-geek.vercel.app';

console.log('[LeetGeek] HackerRank content script loaded');

// Mark this platform as "seen" so the dashboard can show it as connected.
try { chrome.storage.local.get(['lg_seen'], (r) => { const s = r.lg_seen || {}; if (!s.hackerrank) { s.hackerrank = true; chrome.storage.local.set({ lg_seen: s }); } }); } catch {}

// Inject page-context interceptor
(function injectScript() {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('inject_hackerrank.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();

// Challenge slug from the URL:
//   /challenges/{slug}/problem
//   /contests/{contest}/challenges/{slug}
function getSlug() {
  const m = location.pathname.match(/\/challenges\/([^/]+)/i);
  return m ? m[1] : null;
}

function getTitle(slug) {
  const sels = [
    '.challenge-page-label',
    '.hr_tour-challenge_name',
    '.challenge-name-details h1',
    '.ui-icon-challenge-name',
    'h1.page-label',
    'header h1',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    const t = el?.textContent?.trim();
    if (t && t.length > 1 && t.length < 120) return t;
  }
  // Fallback: derive from slug
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDifficulty() {
  for (const el of document.querySelectorAll('[class*="difficulty"], .difficulty-block, .ui-icon-difficulty')) {
    const t = el.textContent?.trim().toLowerCase() ?? '';
    if (t.includes('easy')) return 'Easy';
    if (t.includes('medium')) return 'Medium';
    if (t.includes('hard')) return 'Hard';
  }
  return 'Medium';
}

function getTags() {
  const tags = [];
  for (const el of document.querySelectorAll('.challenge-domain a, [class*="topic"] a, .breadcrumb a')) {
    const t = el.textContent?.trim();
    if (t && t.length > 1 && t.length < 40 && !/^home$/i.test(t)) tags.push({ name: t });
  }
  return tags;
}

// HackerRank language ids → our canonical language.
function mapLanguage(lang) {
  const v = String(lang ?? '').toLowerCase();
  if (v.includes('python') || v.includes('pypy')) return 'python3';
  if (v.includes('cpp') || v.includes('c++')) return 'cpp';
  if (v.includes('java') && !v.includes('script')) return 'java';
  if (v.includes('kotlin')) return 'kotlin';
  if (v.includes('csharp') || v.includes('c#')) return 'csharp';
  if (v.includes('javascript') || v.includes('node')) return 'javascript';
  if (v.includes('rust')) return 'rust';
  if (v === 'go' || v.includes('golang')) return 'go';
  if (v === 'c' || v.includes('clang')) return 'c';
  return 'cpp';
}

async function syncToBackend(token, detail) {
  const slug = getSlug();
  if (!slug) { console.warn('[LeetGeek] HackerRank: no slug in URL'); return; }
  if (!detail.code) { console.warn('[LeetGeek] HackerRank: no code captured'); return; }

  const payload = {
    submissionId: detail.submissionId,
    code: detail.code,
    language: mapLanguage(detail.lang),
    platform: 'hackerrank',
    problem: {
      questionId: slug,
      title: getTitle(slug),
      titleSlug: slug,
      difficulty: getDifficulty(),
      topicTags: getTags().length ? getTags() : [{ name: 'Uncategorized' }],
    },
  };

  try {
    const res = await fetch(`${BACKEND}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-extension-token': token },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('[LeetGeek] HackerRank sync result:', data);
    if (data.status === 'committed') {
      const paths = data.filePaths ?? [data.filePath];
      console.log(`[LeetGeek] HackerRank ✓ Committed: ${paths.join(', ')}`);
      try { chrome.runtime.sendMessage({ type: 'COMMITTED', filePath: paths[0] }); } catch {}
    } else if (data.status === 'already_synced') {
      console.log('[LeetGeek] HackerRank: already synced.');
    } else {
      console.error('[LeetGeek] HackerRank error:', data.error);
    }
  } catch (err) {
    console.error('[LeetGeek] HackerRank sync error:', err);
  }
}

let handled = false;
window.addEventListener('__leetgeek_hr_accepted', async (e) => {
  if (handled) return;
  handled = true;
  setTimeout(() => { handled = false; }, 15000);

  let token = null;
  try {
    token = await new Promise((resolve) => chrome.storage.sync.get(['extensionToken'], (r) => resolve(r.extensionToken ?? null)));
  } catch {
    console.warn('[LeetGeek] HackerRank: extension context invalidated — reload page');
    return;
  }
  if (!token) {
    console.warn('[LeetGeek] HackerRank: no extension token — visit the LeetGeek app to get one');
    return;
  }
  await syncToBackend(token, e.detail);
});
