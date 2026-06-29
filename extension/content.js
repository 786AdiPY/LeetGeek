// LeetSync — content script (runs on leetcode.com/problems/*)
const BACKEND = "https://leet-geek.vercel.app";

console.log('[LeetGeek] Content script loaded');

// Inject page-context script to intercept fetch/XHR
const injected = document.createElement("script");
injected.src = chrome.runtime.getURL("inject.js");
(document.head ?? document.documentElement).appendChild(injected);
injected.onload = () => { console.log('[LeetGeek] inject.js injected'); injected.remove(); };

// --- Primary: event from inject.js ---
window.addEventListener("__leetsync_accepted", async (e) => {
  console.log('[LeetGeek] Accepted event received', e.detail.submissionId);
  await handleAccepted(e.detail.submissionId);
});

// --- Fallback: DOM mutation observer ---
let domHandled = false;
let domTimer = null;

const observer = new MutationObserver(() => {
  if (domHandled) return;
  if (domTimer) clearTimeout(domTimer);
  domTimer = setTimeout(checkDomForAccepted, 800);
});
observer.observe(document.body, { childList: true, subtree: true });

async function checkDomForAccepted() {
  const accepted = findAcceptedElement();
  if (!accepted) return;

  domHandled = true;
  setTimeout(() => { domHandled = false; }, 15000); // reset after 15s

  console.log('[LeetGeek] DOM fallback: Accepted detected');

  // Get slug from URL, fetch latest AC submission for this problem
  const slug = location.pathname.split("/problems/")[1]?.replace(/\/$/, "").split("/")[0];
  if (!slug) return;

  const sub = await getLatestACForProblem(slug);
  if (!sub) { console.warn('[LeetGeek] Could not find submission ID from DOM fallback'); return; }

  await handleAccepted(sub.id);
}

function findAcceptedElement() {
  // Try known LC selectors first
  for (const sel of ['[data-e2e-locator="submission-result"]', '.text-green-s']) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim() === "Accepted") return el;
    } catch {}
  }
  // Generic fallback — leaf node with exactly "Accepted"
  for (const el of document.querySelectorAll("span, div, p")) {
    if (el.children.length === 0 && el.textContent?.trim() === "Accepted") return el;
  }
  return null;
}

async function getLatestACForProblem(slug) {
  // Uses authenticated session (same origin) — no username needed
  const query = `
    query submissionList($questionSlug: String!) {
      submissionList(offset: 0, limit: 5, questionSlug: $questionSlug) {
        submissions { id statusDisplay }
      }
    }
  `;
  try {
    const resp = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrftoken": getCsrf() },
      body: JSON.stringify({ query, variables: { questionSlug: slug } }),
    });
    const json = await resp.json();
    const subs = json?.data?.submissionList?.submissions ?? [];
    return subs.find((s) => s.statusDisplay === "Accepted") ?? null;
  } catch (err) {
    console.error('[LeetGeek] submissionList error:', err);
    return null;
  }
}

// --- Shared logic ---
async function handleAccepted(submissionId) {
  const token = await getToken();
  if (!token) { console.warn('[LeetGeek] No token. Open popup and paste token.'); return; }

  const detail = await fetchSubmissionDetail(submissionId);
  if (!detail) { console.error('[LeetGeek] Could not fetch submission detail'); return; }

  await syncToBackend(token, submissionId, detail);
}

function getToken() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(["extensionToken"], (r) => resolve(r.extensionToken ?? null));
    } catch {
      console.warn('[LeetGeek] Extension context invalidated — reload page');
      resolve(null);
    }
  });
}

function getCsrf() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : "";
}

async function fetchSubmissionDetail(submissionId) {
  const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        lang { name }
        question {
          questionId title titleSlug difficulty
          topicTags { name }
        }
      }
    }
  `;
  try {
    const resp = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrftoken": getCsrf(), Referer: "https://leetcode.com" },
      body: JSON.stringify({ query, variables: { submissionId: parseInt(submissionId, 10) } }),
    });
    const json = await resp.json();
    return json?.data?.submissionDetails ?? null;
  } catch (err) {
    console.error("[LeetGeek] GraphQL error:", err);
    return null;
  }
}

async function syncToBackend(token, submissionId, detail) {
  const payload = {
    submissionId,
    code: detail.code,
    language: detail.lang.name,
    platform: 'leetcode',
    problem: {
      questionId: detail.question.questionId,
      title: detail.question.title,
      titleSlug: detail.question.titleSlug,
      difficulty: detail.question.difficulty,
      topicTags: detail.question.topicTags,
    },
  };

  console.log('[LeetGeek] Syncing to backend...');
  try {
    const resp = await fetch(`${BACKEND}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-extension-token": token },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (result.status === "committed") {
      const paths = result.filePaths ?? [result.filePath];
      console.log(`[LeetGeek] ✓ Committed: ${paths.join(", ")}`);
      chrome.runtime.sendMessage({ type: "COMMITTED", filePath: paths[0] });
    } else if (result.status === "already_synced") {
      console.log("[LeetGeek] Already synced.");
    } else {
      console.error("[LeetGeek] Error:", result.error);
      chrome.runtime.sendMessage({ type: "ERROR", error: result.error });
    }
  } catch (err) {
    console.error("[LeetGeek] Network error:", err);
  }
}
