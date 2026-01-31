import { extractStartDate } from "../extraction/parsers/meetingPatternsInfo.js";
import { debugFor } from "../utilities/debugTool.js";
const debug = debugFor("scheduleView");

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

const SEMESTER_MONTHS = {
  first: ["09", "08"],
  second: ["01", "12"],
};

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
    timeLabel: `${timeTokens[0]} - ${timeTokens[1]}`,
  };
}

function getSemester(startDate) {
  if (!startDate) return null;
  const month = startDate.split("-")[1];

  if (SEMESTER_MONTHS.first.includes(month)) return "first";
  if (SEMESTER_MONTHS.second.includes(month)) return "second";
  return null;
}

function clampToGrid(minutes) {
  const min = START_HOUR * 60;
  const max = END_HOUR * 60;
  return Math.max(min, Math.min(max, minutes));
}

function snapDownToSlot(minutes) {
  return Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function snapUpToSlot(minutes) {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function slotIndexOf(minutes) {
  return SLOTS.indexOf(minutes);
}

function buildDayEvents(courses, semester) {
  const eventsByDay = new Map();
  DAYS.forEach((d) => eventsByDay.set(d, []));

  const seen = new Set();
  let eventId = 0;

  (courses || []).forEach((course) => {
    const startDate = course.startDate || extractStartDate(course.meetingLines?.[0]) || "";
    const courseSemester = getSemester(startDate);
    if (courseSemester !== semester) return;

    const lines = course.meetingLines?.length ? course.meetingLines : [];

    const label = course.isLab
      ? "[Laboratory]"
      : course.isSeminar
      ? "[Seminar]"
      : course.isDiscussion
      ? "[Discussion]"
      : "";

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

        const key = [day, course.code || "", course.title || "", parsed.timeLabel, startIdx, rowSpan].join("|");
        if (seen.has(key)) return;
        seen.add(key);

        eventsByDay.get(day).push({
          id: eventId++,
          code: course.code || "",
          title: course.title || "",
          label,
          timeLabel: parsed.timeLabel,
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

function addConflicts(eventsByDay) {
  const groupedByDay = new Map();

  DAYS.forEach((day) => {
    const events = (eventsByDay.get(day) || []).slice().sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);

    const groups = [];
    let current = null;
    let currentKey = null;

    for (let r = 0; r < SLOTS.length - 1; r++) {
      const active = events.filter((ev) => ev.startIdx <= r && ev.endIdx > r);
      const key = active.length
        ? active
            .map((ev) => ev.id)
            .sort((a, b) => a - b)
            .join("|")
        : null;

      if (!key) {
        if (current) groups.push(current);
        current = null;
        currentKey = null;
        continue;
      }

      if (current && key === currentKey) {
        current.end = r + 1;
        continue;
      }

      if (current) groups.push(current);

      current = { start: r, end: r + 1, events: active, hasConflict: active.length > 1 };
      currentKey = key;
    }

    if (current) groups.push(current);
    groupedByDay.set(day, groups);
  });

  return groupedByDay;
}

function getConflictSummaries(groupedByDay) {
  const seen = new Set();
  const conflicts = [];

  groupedByDay.forEach((groups) => {
    groups.forEach((group) => {
      if (!group.hasConflict) return;

      const codes = [...new Set(group.events.map((ev) => ev.code || ev.title).filter(Boolean))];
      if (codes.length < 2) return;

      codes.sort((a, b) => a.localeCompare(b));

      const key = codes.join("|");
      if (seen.has(key)) return;

      seen.add(key);
      conflicts.push(codes);
    });
  });

  return conflicts;
}

function updateConflictFooter(ui, conflicts) {
  if (!ui?.footerConflicts) return;

  if (!conflicts.length) {
    ui.footerConflicts.textContent = "";
    return;
  }

  const conflictList = conflicts.map((codes) => `[${codes.join(", ")}]`).join(" ");
  ui.footerConflicts.textContent = `⚠️ The following classes are in conflict: ${conflictList}`;
}

function formatSlotLabel(minutes) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h24)}:${String(m).padStart(2, "0")}`;
}

function buildScheduleTable() {
  const wrap = document.createElement("div");
  wrap.className = "schedule-table-wrap";

  const table = document.createElement("table");
  table.className = "schedule-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headRow.innerHTML = `
    <th class="schedule-time"></th>
    ${DAYS.map((day) => `<th class="schedule-day-head" data-day="${day}">${day}</th>`).join("")}
  `;

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let r = 0; r < SLOTS.length; r++) {
    const row = document.createElement("tr");

    const timeTd = document.createElement("td");
    timeTd.className = "schedule-time";
    timeTd.textContent = formatSlotLabel(SLOTS[r]);
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

function renderOverlayBlocks(wrap, eventsByDay) {
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

  const borderX = (borderLeft + borderRight) / 2;
  const borderY = (borderTop + borderBottom) / 2;

  DAYS.forEach((day, dayIndex) => {
    const events = eventsByDay.get(day) || [];

    events.forEach((ev) => {
      const left = timeColWidth + dayIndex * dayColWidth;
      const top = headerHeight + ev.rowStart * rowHeight;
      const height = ev.rowSpan * rowHeight;

      const block = document.createElement("div");
      block.className = "schedule-entry-float";
      block.style.left = `${left + borderLeft}px`;
      block.style.top = `${top + borderTop}px`;
      block.style.width = `${dayColWidth - borderX}px`;
      block.style.height = `${height - borderY}px`;

      const overlapLayer = document.createElement("div");
      overlapLayer.className = "schedule-entry-overlap-layer";
      block.appendChild(overlapLayer);

      const text = document.createElement("div");
      text.className = "schedule-entry-text";
      const title = ev.code || ev.title;
      const titleLabel = ev.label ? `${title} ${ev.label}` : title;

      text.innerHTML = `
        <div class="schedule-entry-title">${titleLabel}</div>
        <div class="schedule-entry-time">${ev.timeLabel}</div>
      `;
      block.appendChild(text);

      overlay.appendChild(block);
    });
  });
}

export function renderSchedule(ui, courses, semester) {
  const host = ui?.scheduleGrid || ui?.schedulePanel || ui?.scheduleContainer || ui?.scheduleView || ui?.schedule;
  if (!host) {
    debug.warn("renderSchedule: no schedule host found on ui");
    return;
  }

  const eventsByDay = buildDayEvents(courses || [], semester);
  const groupedByDay = addConflicts(eventsByDay);
  const conflicts = getConflictSummaries(groupedByDay);

  host.innerHTML = "";
  const tableWrap = buildScheduleTable();
  host.appendChild(tableWrap);

  renderOverlayBlocks(tableWrap, eventsByDay);
  updateConflictFooter(ui, conflicts);
}
