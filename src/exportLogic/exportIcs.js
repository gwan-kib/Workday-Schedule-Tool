import { STATE } from "../core/state.js";
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("export-ics");

// calendar timezone for DTSTART/DTEND (local class times) and RRULE UNTIL (UTC "Z" per spec)
const TZID = "America/Vancouver";

// converts a Date object into this format: YYYYMMDDTHHMMSSZ
const formatDateTimeUTC = (date) => {
  const y = date.getUTCFullYear();
  const m = padNumbers(date.getUTCMonth() + 1);
  const d = padNumbers(date.getUTCDate());
  const hh = padNumbers(date.getUTCHours());
  const mm = padNumbers(date.getUTCMinutes());
  const ss = padNumbers(date.getUTCSeconds());
  debug.log("Formatting UTC Date:", { y, m, d, hh, mm, ss });
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
};

// maps ui's day labels to iCalendar day codes
const DAY_CODES = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};

// used to extract dates, times, and days from a meeting line string
const date_range_REGEX = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const time_range_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;
const days_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;

// forces numbers to two digits
const padNumbers = (value) => String(value).padStart(2, "0");

// ICS date format: YYYYMMDD
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = padNumbers(date.getMonth() + 1);
  const day = padNumbers(date.getDate());
  debug.log("Formatted Date:", { year, month, day });
  return `${year}${month}${day}`;
};

// ICS datetime format (local): YYYYMMDDTHHMMSS
const formatDateTime = (date) => {
  const datePart = formatDate(date);
  const hours = padNumbers(date.getHours());
  const minutes = padNumbers(date.getMinutes());

  debug.log("Formatted DateTime:", { datePart, hours, minutes });
  return `${datePart}T${hours}${minutes}00`;
};

// “p” adds 12, unless it’s 12pm already, “a” turns 12am into 0
// eg. parseTime("11","30","p") -> { hours: 23, minutes: 30 }
const parseTime = (hoursToken, minutesToken, periodToken) => {
  let hours = Number.parseInt(hoursToken, 10);
  const minutes = Number.parseInt(minutesToken, 10);
  const period = periodToken.toLowerCase();

  debug.log("Parsing Time:", { hours, minutes, period });

  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;

  return { hours, minutes };
};

// parses meeting line into structured data
const parseMeetingLine = (line) => {
  const dateMatch = String(line || "").match(date_range_REGEX);
  const timeMatch = String(line || "").match(time_range_REGEX);
  const days = String(line || "").match(days_REGEX) || [];

  if (!dateMatch || !timeMatch || !days.length) return null;

  debug.log("Parsed Meeting Line:", { dateMatch, timeMatch, days });

  const startDate = dateMatch[1];
  const endDate = dateMatch[2];

  const startTime = parseTime(timeMatch[1], timeMatch[2], timeMatch[3]);
  const endTime = parseTime(timeMatch[4], timeMatch[5], timeMatch[6]);

  const uniqueDays = [...new Set(days.map((day) => DAY_CODES[day]).filter(Boolean))];

  return {
    startDate,
    endDate,
    days: uniqueDays,
    startTime,
    endTime,
  };
};

// finds location from meeting line
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

// finds the first calendar date on/after startDate that matches one of the meeting days
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

// builds an event object from course and meeting line data
const buildClassEvent = (course, line) => {
  const parsed = parseMeetingLine(line);
  if (!parsed) return null;

  const firstDate = findFirstValidDate(parsed.startDate, parsed.days);
  const startDate = new Date(firstDate);
  startDate.setHours(parsed.startTime.hours, parsed.startTime.minutes, 0, 0);

  const endDate = new Date(firstDate);
  endDate.setHours(parsed.endTime.hours, parsed.endTime.minutes, 0, 0);

  const summaryParts = [course.code, course.title].filter(Boolean);
  const descriptionLines = [
    course.title ? `Title: ${course.title}` : null,
    course.code ? `Code: ${course.code}` : null,
    course.section_number ? `Section: ${course.section_number}` : null,
    course.instructor ? `Instructor: ${course.instructor}` : null,
    course.instructionalFormat ? `Format: ${course.instructionalFormat}` : null,
    course.meeting ? `Meeting: ${course.meeting}` : null,
  ].filter(Boolean);

  const untilLocal = new Date(`${parsed.endDate}T23:59:59`);
  const untilDate = formatDateTimeUTC(untilLocal);

  debug.log("Built Class Event:", { course, parsed, startDate, endDate, summaryParts, descriptionLines, untilDate });

  return {
    uid: `${course.code || "course"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    summary: summaryParts.join(" - ") || "Scheduled Course",
    description: descriptionLines.join("\\n"),
    location: extractLocation(line),
    dtstart: formatDateTime(startDate),
    dtend: formatDateTime(endDate),
    rrule: `FREQ=WEEKLY;BYDAY=${parsed.days.join(",")};UNTIL=${untilDate}`,
  };
};

// loops through every course in the schedule and builds the full ICS file
const buildICSFile = (courses) => {
  const events = [];

  courses.forEach((course) => {
    const lines = course.meetingLines?.length ? course.meetingLines : [];
    lines.forEach((line) => {
      const event = buildClassEvent(course, line);
      if (event) events.push(event);
    });
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Workday Extension//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${TZID}`,
  ];

  events.forEach((event) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`SUMMARY:${event.summary}`);
    if (event.description) lines.push(`DESCRIPTION:${event.description}`);
    if (event.location) lines.push(`LOCATION:${event.location}`);
    lines.push(`DTSTART;TZID=${TZID}:${event.dtstart}`);
    lines.push(`DTEND;TZID=${TZID}:${event.dtend}`);
    lines.push(`RRULE:${event.rrule}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  debug.log("ICS File Generated:", lines);
  return lines.join("\r\n");
};

// generates the ICS string from the current filtered courses, wraps it in a Blob (file-like object)
// creates a temporary URL for it and a hidden <a> then “clicks” it to download
// cleans up the URL + anchor afterward
export function exportICS(scheduleName) {
  const ics = buildICSFile(STATE.filtered || []);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  // Use the schedule name if provided, otherwise use the default
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
