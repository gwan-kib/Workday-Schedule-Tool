import { debugFor, debugLog } from "../utilities/debugTool.js";

const debug = debugFor("courseColorSettings");
debugLog({ local: { courseColorSettings: false } });

export const COURSE_COLOR_COUNT = 7;
export const COURSE_COLOR_LABELS = ["Red", "Orange", "Purple", "Blue", "Yellow", "Green", "Teal"];
export const DEFAULT_COURSE_COLOR_ASSIGNMENTS = Array.from({ length: COURSE_COLOR_COUNT }, (_, i) => i + 1);

const STORAGE_KEY = "wdCourseColorAssignments";
const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

const isValidPaletteId = (value) =>
  Number.isInteger(value) && value >= 1 && value <= COURSE_COLOR_COUNT;

export const normalizeCourseColorAssignments = (value) => {
  if (!Array.isArray(value)) return [...DEFAULT_COURSE_COLOR_ASSIGNMENTS];
  return DEFAULT_COURSE_COLOR_ASSIGNMENTS.map((fallback, index) => {
    const candidate = Number(value[index]);
    return isValidPaletteId(candidate) ? candidate : fallback;
  });
};

// Assigns stable color indices to courses if missing. Input: courses array. Output: none.
export function assignCourseColors(courses) {
  if (!Array.isArray(courses)) {
    debug.warn({ id: "assignCourseColors.invalidInput" }, "assignCourseColors called with non-array input");
    return;
  }
  debug.log({ id: "assignCourseColors.start" }, "Assigning course colors", { courseCount: courses.length });

  const getCourseKey = (course) => {
    if (!course) return "";
    const code = String(course.code || "")
      .trim()
      .toUpperCase();
    const title = String(course.title || "")
      .trim()
      .toUpperCase();
    if (code || title) return `${code}||${title}`;
    return String(course.section_number || "")
      .trim()
      .toUpperCase();
  };

  const isLecture = (course) => !(course?.isLab || course?.isSeminar || course?.isDiscussion);
  const hasValidColor = (course) =>
    Number.isInteger(course?.colorIndex) && course.colorIndex >= 1 && course.colorIndex <= COURSE_COLOR_COUNT;

  let colorCursor = 0;
  const colorByKey = new Map();

  const nextColor = () => {
    colorCursor += 1;
    return ((colorCursor - 1) % COURSE_COLOR_COUNT) + 1;
  };

  courses.forEach((course) => {
    if (!course) return;
    const key = getCourseKey(course);
    if (hasValidColor(course)) {
      if (key && !colorByKey.has(key)) colorByKey.set(key, course.colorIndex);
      return;
    }
    if (!isLecture(course)) return;
    if (key && colorByKey.has(key)) {
      course.colorIndex = colorByKey.get(key);
      return;
    }
    const colorIndex = nextColor();
    course.colorIndex = colorIndex;
    if (key) colorByKey.set(key, colorIndex);
  });

  courses.forEach((course) => {
    if (!course) return;
    if (hasValidColor(course)) {
      const key = getCourseKey(course);
      if (key && !colorByKey.has(key)) colorByKey.set(key, course.colorIndex);
      return;
    }
    const key = getCourseKey(course);
    if (key && colorByKey.has(key)) {
      course.colorIndex = colorByKey.get(key);
      return;
    }
    const colorIndex = nextColor();
    course.colorIndex = colorIndex;
    if (key) colorByKey.set(key, colorIndex);
  });

  debug.log({ id: "assignCourseColors.complete" }, "Finished assigning course colors", {
    assignedCourses: courses.length,
  });
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
