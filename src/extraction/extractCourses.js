import { $$ } from "../utilities/dom.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";
import { buildHeaderMaps, findWorkdayGrids } from "./grid.js";
import { parseSectionLinkString } from "./parsers/sectionLinkInfo.js";
import {
  extractMeetingLines,
  formatMeetingLineForPanel,
  normalizeMeetingPatternsText,
  extractStartDate,
  isOnlineDelivery,
} from "./parsers/meetingPatternsInfo.js";
import { createRowCellReader } from "./rowCellReader.js";

const debug = debugFor("courseExtraction");
debugLog({ local: { courseExtraction: false } });

function extractCoursesFromGrid(found) {
  if (!found) return [];

  const headerMaps = buildHeaderMaps(found.root);
  const courses = [];

  debug.log({ id: "extractCoursesData.headerMaps" }, "Built header maps:", headerMaps);

  for (const row of found.rows) {
    const c = extractFromRow(row, headerMaps);
    if (c && (c.code || c.title) && Object.values(c).join("").trim()) courses.push(c);
  }

  return removeDuplicateCourses(courses);
}

function summarizeCourseNames(courses) {
  const seen = new Set();
  const names = [];

  for (const course of courses) {
    const code = String(course?.code || "").trim();
    const label = code;

    if (!label) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(label);
  }

  return names;
}

// Extracts courses from the Workday grids. Input: optional selector callback. Output: array of course objects or null on cancel.
export async function extractCoursesData({ selectSchedule } = {}) {
  debug.log({ id: "extractCoursesData.start" }, "Starting course extraction");

  const found = findWorkdayGrids();

  debug.log({ id: "extractCoursesData.tables" }, "findWorkdayGrid() result:", found);

  const candidates = found
    .map((grid, index) => {
      const courses = extractCoursesFromGrid(grid);
      if (!courses.length) return null;

      return {
        id: `schedule-${index + 1}`,
        title: `Schedule ${index + 1}`,
        courses,
        courseNames: summarizeCourseNames(courses),
      };
    })
    .filter(Boolean);

  debug.log(
    { id: "extractCoursesData.candidates" },
    "Parsable schedule candidates found:",
    candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      courseCount: candidate.courses.length,
      courseNames: candidate.courseNames,
    })),
  );

  if (!candidates.length) {
    debug.log({ id: "extractCoursesData.done" }, "Extraction complete:", []);
    return [];
  }

  if (candidates.length === 1 || typeof selectSchedule !== "function") {
    debug.log({ id: "extractCoursesData.done" }, "Extraction complete:", candidates[0].courses);
    return candidates[0].courses;
  }

  const selectedId = await selectSchedule(
    candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      courseNames: candidate.courseNames,
      courseCount: candidate.courses.length,
    })),
  );

  if (!selectedId) {
    debug.log({ id: "extractCoursesData.cancelled" }, "Schedule selection cancelled");
    return null;
  }

  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const extractedCourses = selected?.courses || null;

  debug.log({ id: "extractCoursesData.done" }, "Extraction complete:", extractedCourses);

  return extractedCourses;
}

// Deduplicates courses by code/title/section. Input: array of courses. Output: array of unique courses.
function removeDuplicateCourses(allCourses) {
  const key = (course) => [course.code, course.title, course.section_number].join("|").toLowerCase();
  const seen = new Set();
  const uniqueCourses = [];

  for (const course of allCourses) {
    const courseKey = key(course);
    if (!seen.has(courseKey)) {
      seen.add(courseKey);
      uniqueCourses.push(course);
    }
  }

  debug.log({ id: "removeDuplicateCourses" }, "Deduped courses:", uniqueCourses);

  return uniqueCourses;
}

// Extracts a course from a grid row. Input: row element and header maps. Output: course object or null.
export function extractFromRow(row, headerMaps) {
  const { getCellByHeader, readCellTextByHeader } = createRowCellReader(row, headerMaps);

  debug.log({ id: "extractFromRow.start" }, "Extracting row");

  const allLinksInRow = $$(row, '[data-automation-id="promptOption"]');

  const sectionLinkEl = allLinksInRow.find((el) => {
    const text =
      el.getAttribute("data-automation-label") ||
      el.getAttribute("title") ||
      el.getAttribute("aria-label") ||
      el.textContent ||
      "";
    return /^[A-Z][A-Z0-9_]*\s*\d{2,3}-/.test(text);
  });

  const sectionLinkText =
    (sectionLinkEl &&
      (sectionLinkEl.getAttribute("data-automation-label") ||
        sectionLinkEl.getAttribute("title") ||
        sectionLinkEl.getAttribute("aria-label") ||
        sectionLinkEl.textContent)) ||
    "";

  const sectionDetails = parseSectionLinkString(sectionLinkText);
  if (!sectionDetails) {
    debug.warn({ id: "extractFromRow.skip" }, "Skipping row: no parsable promptOption", {
      promptOptions: allLinksInRow,
      sectionLinkString: sectionLinkText,
    });
    return null;
  }

  debug.log({ id: "extractFromRow.sectionLink" }, "Section link:", {
    promptOptions: allLinksInRow,
    hasMatch: !!sectionLinkEl,
    sectionLinkString: sectionLinkText,
  });

  const instructionalFormatText = readCellTextByHeader("instructionalFormat");
  const startDateText = readCellTextByHeader("startDate");

  const code = sectionDetails.code;
  const title = sectionDetails.title;
  const section_number = sectionDetails.section_number;

  debug.log({ id: "extractFromRow.coreParse" }, "Core parse result:", {
    code,
    title,
    section_number,
  });

  const labLike = (s) => /\b(laboratory)\b/i.test(String(s || ""));
  const seminarLike = (s) => /\bseminar\b/i.test(String(s || ""));
  const discussionLike = (s) => /\bdiscussion\b/i.test(String(s || ""));

  const getInstructionalFormatAbbr = (text) => {
    if (labLike(text)) return "Lab";
    if (seminarLike(text)) return "Seminar";
    if (discussionLike(text)) return "Discussion";
    return (text || "").trim();
  };

  const isLab = labLike(instructionalFormatText);
  const isSeminar = seminarLike(instructionalFormatText);
  const isDiscussion = discussionLike(instructionalFormatText);

  let instructor = "N/A";

  if (!isLab && !isSeminar && !isDiscussion) {
    instructor = readCellTextByHeader("instructor");

    if (!instructor) {
      debug.warn({ id: "extractFromRow.skip" }, "Skipping row: missing instructor cell", {
        code,
        section_number,
      });
      return null;
    }
  }

  const meetingEl = getCellByHeader("meeting");
  if (!meetingEl) {
    debug.warn({ id: "extractFromRow.skip" }, "Skipping row: missing meeting cell", {
      code,
      section_number,
    });
    return null;
  }

  const meetingLines = extractMeetingLines(meetingEl) || [];
  if (!meetingLines.length) {
    debug.warn({ id: "extractFromRow.skip" }, "Skipping row: no meeting lines found in meeting cell", {
      code,
      section_number,
    });
    return null;
  }

  const meetingObj = formatMeetingLineForPanel(meetingLines[0]);

  const deliveryModeEl = getCellByHeader("deliveryMode");

  const isOnline = deliveryModeEl ? isOnlineDelivery(deliveryModeEl) : false;

  if (isOnline) meetingObj.location = "Online";

  let meeting = [meetingObj.days, meetingObj.time].filter(Boolean).join(" | ");
  meeting += `\n${meetingObj.location || (isOnline ? "Online" : "")}`;

  const startDate = extractStartDate(meetingLines[0]) || extractStartDate(startDateText);

  const result = {
    code,
    title,
    section_number,
    instructor,
    meeting: normalizeMeetingPatternsText(meeting),
    instructionalFormat: getInstructionalFormatAbbr(instructionalFormatText),
    startDate,
    meetingLines: meetingLines,
    isLab,
    isSeminar,
    isDiscussion,
  };

  debug.log({ id: "extractFromRow.result" }, "Extracted course:", result);

  return result;
}
