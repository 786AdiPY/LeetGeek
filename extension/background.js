// LeetSync — background service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "COMMITTED") {
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
  }

  if (msg.type === "ERROR") {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
  }
});
