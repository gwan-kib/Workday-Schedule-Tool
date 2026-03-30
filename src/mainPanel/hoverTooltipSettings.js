import { debugFor, debugLog } from "../utilities/debugTool.js";

const debug = debugFor("hoverTooltipSettings");
debugLog({ local: { hoverTooltipSettings: false } });

const STORAGE_KEY = "wdHoverTooltipsEnabled";
const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

const normalizeHoverTooltipSetting = (value) => {
  if (typeof value === "boolean") return value;
  return true;
};

// Loads hover tooltip setting from storage. Input: none. Output: boolean.
export async function loadHoverTooltipSetting() {
  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(normalizeHoverTooltipSetting(result?.[STORAGE_KEY]));
      });
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return true;
    return normalizeHoverTooltipSetting(raw === "true");
  } catch (error) {
    debug.error("Failed to load hover tooltip setting", error);
    return true;
  }
}

// Persists hover tooltip setting to storage. Input: boolean. Output: none.
export async function persistHoverTooltipSetting(enabled) {
  const normalized = normalizeHoverTooltipSetting(enabled);

  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => resolve());
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, String(normalized));
  } catch (error) {
    debug.error("Failed to save hover tooltip setting", error);
  }
}
