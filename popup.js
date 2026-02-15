// popup.js - send manual topic to content script

document.getElementById("analyze-topic").addEventListener("click", () => {
  const input = document.getElementById("manual-topic");
  const topic = input.value.trim();
  if (!topic) {
    input.focus();
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab?.id) return;

    chrome.tabs.sendMessage(
      tab.id,
      { type: "TOPIC_TUTOR_FORCE_ANALYZE", payload: { topic } },
      () => {
        // no-op; content script will handle or ignore
      }
    );
  });
});
