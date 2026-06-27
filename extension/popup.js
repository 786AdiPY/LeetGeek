const tokenInput = document.getElementById("token");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(["extensionToken"], (r) => {
  if (r.extensionToken) {
    tokenInput.value = r.extensionToken;
    showStatus("Connected ✓", "ok");
  }
});

saveBtn.addEventListener("click", () => {
  const token = tokenInput.value.trim();
  if (!token) {
    showStatus("Paste your token first.", "err");
    return;
  }
  chrome.storage.sync.set({ extensionToken: token }, () => {
    showStatus("Saved! Solve a problem to test.", "ok");
  });
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}
