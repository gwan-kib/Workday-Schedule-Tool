import { debugFor, debugLog } from "../../utilities/debugTool.js";

const debug = debugFor("calendar-event-builder");
debugLog({ local: { "calendar-event-builder": false } });

const DAY_CODES = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};

const ORDERED_DAY_CODES = Object.values(DAY_CODES);

// Maps the Workday extension's default course color slots to the closest of Google Calendar's 11 event colors.
// Workday slot order (from courseColorSettings.COURSE_COLOR_LABELS): Red, Orange, Purple, Blue, Yellow, Green, Teal, Pink.
// Google IDs: 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana, 6=Tangerine,
//             7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato.
const WORKDAY_TO_GCAL_COLOR_ID = {
  1: "11", // Red    -> Tomato
  2: "6",  // Orange -> Tangerine
  3: "3",  // Purple -> Grape
  4: "9",  // Blue   -> Blueberry
  5: "5",  // Yellow -> Banana
  6: "10", // Green  -> Basil
  7: "7",  // Teal   -> Peacock
  8: "4",  // Pink   -> Flamingo
};

const colorIdForCourse = (course) => {
  const idx = course?.colorIndex;
  return Number.isInteger(idx) ? WORKDAY_TO_GCAL_COLOR_ID[idx] : undefined;
};

const DATE_RANGE_RE = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;
const DAYS_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;
const ROOM_RE = /\b(?:room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i;
const FLOOR_RE = /\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i;

const padNumbers = (value) => String(value).padStart(2, "0");

// Converts a 12h time token triple into 24h. Input: hour, minute, period strings. Output: { hours, minutes }.
const parseTime = (hourToken, minuteToken, periodToken) => {
  let hours = Number.parseInt(hourToken, 10);
  const minutes = Number.parseInt(minuteToken, 10);
  const period = periodToken.toLowerCase();
  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;
  return { hours, minutes };
};

// Parses a Workday meeting line into structured fields. Input: line string. Output: parsed object or null.
const parseMeetingLine = (line) => {
  const text = String(line || "");
  const dateMatch = text.match(DATE_RANGE_RE);
  const timeMatch = text.match(TIME_RANGE_RE);
  const days = text.match(DAYS_RE) || [];
  if (!dateMatch || !timeMatch || !days.length) return null;

  const dayCodes = [...new Set(days.map((d) => DAY_CODES[d]).filter(Boolean))];
  if (!dayCodes.length) return null;

  return {
    startDate: dateMatch[1],
    endDate: dateMatch[2],
    startTime: parseTime(timeMatch[1], timeMatch[2], timeMatch[3]),
    endTime: parseTime(timeMatch[4], timeMatch[5], timeMatch[6]),
    dayCodes,
  };
};

// Returns the day-of-week code for a Date (Mon-indexed). Input: Date. Output: code string.
const dayCodeForDate = (date) => {
  const jsDay = date.getDay();
  return ORDERED_DAY_CODES[jsDay === 0 ? 6 : jsDay - 1];
};

// Walks forward from the term start until it lands on a meeting day. Input: start date string, day codes. Output: Date.
const findFirstMatchingDate = (startDateStr, dayCodes) => {
  const start = new Date(`${startDateStr}T00:00:00`);
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (dayCodes.includes(dayCodeForDate(candidate))) return candidate;
  }
  return start;
};

// Formats a Date as RFC 3339 local datetime (no offset; pair with timeZone field). Input: Date. Output: string.
const formatLocalDateTime = (date) => {
  const y = date.getFullYear();
  const mo = padNumbers(date.getMonth() + 1);
  const d = padNumbers(date.getDate());
  const h = padNumbers(date.getHours());
  const m = padNumbers(date.getMinutes());
  return `${y}-${mo}-${d}T${h}:${m}:00`;
};

// Formats a Date as YYYYMMDDTHHMMSSZ for an RRULE UNTIL clause. Input: Date. Output: string.
const formatRRuleUntil = (date) => {
  const y = date.getUTCFullYear();
  const mo = padNumbers(date.getUTCMonth() + 1);
  const d = padNumbers(date.getUTCDate());
  const h = padNumbers(date.getUTCHours());
  const m = padNumbers(date.getUTCMinutes());
  const s = padNumbers(date.getUTCSeconds());
  return `${y}${mo}${d}T${h}${m}${s}Z`;
};

// Builds a human-readable location string from a meeting line. Input: line string. Output: string.
const extractLocation = (line) => {
  const raw = String(line || "");
  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  const building = parts.find((p) => /\([A-Z]{2,}\)/.test(p));
  const floorMatch = raw.match(FLOOR_RE);
  const roomMatch = raw.match(ROOM_RE);

  if (building) {
    const extras = [
      floorMatch ? `Floor ${floorMatch[1]}` : null,
      roomMatch ? `Room ${roomMatch[1]}` : null,
    ].filter(Boolean);
    return extras.length ? `${building} – ${extras.join(", ")}` : building;
  }

  return parts.find((p) => /online/i.test(p)) || "";
};

// Builds the event description from non-meeting course fields. Input: course object. Output: string.
const buildDescription = (course) => {
  return [
    course.section_number ? `Section: ${course.section_number}` : null,
    course.instructor && course.instructor !== "N/A" ? `Instructor: ${course.instructor}` : null,
    course.instructionalFormat ? `Format: ${course.instructionalFormat}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

// Builds the event summary line. Input: course object. Output: string.
const buildSummary = (course) => {
  const head = [course.code, course.title].filter(Boolean).join(" - ") || "Course";
  return course.instructionalFormat && course.instructionalFormat !== "Lecture"
    ? `${head} (${course.instructionalFormat})`
    : head;
};

// Builds one Google Calendar event from a single meeting line. Input: course, line, timeZone. Output: event or null.
const buildEvent = (course, line, timeZone) => {
  const parsed = parseMeetingLine(line);
  if (!parsed) {
    debug.warn({ id: "buildEvent.skip" }, "Could not parse meeting line:", line);
    return null;
  }

  const firstDate = findFirstMatchingDate(parsed.startDate, parsed.dayCodes);

  const start = new Date(firstDate);
  start.setHours(parsed.startTime.hours, parsed.startTime.minutes, 0, 0);

  const end = new Date(firstDate);
  end.setHours(parsed.endTime.hours, parsed.endTime.minutes, 0, 0);

  const until = new Date(`${parsed.endDate}T23:59:59`);

  const event = {
    summary: buildSummary(course),
    description: buildDescription(course),
    location: extractLocation(line),
    start: { dateTime: formatLocalDateTime(start), timeZone },
    end: { dateTime: formatLocalDateTime(end), timeZone },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${parsed.dayCodes.join(",")};UNTIL=${formatRRuleUntil(until)}`],
  };

  const colorId = colorIdForCourse(course);
  if (colorId) event.colorId = colorId;

  debug.log({ id: "buildEvent" }, event);
  return event;
};

// Builds Google Calendar events for every meeting line on a course.
//   Input: course object, { timeZone } options.
//   Output: array of Google Calendar event objects (skips meeting lines that can't be parsed).
export function buildEventsForCourse(course, { timeZone } = {}) {
  const lines = Array.isArray(course?.meetingLines) ? course.meetingLines : [];
  return lines.map((line) => buildEvent(course, line, timeZone)).filter(Boolean);
}
