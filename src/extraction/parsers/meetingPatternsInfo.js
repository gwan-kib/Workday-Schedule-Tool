import { debugFor } from "../../utilities/debugTool.js";

const debug = debugFor("meetingPatternsInfo");

const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

export function extractMeetingLines(containerEl) {
  if (!containerEl) {
    debug.log({ id: "extractMeetingLines.missing" }, "No container element provided");
    return [];
  }

  const items = Array.from(containerEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));
  const lines = items.map((el) => (el.getAttribute("aria-label") || "").trim()).filter(Boolean);

  debug.log({ id: "extractMeetingLines.items" }, "Menu item lines:", { count: lines.length });

  const filtered = lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));

  debug.log({ id: "extractMeetingLines.filtered" }, "Filtered meeting lines:", {
    before: lines.length,
    after: filtered.length,
  });

  return filtered;
}

export function isOnlineDelivery(deliveryModeCellEl) {
  if (!deliveryModeCellEl) {
    debug.log({ id: "isOnlineDelivery.missing" }, "No delivery mode cell provided");
    return false;
  }

  const txt = (deliveryModeCellEl.innerText || deliveryModeCellEl.textContent || "").trim();
  if (/online learning/i.test(txt)) {
    debug.log({ id: "isOnlineDelivery.match.direct" }, "Matched online learning from cell text", txt);
    return true;
  }

  const prompts = Array.from(deliveryModeCellEl.querySelectorAll('[data-automation-id="promptOption"]'));

  const matched = prompts.some((el) => {
    const label = el.getAttribute("data-automation-label") || el.getAttribute("title") || el.textContent || "";
    return /online learning/i.test(label);
  });

  debug.log({ id: "isOnlineDelivery.match.prompts" }, "Checked prompt options for online learning", {
    promptCount: prompts.length,
    matched,
  });

  return matched;
}

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

  debug.log({ id: "formatMeetingLineForPanel" }, "Formatted meeting line:", { raw, formatted });

  return formatted;
}

export function normalizeMeetingPatternsText(text) {
  const normalized = String(text || "")
    .split(/\r?\n(.*)/s)
    .slice(0, 2)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  debug.log({ id: "normalizeMeetingPatternsText" }, "Normalized meeting patterns text:", {
    beforeLen: String(text || "").length,
    afterLen: normalized.length,
    ogText: text,
    ogString: String(text || ""),
    normalized,
  });

  return normalized;
}

export function extractStartDate(line) {
  const match = String(line || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const out = match ? match[1] : "";

  debug.log({ id: "extractStartDate" }, "Extracted start date:", { line, out });

  return out;
}
