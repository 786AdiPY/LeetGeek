// Runs in page context — intercepts fetch/XHR for submission check
(function () {
  console.log('[LeetGeek] inject.js active');

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");

    // REST check endpoint
    const restMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
    if (restMatch) {
      res.clone().json().then((data) => {
        if (data?.status_msg === "Accepted") {
          console.log('[LeetGeek] REST: Accepted', restMatch[1]);
          window.dispatchEvent(new CustomEvent("__leetsync_accepted", {
            detail: { submissionId: restMatch[1] },
          }));
        }
      }).catch(() => {});
    }

    // GraphQL submissionDetail
    if (url.includes("/graphql")) {
      const bodyStr = args[1]?.body;
      if (typeof bodyStr === "string" && bodyStr.includes("submissionDetail")) {
        res.clone().json().then((data) => {
          const d = data?.data?.submissionDetail;
          if (d?.statusDisplay === "Accepted" && d?.id) {
            console.log('[LeetGeek] GraphQL: Accepted', d.id);
            window.dispatchEvent(new CustomEvent("__leetsync_accepted", {
              detail: { submissionId: String(d.id) },
            }));
          }
        }).catch(() => {});
      }
    }

    return res;
  };

  // XHR fallback
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__lc_url = url;
    return _open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      const match = (this.__lc_url ?? "").match(/\/submissions\/detail\/(\d+)\/check\/?/);
      if (!match) return;
      try {
        const data = JSON.parse(this.responseText);
        if (data?.status_msg === "Accepted") {
          console.log('[LeetGeek] XHR: Accepted', match[1]);
          window.dispatchEvent(new CustomEvent("__leetsync_accepted", {
            detail: { submissionId: match[1] },
          }));
        }
      } catch {}
    });
    return _send.apply(this, args);
  };
})();
