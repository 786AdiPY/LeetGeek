// Runs on the LeetGeek dashboard — bridges the "seen platform" flags from
// extension storage into the page so the dashboard can show which platforms
// the extension has actually run on.
(function () {
  function post() {
    try {
      chrome.storage.local.get(['lg_seen'], (r) => {
        const seen = r.lg_seen || {};
        const platforms = Object.keys(seen).filter((k) => seen[k]);
        window.postMessage({ source: 'leetgeek-extension', type: 'SEEN_PLATFORMS', platforms }, '*');
      });
    } catch {}
  }
  post();
  // Re-post shortly after in case the page's listener mounts late.
  setTimeout(post, 1500);
})();
