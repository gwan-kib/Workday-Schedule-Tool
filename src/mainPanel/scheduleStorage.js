import { debugFor } from "../utilities/debugTool.js";
const debug = debugFor("scheduleStorage");

const STORAGE_KEY = "wdSavedSchedules";
const MAX_SCHEDULES = 10;

// Deep-clones courses for storage. Input: array of courses. Output: cloned array.
const cloneCourses = (courses) => {
  if (typeof structuredClone === "function") return structuredClone(courses);
  return JSON.parse(JSON.stringify(courses || []));
};

// Sanitizes schedule objects for storage. Input: array of schedules. Output: sanitized array.
const sanitizeSchedules = (schedules) => {
  if (!Array.isArray(schedules)) return [];
  return schedules
    .filter((s) => s && Array.isArray(s.courses))
    .map((s) => ({
      id: s.id,
      name: s.name || "Untitled",
      savedAt: s.savedAt || new Date().toISOString(),
      courses: s.courses,
    }));
};

const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

// Loads saved schedules from storage. Input: none. Output: array of schedules.
export async function loadSavedSchedules() {
  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(sanitizeSchedules(result?.[STORAGE_KEY] || []));
      });
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeSchedules(JSON.parse(raw));
  } catch (error) {
    debug.error("Failed to load schedules", error);
    return [];
  }
}

// Persists schedules to storage. Input: array of schedules. Output: none.
export async function persistSavedSchedules(schedules) {
  const sanitized = sanitizeSchedules(schedules);

  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: sanitized }, () => resolve());
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (error) {
    debug.error("Failed to save schedules", error);
  }
}

// Creates a snapshot object for a schedule. Input: name string, courses array. Output: schedule object.
export function createScheduleSnapshot(name, courses) {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    name: name || "Untitled",
    savedAt: new Date().toISOString(),
    courses: cloneCourses(courses || []),
  };
}

// Formats display text for a schedule meta line. Input: schedule object. Output: string.
export function formatScheduleMeta(schedule) {
  const count = schedule.courses?.length || 0;
  const savedDate = new Date(schedule.savedAt);

  const dateLabel = Number.isNaN(savedDate.getTime())
    ? schedule.savedAt
    : savedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return `${count} courses · Saved ${dateLabel}`;
}

// Renders saved schedule cards into the UI. Input: ui object, schedules array. Output: none.
export function renderSavedSchedules(ui, schedules) {
  if (!ui.savedMenu) return;

  ui.savedMenu.innerHTML = "";

  if (!schedules.length) {
    const empty = document.createElement("div");
    empty.className = "schedule-saved-empty";
    empty.textContent = "No saved schedules yet.";
    ui.savedMenu.appendChild(empty);
    return;
  }

  schedules.forEach((schedule) => {
    const card = document.createElement("div");
    card.className = "schedule-saved-card";
    card.dataset.id = schedule.id;

    const header = document.createElement("div");
    header.className = "schedule-saved-card-header";

    const info = document.createElement("div");

    const title = document.createElement("div");
    title.className = "schedule-saved-title";
    title.textContent = schedule.name;

    const meta = document.createElement("div");
    meta.className = "schedule-saved-meta";
    meta.textContent = formatScheduleMeta(schedule);

    info.appendChild(title);
    info.appendChild(meta);
    header.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "schedule-saved-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "schedule-saved-action";
    loadButton.dataset.action = "load";
    loadButton.textContent = "Load";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "schedule-saved-action delete";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = "Delete";

    actions.appendChild(loadButton);
    actions.appendChild(deleteButton);

    card.appendChild(header);
    card.appendChild(actions);

    ui.savedMenu.appendChild(card);
  });

  debug.log({ id: "renderSavedSchedules.done" }, "Rendered saved schedules", schedules);
}

// Returns whether another schedule can be saved. Input: schedules array. Output: boolean.
export function canSaveMoreSchedules(schedules) {
  return (schedules?.length || 0) < MAX_SCHEDULES;
}

// Returns the maximum schedule count. Input: none. Output: number.
export function getMaxScheduleCount() {
  return MAX_SCHEDULES;
}
