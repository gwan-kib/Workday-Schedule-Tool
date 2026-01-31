import { debugFor } from "./utilities/debugTool.js"; 

const debug = debugFor("background"); 

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
