import { queryProfRating, RMP_MESSAGE_TYPE } from "./rateMyProfessor/rmpApi.js";
import { debugFor, debugLog } from "./utilities/debugTool.js";

const debug = debugFor("background");
debugLog({ local: { background: false } });

// Handles background data fetch requests from content scripts. Input: runtime message. Output: async response payload.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== RMP_MESSAGE_TYPE) return undefined;

  void (async () => {
    try {
      const data = await queryProfRating(message?.payload || {});
      sendResponse({ ok: true, data });
    } catch (error) {
      debug.error("Failed to fetch professor rating", {
        sender: sender?.tab?.id || "unknown",
        error: String(error),
      });
      sendResponse({ ok: false, error: error?.message || "Failed to fetch professor rating" });
    }
  })();

  return true;
});
