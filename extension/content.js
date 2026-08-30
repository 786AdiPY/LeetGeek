// LeetSync — content script (runs on leetcode.com/problems/*)
const BACKEND = "https://leet-geek.vercel.app";

console.log('[LeetGeek] Content script loaded');

// Mark this platform as "seen" so the dashboard can show it as connected.
try { chrome.storage.local.get(['lg_seen'], (r) => { const s = r.lg_seen || {}; if (!s.leetcode) { s.leetcode = true; chrome.storage.local.set({ lg_seen: s }); } }); } catch {}

// Inject page-context script to intercept fetch/XHR
const injected = document.createElement("script");
injected.src = chrome.runtime.getURL("inject.js");
(document.head ?? document.documentElement).appendChild(injected);
injected.onload = () => { console.log('[LeetGeek] inject.js injected'); injected.remove(); };

// --- Primary: event from inject.js ---
window.addEventListener("__leetsync_accepted", async (e) => {
  console.log('[LeetGeek] Accepted event received', e.detail.submissionId);
  document.getElementById("__leetgeek_toast")?.remove(); // clear any "stuck?" hint
  await handleAccepted(e.detail.submissionId, e.detail.code, e.detail.lang);
});

// --- Wrong submission: suggest a video solution (free YouTube search) ---
let _wrongToastAt = 0;
window.addEventListener("__leetgeek_wrong", (e) => {
  const now = Date.now();
  if (now - _wrongToastAt < 20000) return; // debounce repeated fails
  _wrongToastAt = now;
  showVideoSuggestion(e.detail?.status);
});

function currentProblemTitle() {
  const t = (document.title || "").replace(/\s*-\s*LeetCode.*$/i, "").trim();
  if (t) return t;
  const slug = location.pathname.split("/problems/")[1]?.replace(/\/$/, "").split("/")[0] || "";
  return slug.replace(/-/g, " ");
}

function showVideoSuggestion(status) {
  const title = currentProblemTitle();
  if (!title) return;
  document.getElementById("__leetgeek_toast")?.remove();

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(title + " leetcode solution")}`;

  const box = document.createElement("div");
  box.id = "__leetgeek_toast";
  box.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483647;width:290px;" +
    "background:#ebddc5;color:#201e1d;border:1px solid rgba(32,30,29,.16);" +
    "border-radius:16px;box-shadow:0 12px 32px rgba(46,43,37,.22);padding:14px 16px;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.4;";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
  const brand = document.createElement("span");
  brand.textContent = "⚡ LeetGeek";
  brand.style.cssText = "font-weight:700;font-size:12px;color:#c67139;margin-right:auto;";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;color:#82796a;padding:0 2px;";
  close.onclick = () => box.remove();
  head.appendChild(brand);
  head.appendChild(close);

  const msg = document.createElement("div");
  msg.textContent = `${status || "Not accepted"} — stuck on this one?`;
  msg.style.cssText = "margin-bottom:10px;";

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "▶  Watch video solutions";
  link.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:600;font-size:13px;" +
    "background:#c67139;color:#f5ead8;padding:8px 14px;border-radius:999px;";

  box.appendChild(head);
  box.appendChild(msg);
  box.appendChild(link);
  document.body.appendChild(box);

  setTimeout(() => box.remove(), 18000); // auto-dismiss
}

// --- Fallback: DOM mutation observer ---
let domHandled = false;
let domTimer = null;

const observer = new MutationObserver(() => {
  if (domTimer) clearTimeout(domTimer);
  domTimer = setTimeout(() => { checkDomForAccepted(); checkDomForWrong(); }, 800);
});
observer.observe(document.body, { childList: true, subtree: true });

// Suggest a video when the result banner shows a failed verdict — driven by the
// DOM so it works regardless of which network path the LeetCode UI uses.
const FAIL_VERDICTS = [
  "Wrong Answer", "Compile Error", "Time Limit Exceeded",
  "Runtime Error", "Memory Limit Exceeded", "Output Limit Exceeded",
];
function checkDomForWrong() {
  const el = document.querySelector('[data-e2e-locator="submission-result"]');
  const txt = el?.textContent?.trim() || "";
  if (!txt || txt === "Accepted") return;
  const verdict = FAIL_VERDICTS.find((v) => txt.includes(v));
  if (!verdict) return;
  const now = Date.now();
  if (now - _wrongToastAt < 20000) return; // debounce
  _wrongToastAt = now;
  showVideoSuggestion(verdict);
}

async function checkDomForAccepted() {
  if (domHandled) return;
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
  // Only the official submission-result banner — matching any "Accepted" text on
  // the page gives false positives (acceptance rate, submission history, filters),
  // which is what fired on a Compile Error.
  const el = document.querySelector('[data-e2e-locator="submission-result"]');
  return el && el.textContent?.trim() === "Accepted" ? el : null;
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
