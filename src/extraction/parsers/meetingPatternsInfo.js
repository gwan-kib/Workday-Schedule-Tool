import { debugFor } from "../../utilities/debugTool.js";

const debug = debugFor("meetingPatternsInfo");

const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

// Extracts meeting lines from a container element. Input: element. Output: array of strings.
export function extractMeetingLines(containerEl) {
  if (!containerEl) {
    debug.log({ id: "extractMeetingLines.missing" }, []);
    return [];
  }

  const items = Array.from(containerEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));
  const lines = items.map((el) => (el.getAttribute("aria-label") || "").trim()).filter(Boolean);

  debug.log({ id: "extractMeetingLines.items" }, lines);

  const filtered = lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));

  debug.log({ id: "extractMeetingLines.filtered" }, filtered);

  return filtered;
}

// Determines whether a delivery mode cell indicates online learning. Input: element. Output: boolean.
export function isOnlineDelivery(deliveryModeCellEl) {
  if (!deliveryModeCellEl) {
    debug.log({ id: "isOnlineDelivery.missing" }, false);
    return false;
  }

  const txt = (deliveryModeCellEl.innerText || deliveryModeCellEl.textContent || "").trim();
  if (/online learning/i.test(txt)) {
    debug.log({ id: "isOnlineDelivery.match.direct" }, true);
    return true;
  }

  const prompts = Array.from(deliveryModeCellEl.querySelectorAll('[data-automation-id="promptOption"]'));

  const matched = prompts.some((el) => {
    const label = el.getAttribute("data-automation-label") || el.getAttribute("title") || el.textContent || "";
    return /online learning/i.test(label);
  });

  debug.log({ id: "isOnlineDelivery.match.prompts" }, matched);

  return matched;
}

// Formats a meeting line for display. Input: line string. Output: { days, time, location }.
export function formatMeetingLineForPanel(line) {
  const raw = String(line || "");

  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  const dayPartRaw = parts.find((p) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(p)) || "";
  const dayPart = dayPartRaw.split(/\s+/).join(" / ");

  const timePart = parts.find((p) => /\d{1,2}:\d{2}/.test(p) && /-/.test(p)) || "";

  const buildingPart = parts.find((p) => /\([A-Z]{2,}\)/.test(p)) || "";

  const floorMatch = raw.match(/\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i);
  const roomMatch = raw.match(/\b(room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i);

  const floorPart = floorMatch ? `Floor: ${floorMatch[1]}` : "";
  const roomPart = roomMatch ? `Room: ${roomMatch[2]}` : "";

  const formatted = {
    days: dayPart,
    time: timePart,
    location: [buildingPart, [floorPart, roomPart].filter(Boolean).join(" | ")].filter(Boolean).join("\n"),
  };

  debug.log({ id: "formatMeetingLineForPanel" }, formatted);

  return formatted;
}

// Normalizes meeting patterns text. Input: string. Output: normalized string.
export function normalizeMeetingPatternsText(text) {
  const normalized = String(text || "")
    .split(/\r?\n(.*)/s)
    .slice(0, 2)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  debug.log({ id: "normalizeMeetingPatternsText" }, normalized);

  return normalized;
}

// Extracts a start date from a line. Input: string. Output: date string.
export function extractStartDate(line) {
  const match = String(line || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const out = match ? match[1] : "";

  debug.log({ id: "extractStartDate" }, out);

  return out;
}
