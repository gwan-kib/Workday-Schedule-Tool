import { extractStartDate } from "../extraction/parsers/meetingPatternsInfo.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";
import { detectScheduleConflicts } from "./scheduleCollisions.js";
const debug = debugFor("scheduleView");
debugLog({ local: { scheduleView: false } });

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START_HOUR = 8;
const END_HOUR = 21;
const SLOT_MINUTES = 30;

const SLOTS = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  SLOTS.push(h * 60);
  SLOTS.push(h * 60 + 30);
}
SLOTS.push(END_HOUR * 60);

const DAY_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;
const TIME_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/gi;

const TERM_WINDOWS = {
  winter1: {
    label: "Winter Session - Term 1",
    startMonth: 9,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
  },
  winter2: {
    label: "Winter Session - Term 2",
    startMonth: 1,
    startDay: 1,
    endMonth: 4,
    endDay: 30,
  },
  summer1: {
    label: "Summer Session - Term 1",
    startMonth: 5,
    startDay: 1,
    endMonth: 6,
    endDay: 30,
  },
  summer2: {
    label: "Summer Session - Term 2",
    startMonth: 7,
    startDay: 1,
    endMonth: 8,
    endDay: 31,
  },
};


const normalizeConflictToken = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

// Parses a time token into minutes since midnight. Input: token string. Output: minutes number or null.
function parseTimeToken(token) {
  const match = String(token || "")
    .trim()
    .match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i);
  if (!match) return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const period = match[3].toLowerCase();

  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Parses a meeting line into days and time range. Input: line string. Output: parsed object or null.
function parseMeetingLine(line) {
  const days = String(line || "").match(DAY_REGEX) || [];
  const timeTokens = String(line || "").match(TIME_REGEX) || [];

  if (days.length === 0 || timeTokens.length < 2) return null;

  const startMinutes = parseTimeToken(timeTokens[0]);
  const endMinutes = parseTimeToken(timeTokens[1]);
  if (startMinutes == null || endMinutes == null) return null;
  if (endMinutes <= startMinutes) return null;

  return {
    days: [...new Set(days)],
    startMinutes,
    endMinutes,
  };
}

// Maps a start date to a semester key. Input: date string (YYYY-MM-DD). Output: "first", "second", "summer1", "summer2", or null.
function parseDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getSemesterForRange(startDate, endDate) {
  const courseStart = parseDateValue(startDate);
  const courseEnd = parseDateValue(endDate || startDate);

  if (!courseStart || !courseEnd) return null;

  const startYear = courseStart.getFullYear();
  const endYear = courseEnd.getFullYear();

  for (let year = startYear - 1; year <= endYear + 1; year++) {
    for (const [termKey, term] of Object.entries(TERM_WINDOWS)) {
      const termStart = new Date(year, term.startMonth - 1, term.startDay);
      const termEnd = new Date(year, term.endMonth - 1, term.endDay);

      const overlaps = courseStart <= termEnd && courseEnd >= termStart;
      if (overlaps) return termKey;
    }
  }

  return null;
}



// Clamps minutes to grid bounds. Input: minutes number. Output: minutes number.
function clampToGrid(minutes) {
  const min = START_HOUR * 60;
  const max = END_HOUR * 60;
  return Math.max(min, Math.min(max, minutes));
}

// Snaps minutes down to the nearest slot. Input: minutes number. Output: minutes number.
function snapDownToSlot(minutes) {
  return Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

// Snaps minutes up to the nearest slot. Input: minutes number. Output: minutes number.
function snapUpToSlot(minutes) {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

// Returns the slot index for a minute value. Input: minutes number. Output: index number.
function slotIndexOf(minutes) {
  return SLOTS.indexOf(minutes);
}

// Builds events grouped by day for a semester. Input: courses array, semester key. Output: Map of day to events array.
function buildDayEvents(courses, semester) {
  const eventsByDay = new Map();
  DAYS.forEach((d) => eventsByDay.set(d, []));

  const seen = new Set();
  let eventId = 0;

  (courses || []).forEach((course, courseIndex) => {
    const colorIndex = course?.colorIndex || (courseIndex % 7) + 1;
    const startDate = course.startDate || extractStartDate(course.meetingLines?.[0]) || "";
    const endDate = course.endDate || startDate || "";
    const courseSemester = getSemesterForRange(startDate, endDate);
    if (semester && courseSemester !== semester) return;
    

    const lines = course.meetingLines?.length ? course.meetingLines : [];

    const label = course.isLab ? "[LAB]" : course.isSeminar ? "[SEM]" : course.isDiscussion ? "[DISC]" : "";
    const eventType = course.isLab ? "lab" : course.isSeminar ? "seminar" : course.isDiscussion ? "discussion" : "";

    lines.forEach((line) => {
      const parsed = parseMeetingLine(line);
      if (!parsed) return;

      let startMin = snapDownToSlot(clampToGrid(parsed.startMinutes));
      let endMin = snapUpToSlot(clampToGrid(parsed.endMinutes));

      const startIdx = slotIndexOf(startMin);
      const endIdx = slotIndexOf(endMin);
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

      const rowSpan = endIdx - startIdx;

      parsed.days.forEach((day) => {
        if (!eventsByDay.has(day)) return;

        const key = [
          day,
          course.code || "",
          course.title || "",
          parsed.startMinutes,
          parsed.endMinutes,
          startIdx,
          rowSpan,
        ].join("|");
        if (seen.has(key)) return;
        seen.add(key);

        eventsByDay.get(day).push({
          id: eventId++,
          colorIndex,
          eventType,
          code: course.code || "",
          title: course.title || "",
          label,
          startMinutes: parsed.startMinutes,
          endMinutes: parsed.endMinutes,
          rowStart: startIdx,
          rowSpan,
          startIdx,
          endIdx,
        });
      });
    });
  });

  DAYS.forEach((day) => {
    eventsByDay.get(day).sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
  });

  return eventsByDay;
}

// Formats a time label for a slot. Input: minutes number. Output: string.
function formatTimeLabel(minutes, timeFormat) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (timeFormat === "am/pm") {
    const period = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }
  return `${String(h24)}:${String(m).padStart(2, "0")}`;
}

function formatTimeRange(startMinutes, endMinutes, timeFormat) {
  return `${formatTimeLabel(startMinutes, timeFormat)} - ${formatTimeLabel(endMinutes, timeFormat)}`;
}

// Builds the base schedule table DOM. Input: none. Output: wrapper element.
function buildScheduleTable(timeFormat) {
  const wrap = document.createElement("div");
  wrap.className = "schedule-table-wrap";

  const table = document.createElement("table");
  table.className = "schedule-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headRow.innerHTML = `
    <th class="schedule-time">
      <button class="schedule-time-toggle wd-hover-tooltip" type="button" aria-label="Time format" data-tooltip="Time format">
        ${timeFormat === "am/pm" ? "AM/PM" : "24H"}
      </button>
    </th>
    ${DAYS.map((day) => `<th class="schedule-day-head" data-day="${day}">${day}</th>`).join("")}
  `;

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let r = 0; r < SLOTS.length; r++) {
    const row = document.createElement("tr");

    const timeTd = document.createElement("td");
    timeTd.className = "schedule-time";
    timeTd.textContent = formatTimeLabel(SLOTS[r], timeFormat);
    row.appendChild(timeTd);

    DAYS.forEach((day) => {
      const td = document.createElement("td");
      td.className = "schedule-cell";
      td.dataset.day = day;
      td.dataset.row = String(r);

      const inner = document.createElement("div");
      inner.className = "schedule-cell-inner";
      td.appendChild(inner);

      row.appendChild(td);
    });

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);

  const overlay = document.createElement("div");
  overlay.className = "schedule-overlay";
  wrap.appendChild(overlay);

  return wrap;
}

// Renders overlay blocks for events. Input: wrapper element, events-by-day Map. Output: none.
function renderOverlayBlocks(wrap, eventsByDay, conflictBlocks = [], timeFormat = "24h") {
  const overlay = wrap.querySelector(".schedule-overlay");
  overlay.innerHTML = "";

  const table = wrap.querySelector(".schedule-table");
  const firstBodyRow = table.querySelector("tbody tr");
  const firstDayCell = table.querySelector('tbody tr td.schedule-cell[data-day="Mon"]');
  const timeTh = table.querySelector("thead th.schedule-time");

  if (!firstBodyRow || !firstDayCell || !timeTh) return;

  const timeColWidth = timeTh.getBoundingClientRect().width;
  const dayColWidth = firstDayCell.getBoundingClientRect().width;
  const headerHeight = table.querySelector("thead").getBoundingClientRect().height;
  const rowHeight = firstBodyRow.getBoundingClientRect().height;

  const cellStyles = getComputedStyle(firstDayCell);
  const borderLeft = parseFloat(cellStyles.borderLeftWidth) || 0;
  const borderTop = parseFloat(cellStyles.borderTopWidth) || 0;
  const borderRight = parseFloat(cellStyles.borderRightWidth) || 0;
  const borderBottom = parseFloat(cellStyles.borderBottomWidth) || 0;

  const borderX = (borderLeft + borderRight) / 2.0;
  const borderY = (borderTop + borderBottom) / 2.0;

  DAYS.forEach((day, dayIndex) => {
    const events = eventsByDay.get(day) || [];

    events.forEach((ev) => {
      const left = timeColWidth + dayIndex * dayColWidth;
      const top = headerHeight + ev.rowStart * rowHeight;
      const height = ev.rowSpan * rowHeight;

      const block = document.createElement("div");
      const colorClass = ev.colorIndex ? ` schedule-entry--color-${ev.colorIndex}` : "";
      const subClass =
        ev.eventType === "lab" || ev.eventType === "seminar" || ev.eventType === "discussion"
          ? " schedule-entry--sub"
          : "";
      block.className = `schedule-entry-float${colorClass}${subClass}`;
      block.style.left = `${left + borderLeft}px`;
      block.style.top = `${top + borderTop}px`;
      block.style.width = `${dayColWidth - borderX - 0.1}px`;
      block.style.height = `${height - borderY}px`;

      const overlapLayer = document.createElement("div");
      overlapLayer.className = "schedule-entry-overlap-layer";
      block.appendChild(overlapLayer);

      const text = document.createElement("div");
      text.className = "schedule-entry-text";
      const codeMatch = String(ev.code || "").match(/^([A-Z_]+)\s*(\d+)$/);
      const formattedCode = codeMatch ? `${codeMatch[1]} ${codeMatch[2]}` : ev.code || "";
      const title = formattedCode || ev.title;
      const titleLabel = ev.label ? `${title} ${ev.label}` : title;

      const timeLabel = formatTimeRange(ev.startMinutes, ev.endMinutes, timeFormat);
      text.innerHTML = `
        <div class="schedule-entry-title">${titleLabel}</div>
        <div class="schedule-entry-time">${timeLabel}</div>
      `;
      block.appendChild(text);

      overlay.appendChild(block);
    });
  });

  (conflictBlocks || []).forEach((conflict) => {
    const dayIndex = DAYS.indexOf(conflict.day);
    if (dayIndex === -1) return;

    const left = timeColWidth + dayIndex * dayColWidth;
    const top = headerHeight + conflict.rowStart * rowHeight;
    const height = conflict.rowSpan * rowHeight;
    if (height <= 0) return;

    const block = document.createElement("div");
    block.className = "schedule-conflict-float wd-hover-tooltip";
    block.style.left = `${left + borderLeft}px`;
    block.style.top = `${top + borderTop}px`;
    block.style.width = `${dayColWidth - borderX}px`;
    block.style.height = `${height - borderY}px`;

    const symbol = document.createElement("div");
    symbol.className = "schedule-conflict-symbol";
    symbol.textContent = "\u2757";
    block.appendChild(symbol);

    if (conflict.codes?.length) {
      const tooltipText = `Classes in conflict:\n[${conflict.codes.join(", ")}]`;
      block.dataset.tooltip = tooltipText;
      block.setAttribute("aria-label", tooltipText);
      block.tabIndex = 0;
    }

    overlay.appendChild(block);
  });
}

function buildConflictPartnerLookup(conflictBlocks = []) {
  const partnersByCode = new Map();

  (conflictBlocks || []).forEach((block) => {
    const uniqueCodes = [];
    const seen = new Set();

    (block?.codes || []).forEach((rawCode) => {
      const label = String(rawCode || "").trim();
      const normalized = normalizeConflictToken(label);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      uniqueCodes.push({ normalized, label });
    });

    uniqueCodes.forEach(({ normalized: codeKey }, i) => {
      if (!partnersByCode.has(codeKey)) partnersByCode.set(codeKey, new Map());
      const partnerMap = partnersByCode.get(codeKey);

      uniqueCodes.forEach(({ normalized: otherKey, label: otherLabel }, j) => {
        if (i === j) return;
        if (!partnerMap.has(otherKey)) partnerMap.set(otherKey, otherLabel);
      });
    });
  });

  const lookup = new Map();
  partnersByCode.forEach((partnerMap, codeKey) => {
    const partners = Array.from(partnerMap.values()).sort((a, b) =>
      normalizeConflictToken(a).localeCompare(normalizeConflictToken(b)),
    );
    lookup.set(codeKey, partners);
  });

  return lookup;
}

function updateFooterConflictMessage(ui, conflictCodes) {
  const alertEl = ui?.footerAlert || ui?.root?.querySelector("#schedule-conflict-alert");
  if (!alertEl) return;

  const codes = Array.isArray(conflictCodes) ? conflictCodes.filter(Boolean) : [];
  if (!codes.length) {
    alertEl.textContent = "";
    alertEl.classList.add("is-hidden");
    return;
  }

  alertEl.textContent = `🚩 The following classes are in conflict: [${codes.join(", ")}].`;
  alertEl.classList.remove("is-hidden");
}
function getActiveSemester(courses = []) {
  const counts = {};

  (courses || []).forEach((course) => {
    const startDate = course.startDate || extractStartDate(course.meetingLines?.[0]) || "";
    const endDate = course.endDate || startDate || "";
    const semester = getSemesterForRange(startDate, endDate);

    if (!semester) return;
    counts[semester] = (counts[semester] || 0) + 1;
  });

  let bestSemester = null;
  let bestCount = 0;

  Object.entries(counts).forEach(([semester, count]) => {
    if (count > bestCount) {
      bestSemester = semester;
      bestCount = count;
    }
  });

  return bestSemester;
}


// Renders the schedule view for a semester. Input: ui object, courses array, semester key. Output: none.
export function renderSchedule(ui, courses, semester, timeFormat = "24h") {
  const host = ui?.scheduleGrid || ui?.schedulePanel || ui?.scheduleContainer || ui?.scheduleView || ui?.schedule;
  if (!host) {
    debug.warn("renderSchedule: no schedule host found on ui");
    return;
  }

  const activeSemester = semester || getActiveSemester(courses || []);

  const eventsByDay = buildDayEvents(courses || [], activeSemester);
  const allEventsByDay = buildDayEvents(courses || [], null);
  const { conflictBlocks } = detectScheduleConflicts(eventsByDay);
  const { conflictBlocks: allConflictBlocks, conflictCodes } = detectScheduleConflicts(allEventsByDay);
  ui.conflictPartnersByCode = buildConflictPartnerLookup(allConflictBlocks);

  host.innerHTML = "";
  const tableWrap = buildScheduleTable(timeFormat);
  host.appendChild(tableWrap);

  renderOverlayBlocks(tableWrap, eventsByDay, conflictBlocks, timeFormat);
  updateFooterConflictMessage(ui, conflictCodes);

  ui.activeSemester = activeSemester;

  const semesterLabel = TERM_WINDOWS[activeSemester]?.label || "Term Not Found";
  if (ui?.scheduleTermPill) {
    ui.scheduleTermPill.textContent = semesterLabel;
  }
}
