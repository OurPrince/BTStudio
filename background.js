chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes("aistudio.google.com")) {
    chrome.tabs.sendMessage(tab.id, { action: "openBTStudio" }).catch(() => {
      console.log("[BTStudio] Could not open panel. Is the page fully loaded?");
    });
  }
});
