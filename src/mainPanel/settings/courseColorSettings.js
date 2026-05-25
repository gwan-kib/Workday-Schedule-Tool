import { debugFor, debugLog } from "../../utilities/debugTool.js";

const debug = debugFor("courseColorSettings");
debugLog({ local: { courseColorSettings: false } });

export const COURSE_COLOR_COUNT = 8;
export const COURSE_COLOR_LABELS = ["Red", "Orange", "Purple", "Blue", "Yellow", "Green", "Teal", "Pink"];
export const DEFAULT_COURSE_COLOR_ASSIGNMENTS = Array.from({ length: COURSE_COLOR_COUNT }, (_, i) => i + 1);

const STORAGE_KEY = "wdCourseColorAssignments";
const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

const isValidPaletteId = (value) =>
  Number.isInteger(value) && value >= 1 && value <= COURSE_COLOR_COUNT;
const experientialLike = (course) => /\bexperiential\b/i.test(String(course?.instructionalFormat || ""));
const COURSE_CODE_RE = /\b([A-Z][A-Z0-9_]{0,12})\s*(\d{3}[A-Z]?)\b/i;
const normalizeSpaces = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();
const isValidCourseIndex = (value) => Number.isInteger(value) && value >= 1;
export const isValidCourseColorIndex = isValidPaletteId;

export const normalizeCourseColorAssignments = (value) => {
  if (!Array.isArray(value)) return [...DEFAULT_COURSE_COLOR_ASSIGNMENTS];
  return DEFAULT_COURSE_COLOR_ASSIGNMENTS.map((fallback, index) => {
    const candidate = Number(value[index]);
    return isValidPaletteId(candidate) ? candidate : fallback;
  });
};

export const normalizeCourseGroupKey = (course) => {
  if (!course) return "";

  const candidates = [course.code, course.courseCode, course.title];
  for (const candidate of candidates) {
    const text = normalizeSpaces(candidate).toUpperCase();
    if (!text) continue;

    const match = text.match(COURSE_CODE_RE);
    if (match) return `${match[1]} ${match[2]}`;
  }

  return "";
};

const fallbackCourseGroupKey = (course, index) => {
  const workdayId = normalizeSpaces(course?.workdayCourseId);
  if (workdayId) return `id:${workdayId}`;

  const identity = [course?.code, course?.section_number]
    .map((part) => normalizeSpaces(part).toUpperCase())
    .filter(Boolean)
    .join("|");
  return identity || `course:${index}`;
};

export const getCourseGroupKey = (course, index = 0) =>
  normalizeCourseGroupKey(course) || fallbackCourseGroupKey(course, index);

export const isLectureCourse = (course) =>
  !(course?.isLab || course?.isSeminar || course?.isDiscussion || course?.isExperiential || experientialLike(course));

const colorIndexForCourseIndex = (courseIndex) => ((courseIndex - 1) % COURSE_COLOR_COUNT) + 1;

export function collectCourseGroups(courses) {
  const groupsByKey = new Map();

  courses.forEach((course, index) => {
    if (!course) return;

    const stableKey = normalizeCourseGroupKey(course);
    const registryKey = getCourseGroupKey(course, index);

    if (stableKey) course.courseGroupKey = stableKey;
    else delete course.courseGroupKey;

    if (!groupsByKey.has(registryKey)) {
      groupsByKey.set(registryKey, {
        key: registryKey,
        stableKey,
        courses: [],
        firstIndex: index,
        firstLectureIndex: Number.POSITIVE_INFINITY,
        requestedCourseIndex: null,
        manualColorIndex: null,
        representativeCourse: course,
      });
    }

    const group = groupsByKey.get(registryKey);
    group.courses.push(course);
    if (isLectureCourse(course)) {
      group.firstLectureIndex = Math.min(group.firstLectureIndex, index);
      if (!isLectureCourse(group.representativeCourse) || index <= group.firstLectureIndex) {
        group.representativeCourse = course;
      }
    }

    if (group.requestedCourseIndex == null && isValidCourseIndex(course.courseIndex)) {
      group.requestedCourseIndex = course.courseIndex;
    }

    if (group.manualColorIndex == null && isValidPaletteId(course.manualColorIndex)) {
      group.manualColorIndex = course.manualColorIndex;
    }
  });

  return [...groupsByKey.values()].sort((a, b) => {
    const aOrder = Number.isFinite(a.firstLectureIndex) ? a.firstLectureIndex : a.firstIndex;
    const bOrder = Number.isFinite(b.firstLectureIndex) ? b.firstLectureIndex : b.firstIndex;
    return aOrder - bOrder || a.firstIndex - b.firstIndex;
  });
}

// Assigns stable course group and color indices. Input: courses array. Output: none.
export function assignCourseIndexesAndColors(courses) {
  if (!Array.isArray(courses)) {
    debug.warn({ id: "assignCourseColors.invalidInput" }, "assignCourseColors called with non-array input");
    return;
  }
  debug.log({ id: "assignCourseColors.start" }, "Assigning course groups and colors", { courseCount: courses.length });

  const groups = collectCourseGroups(courses);
  const usedCourseIndexes = new Set();
  let nextCourseIndex = 0;

  groups.forEach((group) => {
    const requested = group.requestedCourseIndex;
    if (!isValidCourseIndex(requested) || usedCourseIndexes.has(requested)) return;

    group.courseIndex = requested;
    usedCourseIndexes.add(requested);
    nextCourseIndex = Math.max(nextCourseIndex, requested);
  });

  groups.forEach((group) => {
    if (isValidCourseIndex(group.courseIndex)) return;

    nextCourseIndex += 1;
    while (usedCourseIndexes.has(nextCourseIndex)) nextCourseIndex += 1;
    group.courseIndex = nextCourseIndex;
    usedCourseIndexes.add(nextCourseIndex);
  });

  groups.forEach((group) => {
    const hasManualColor = isValidPaletteId(group.manualColorIndex);
    const colorIndex = hasManualColor ? group.manualColorIndex : colorIndexForCourseIndex(group.courseIndex);
    group.courses.forEach((course) => {
      course.courseIndex = group.courseIndex;
      course.colorIndex = colorIndex;
      if (group.stableKey) course.courseGroupKey = group.stableKey;
      if (hasManualColor) course.manualColorIndex = colorIndex;
      else delete course.manualColorIndex;
    });
  });

  debug.log({ id: "assignCourseColors.complete" }, "Finished assigning course colors", {
    assignedCourses: courses.length,
    assignedGroups: groups.length,
  });
}

// Backwards-compatible name used by the panel controller and existing import paths.
export function assignCourseColors(courses) {
  assignCourseIndexesAndColors(courses);
}

export function getCourseGroupRepresentatives(courses) {
  const representatives = new WeakSet();
  collectCourseGroups(courses).forEach((group) => {
    if (group.representativeCourse) representatives.add(group.representativeCourse);
  });
  return representatives;
}

export function assignManualCourseGroupColor(courses, targetCourse, colorIndex) {
  if (!Array.isArray(courses) || !targetCourse || !isValidPaletteId(colorIndex)) return false;

  const targetGroup = collectCourseGroups(courses).find((group) => group.courses.includes(targetCourse));
  if (!targetGroup) return false;

  targetGroup.courses.forEach((course) => {
    course.manualColorIndex = colorIndex;
    course.colorIndex = colorIndex;
  });

  return true;
}

// Loads course color assignments from storage. Input: none. Output: array.
export async function loadCourseColorAssignments() {
  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(normalizeCourseColorAssignments(result?.[STORAGE_KEY]));
      });
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_COURSE_COLOR_ASSIGNMENTS];
    return normalizeCourseColorAssignments(JSON.parse(raw));
  } catch (error) {
    debug.error("Failed to load course color assignments", error);
    return [...DEFAULT_COURSE_COLOR_ASSIGNMENTS];
  }
}

// Persists course color assignments to storage. Input: array. Output: none.
export async function persistCourseColorAssignments(assignments) {
  const normalized = normalizeCourseColorAssignments(assignments);

  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => resolve());
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    debug.error("Failed to save course color assignments", error);
  }
}

// Captures the base palette values from CSS custom properties. Input: Element. Output: palette array.
export function captureCourseColorPalettes(target) {
  if (!target) return [];
  const styles = getComputedStyle(target);
  const read = (name) => styles.getPropertyValue(name).trim();

  return DEFAULT_COURSE_COLOR_ASSIGNMENTS.map((id, index) => ({
    id,
    label: COURSE_COLOR_LABELS[index],
    bg: read(`--course-color-${id}-bg`),
    border: read(`--course-color-${id}-border`),
    chip: read(`--course-color-${id}-chip`),
    subBg: read(`--course-color-${id}-sub-bg`),
    subChip: read(`--course-color-${id}-sub-chip`),
  }));
}

// Applies palette assignments by overwriting course color CSS variables. Input: Element, palette array, assignments array.
export function applyCourseColorAssignments(target, palettes, assignments) {
  if (!target || !Array.isArray(palettes) || palettes.length < COURSE_COLOR_COUNT) return;
  const normalized = normalizeCourseColorAssignments(assignments);
  const style = target.style;

  normalized.forEach((paletteId, index) => {
    const courseIndex = index + 1;
    const palette = palettes[paletteId - 1];
    if (!palette) return;

    style.setProperty(`--course-color-${courseIndex}-bg`, palette.bg);
    style.setProperty(`--course-color-${courseIndex}-border`, palette.border);
    style.setProperty(`--course-color-${courseIndex}-chip`, palette.chip);
    style.setProperty(`--course-color-${courseIndex}-sub-bg`, palette.subBg);
    style.setProperty(`--course-color-${courseIndex}-sub-chip`, palette.subChip);
  });
}
