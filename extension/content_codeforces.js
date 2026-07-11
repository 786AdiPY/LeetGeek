const BACKEND = 'https://leet-geek.vercel.app';

console.log('[LeetGeek] Codeforces content script loaded');

// Mark this platform as "seen" so the dashboard can show it as connected.
try { chrome.storage.local.get(['lg_seen'], (r) => { const s = r.lg_seen || {}; if (!s.codeforces) { s.codeforces = true; chrome.storage.local.set({ lg_seen: s }); } }); } catch {}

// Codeforces submits via a full-page form POST that navigates to the status
// page — so instead of intercepting the submit, we read everything back from
// Codeforces itself: the official API for verdicts/metadata, and the submission
// page for the source. This runs on the status / submissions pages.

const RECENT_SECONDS = 300; // only auto-sync submissions from the last 5 minutes
const _syncedThisSession = new Set();

function getHandle() {
  for (const a of document.querySelectorAll('a[href^="/profile/"]')) {
    const m = a.getAttribute('href').match(/\/profile\/([^/?#]+)/);
    if (m && m[1]) return m[1];
  }
  return null;
}

function mapLanguage(pl) {
  const v = String(pl ?? '').toLowerCase();
  if (v.includes('python') || v.includes('pypy')) return 'python3';
  if (v.includes('c++') || v.includes('g++') || v.includes('clang++')) return 'cpp';
  if (v.includes('java') && !v.includes('script')) return 'java';
  if (v.includes('kotlin')) return 'kotlin';
  if (v.includes('c#') || v.includes('mono') || v.includes('.net')) return 'csharp';
  if (v.includes('javascript') || v.includes('node')) return 'javascript';
  if (v.includes('rust')) return 'rust';
  if (v.includes('go')) return 'go';
  if (/\bgcc\b|\bc11\b|\bc\b|clang/.test(v)) return 'c';
  return 'cpp';
}

function ratingToDifficulty(r) {
  if (!r) return 'Medium';
  if (r <= 1200) return 'Easy';
  if (r <= 1900) return 'Medium';
  return 'Hard';
}

// Pull the source from the submission page (same-origin, uses your session).
async function fetchSource(contestId, submissionId) {
  const urls = [
    `https://codeforces.com/contest/${contestId}/submission/${submissionId}`,
    `https://codeforces.com/problemset/submission/${contestId}/${submissionId}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const pre = doc.querySelector('#program-source-text');
      const code = pre?.textContent;
      if (code && code.trim().length > 5) return code;
    } catch {}
  }
  return null;
}

async function getToken() {
  try {
    return await new Promise((resolve) => chrome.storage.sync.get(['extensionToken'], (r) => resolve(r.extensionToken ?? null)));
  } catch {
    console.warn('[LeetGeek] Codeforces: extension context invalidated — reload page');
    return null;
  }
}

async function syncSubmission(token, sub) {
  const p = sub.problem;
  const questionId = `${p.contestId}${p.index}`;
  if (_syncedThisSession.has(sub.id)) return;

  const code = await fetchSource(p.contestId, sub.id);
  if (!code) {
    console.warn('[LeetGeek] Codeforces: could not fetch source for', sub.id);
    return;
  }

  const payload = {
    submissionId: String(sub.id),
    code,
    language: mapLanguage(sub.programmingLanguage),
    platform: 'codeforces',
    problem: {
      questionId,
      title: p.name || questionId,
      titleSlug: questionId, // e.g. "1547B" → Codeforces/1547B.cpp
      difficulty: ratingToDifficulty(p.rating),
      topicTags: (p.tags && p.tags.length ? p.tags : ['Uncategorized']).map((t) => ({ name: t })),
    },
  };

  try {
    const res = await fetch(`${BACKEND}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-extension-token': token },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('[LeetGeek] Codeforces sync result:', data);
    if (data.status === 'committed') {
      _syncedThisSession.add(sub.id);
      const paths = data.filePaths ?? [data.filePath];
      console.log(`[LeetGeek] Codeforces ✓ Committed: ${paths.join(', ')}`);
      try { chrome.runtime.sendMessage({ type: 'COMMITTED', filePath: paths[0] }); } catch {}
    } else if (data.status === 'already_synced') {
      _syncedThisSession.add(sub.id);
      console.log('[LeetGeek] Codeforces: already synced.');
    } else {
      console.error('[LeetGeek] Codeforces error:', data.error);
    }
  } catch (err) {
    console.error('[LeetGeek] Codeforces sync error:', err);
  }
}

// Poll the API: look at the newest submission; if it's a recent Accepted, sync it.
// Keeps polling while the newest is still "TESTING" (verdict null).
async function run() {
  const handle = getHandle();
  if (!handle) {
    console.warn('[LeetGeek] Codeforces: no handle found — are you logged in?');
    return;
  }
  const token = await getToken();
  if (!token) {
    console.warn('[LeetGeek] Codeforces: no extension token — visit the LeetGeek app to get one');
    return;
  }

  const nowSec = () => Math.floor(new Date().getTime() / 1000);

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10`);
      const data = await res.json();
      if (data.status === 'OK' && data.result.length) {
        const newest = data.result[0];
        const age = nowSec() - (newest.creationTimeSeconds || 0);
        console.log('[LeetGeek] Codeforces: newest submission', newest.id, 'verdict', newest.verdict, `${age}s ago`);

        // Only care about recent submissions (the one you just made).
        if (age > RECENT_SECONDS) return;
        if (!newest.verdict || newest.verdict === 'TESTING') {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (newest.verdict === 'OK') {
          await syncSubmission(token, newest);
        } else {
          console.log('[LeetGeek] Codeforces: latest submission not accepted —', newest.verdict);
        }
        return;
      }
    } catch (e) {
      console.warn('[LeetGeek] Codeforces API error', e);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

run();
