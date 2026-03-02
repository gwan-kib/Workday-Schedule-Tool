import { STATE } from "../core/state.js";
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("export-ics");

const getLocalTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

// Formats a date as UTC datetime string. Input: Date. Output: string.
const formatDateTimeUTC = (date) => {
  const y = date.getUTCFullYear();
  const m = padNumbers(date.getUTCMonth() + 1);
  const d = padNumbers(date.getUTCDate());
  const hh = padNumbers(date.getUTCHours());
  const mm = padNumbers(date.getUTCMinutes());
  const ss = padNumbers(date.getUTCSeconds());
  const result = `${y}${m}${d}T${hh}${mm}${ss}Z`;
  debug.log("Formatting UTC Date:", result);
  return result;
};

const DAY_CODES = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};

const date_range_REGEX = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const time_range_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;
const days_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;

const padNumbers = (value) => String(value).padStart(2, "0");

// Escapes text per RFC 5545. Input: string. Output: escaped string.
const escapeIcsText = (value) => {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
};

// Folds a line to 75 octets with CRLF + space. Input: string. Output: folded string.
const foldIcsLine = (line) => {
  const max = 75;
  if (!line || line.length <= max) return line;

  let out = "";
  let idx = 0;
  while (idx < line.length) {
    const chunk = line.slice(idx, idx + max);
    out += chunk;
    idx += max;
    if (idx < line.length) out += "\r\n ";
  }
  return out;
};

// Builds a property line with escaping + folding. Input: name, value. Output: line string.
const buildPropLine = (name, value) => {
  const escaped = escapeIcsText(value);
  return foldIcsLine(`${name}:${escaped}`);
};

// Formats a date as YYYYMMDD. Input: Date. Output: string.
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = padNumbers(date.getMonth() + 1);
  const day = padNumbers(date.getDate());
  const result = `${year}${month}${day}`;
  debug.log("Formatted Date:", result);
  return result;
};

// Formats a date as local datetime string. Input: Date. Output: string.
const formatDateTime = (date) => {
  const datePart = formatDate(date);
  const hours = padNumbers(date.getHours());
  const minutes = padNumbers(date.getMinutes());

  const result = `${datePart}T${hours}${minutes}00`;
  debug.log("Formatted DateTime:", result);
  return result;
};

// Parses time tokens into 24h time. Input: hour token, minute token, period token. Output: { hours, minutes }.
const parseTime = (hoursToken, minutesToken, periodToken) => {
  let hours = Number.parseInt(hoursToken, 10);
  const minutes = Number.parseInt(minutesToken, 10);
  const period = periodToken.toLowerCase();

  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;

  const result = { hours, minutes };
  debug.log("Parsing Time:", result);
  return result;
};

// Parses a meeting line into structured data. Input: line string. Output: parsed object or null.
const parseMeetingLine = (line) => {
  const dateMatch = String(line || "").match(date_range_REGEX);
  const timeMatch = String(line || "").match(time_range_REGEX);
  const days = String(line || "").match(days_REGEX) || [];

  if (!dateMatch || !timeMatch || !days.length) return null;

  const startDate = dateMatch[1];
  const endDate = dateMatch[2];

  const startTime = parseTime(timeMatch[1], timeMatch[2], timeMatch[3]);
  const endTime = parseTime(timeMatch[4], timeMatch[5], timeMatch[6]);

  const uniqueDays = [...new Set(days.map((day) => DAY_CODES[day]).filter(Boolean))];

  const result = {
    startDate,
    endDate,
    days: uniqueDays,
    startTime,
    endTime,
  };
  debug.log("Parsed Meeting Line:", result);
  return result;
};

// Extracts a location label from a meeting line. Input: line string. Output: string.
const extractLocation = (line) => {
  const parts = String(line || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const locationPart = parts.find((part) => /\([A-Z]{2,}\)/.test(part));
  if (locationPart) return locationPart;

  const onlinePart = parts.find((part) => /online/i.test(part));
  if (onlinePart) return onlinePart;

  return "";
};

// Extracts building, floor, and room from a meeting line. Input: line string. Output: { building, floor, room }.
const extractBuildingFloorRoom = (line) => {
  const raw = String(line || "");
  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const building = parts.find((part) => /\([A-Z]{2,}\)/.test(part)) || "";

  const floorMatch = raw.match(/\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i);
  const roomMatch = raw.match(/\b(room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i);

  const floor = floorMatch ? floorMatch[1] : "";
  const room = roomMatch ? roomMatch[2] : "";

  return { building, floor, room };
};

// Finds the first valid date matching a day code. Input: start date string, day codes array. Output: Date.
const findFirstValidDate = (startDate, dayCodes) => {
  const start = new Date(`${startDate}T00:00:00`);

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const code = Object.values(DAY_CODES)[date.getDay() === 0 ? 6 : date.getDay() - 1];
    if (dayCodes.includes(code)) return date;
  }

  return start;
};

// Builds a calendar event object. Input: course object and meeting line string. Output: event object or null.
const buildClassEvent = (course, line) => {
  const parsed = parseMeetingLine(line);
  if (!parsed) return null;

  const firstDate = findFirstValidDate(parsed.startDate, parsed.days);
  const startDate = new Date(firstDate);
  startDate.setHours(parsed.startTime.hours, parsed.startTime.minutes, 0, 0);

  const endDate = new Date(firstDate);
  endDate.setHours(parsed.endTime.hours, parsed.endTime.minutes, 0, 0);

  const { building, floor, room } = extractBuildingFloorRoom(line);

  const summaryParts = [course.code, course.title].filter(Boolean);
  const descriptionLines = [
    course.section_number ? `Section: ${course.section_number}` : null,
    course.instructor ? `Instructor: ${course.instructor}` : null,
    course.instructionalFormat ? `Format: ${course.instructionalFormat}` : null,
    building ? `Building: ${building}` : null,
    floor ? `Floor: ${floor}` : null,
    room ? `Room: ${room}` : null,
  ].filter(Boolean);

  const untilLocal = new Date(`${parsed.endDate}T23:59:59`);
  const untilDate = formatDateTimeUTC(untilLocal);

  const result = {
    uid: `${course.code || "course"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    summary: summaryParts.join(" - ") || "Scheduled Course",
    description: descriptionLines.join("\n"),
    location: extractLocation(line),
    dtstart: formatDateTime(startDate),
    dtend: formatDateTime(endDate),
    rrule: `FREQ=WEEKLY;BYDAY=${parsed.days.join(",")};UNTIL=${untilDate}`,
  };
  debug.log("Built Class Event:", result);
  return result;
};

// Builds a full ICS file string from courses. Input: array of courses. Output: string.
const buildICSFile = (courses) => {
  const events = [];

  courses.forEach((course) => {
    const lines = course.meetingLines?.length ? course.meetingLines : [];
    lines.forEach((line) => {
      const event = buildClassEvent(course, line);
      if (event) events.push(event);
    });
  });

  const tzid = getLocalTimeZone();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Workday Extension//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${tzid}`,
  ];

  events.forEach((event) => {
    lines.push("BEGIN:VEVENT");
    lines.push(buildPropLine("UID", event.uid));
    lines.push(buildPropLine("SUMMARY", event.summary));
    if (event.description) lines.push(buildPropLine("DESCRIPTION", event.description));
    if (event.location) lines.push(buildPropLine("LOCATION", event.location));
    lines.push(foldIcsLine(`DTSTART;TZID=${tzid}:${event.dtstart}`));
    lines.push(foldIcsLine(`DTEND;TZID=${tzid}:${event.dtend}`));
    lines.push(foldIcsLine(`RRULE:${event.rrule}`));
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  const result = lines.join("\r\n");
  debug.log("ICS File Generated:", result);
  return result;
};

// Exports the current schedule as an ICS download. Input: schedule name string or null. Output: none.
export function exportICS(scheduleName) {
  const ics = buildICSFile(STATE.filtered || []);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const filename = scheduleName ? `${"[WST] " + scheduleName.replace(/[\\/:*?"<>|]/g, "-")}.ics` : "[WST] Schedule.ics";
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  debug.log("Download Triggered for ICS file");

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
