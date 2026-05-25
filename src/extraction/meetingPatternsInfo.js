import { debugFor, debugLog } from "../utilities/debugTool.js";

const debug = debugFor("meetingPatternsInfo");
debugLog({ local: { meetingPatternsInfo: false } });

function formatDayPart(dayPartRaw) {
  const tokens = String(dayPartRaw || "").match(/\([^)]*\)|\S+/g) || [];

  return tokens
    .map((token) => {
      const trimmed = token.trim();
      return /^\(\s*alternate\s+weeks\s*\)$/i.test(trimmed) ? "(Alternate Weeks)" : trimmed;
    })
    .filter(Boolean)
    .reduce((formatted, token) => {
      if (!formatted) return token;
      return token.startsWith("(") ? `${formatted} ${token}` : `${formatted} / ${token}`;
    }, "");
}

// Formats a meeting line for display. Input: line string. Output: { days, time, location }.
export function formatMeetingLineForPanel(line) {
  const raw = String(line || "");

  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  const dayPartRaw = parts.find((p) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(p)) || "";
  const dayPart = formatDayPart(dayPartRaw);

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
