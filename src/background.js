import { debugFor } from "./utilities/debugTool.js"; 

const debug = debugFor("background"); 

// Handles action button clicks by sending a toggle message to the active tab. Input: Chrome tab object. Output: none.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;

  debug.log("Action button clicked, sending message to tab:", { tabId: tab.id }); 

  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_WIDGET" }, () => {
    if (chrome.runtime.lastError) {
      debug.error("Error sending message to tab:", chrome.runtime.lastError);
    } else {
      debug.log("Message successfully sent to toggle widget."); 
    }
  });
});
