import { debugFor, debugLog } from "../utilities/debugTool.js";
const debug = debugFor("scheduleStorage");
debugLog({ local: { scheduleStorage: false } });

const STORAGE_KEY = "wdSavedSchedules";
const PREFERRED_SCHEDULE_KEY = "wdPreferredScheduleId";
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
      colorAssignments: Array.isArray(s.colorAssignments) ? s.colorAssignments : null,
      isFavorite: Boolean(s.isFavorite),
    }));
};

// Normalizes saved schedules so only one preferred schedule exists. Input: schedules array and optional preferred id. Output: normalized array.
const normalizeSchedules = (schedules, preferredId = null) => {
  const sanitized = sanitizeSchedules(schedules);
  let favoriteAssigned = false;

  return sanitized.map((schedule) => {
    const shouldFavorite =
      !favoriteAssigned && Boolean(schedule.id) && (schedule.isFavorite || schedule.id === preferredId);

    if (shouldFavorite) favoriteAssigned = true;

    return {
      ...schedule,
      isFavorite: shouldFavorite,
    };
  });
};

const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

// Loads saved schedules from storage. Input: none. Output: array of schedules.
export async function loadSavedSchedules() {
  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY, PREFERRED_SCHEDULE_KEY], (result) => {
        resolve(normalizeSchedules(result?.[STORAGE_KEY] || [], result?.[PREFERRED_SCHEDULE_KEY] || null));
      });
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeSchedules(JSON.parse(raw), localStorage.getItem(PREFERRED_SCHEDULE_KEY) || null);
  } catch (error) {
    debug.error("Failed to load schedules", error);
    return [];
  }
}

// Persists schedules to storage. Input: array of schedules. Output: none.
export async function persistSavedSchedules(schedules) {
  const sanitized = normalizeSchedules(schedules);
  const preferredScheduleId = sanitized.find((schedule) => schedule.isFavorite)?.id || null;

  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [STORAGE_KEY]: sanitized,
          [PREFERRED_SCHEDULE_KEY]: preferredScheduleId,
        },
        () => resolve(),
      );
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    if (preferredScheduleId) localStorage.setItem(PREFERRED_SCHEDULE_KEY, preferredScheduleId);
    else localStorage.removeItem(PREFERRED_SCHEDULE_KEY);
  } catch (error) {
    debug.error("Failed to save schedules", error);
  }
}

// Creates a snapshot object for a schedule. Input: name string, courses array. Output: schedule object.
export function createScheduleSnapshot(name, courses, colorAssignments) {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    name: name || "Untitled",
    savedAt: new Date().toISOString(),
    courses: cloneCourses(courses || []),
    colorAssignments: Array.isArray(colorAssignments) ? [...colorAssignments] : null,
    isFavorite: false,
  };
}

// Returns the explicitly starred schedule if one exists. Input: schedules array. Output: schedule or null.
export function getFavoriteSchedule(schedules) {
  return normalizeSchedules(schedules).find((schedule) => schedule.isFavorite) || null;
}

// Returns the schedule to use by default. Input: schedules array. Output: schedule or null.
export function getPreferredSchedule(schedules) {
  const normalized = normalizeSchedules(schedules);
  return normalized.find((schedule) => schedule.isFavorite) || normalized[0] || null;
}

// Toggles the preferred schedule flag while keeping at most one favorite. Input: schedules array and schedule id. Output: normalized schedules array.
export function togglePreferredSchedule(schedules, scheduleId) {
  const favoriteId = getFavoriteSchedule(schedules)?.id || null;
  const nextPreferredId = favoriteId === scheduleId ? null : scheduleId;
  return sanitizeSchedules(schedules).map((schedule) => ({
    ...schedule,
    isFavorite: Boolean(nextPreferredId) && schedule.id === nextPreferredId,
  }));
}

// Formats display text for a schedule meta line. Input: schedule object. Output: string.
export function formatScheduleMeta(schedule) {
  const count = schedule.courses?.length || 0;
  const savedDate = new Date(schedule.savedAt);

  const dateLabel = Number.isNaN(savedDate.getTime())
    ? schedule.savedAt
    : savedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return `${count} courses | Saved ${dateLabel}`;
}

// Renders saved schedule cards into the UI. Input: ui object, schedules array, and optional active schedule id. Output: none.
export function renderSavedSchedules(ui, schedules, activeScheduleId = null) {
  if (!ui.savedMenu) return;

  ui.savedMenu.innerHTML = "";

  if (!schedules.length) {
    const empty = document.createElement("div");
    empty.className = "schedule-saved-empty";
    empty.textContent = "No saved schedules yet.";
    ui.savedMenu.appendChild(empty);
    return;
  }

  normalizeSchedules(schedules).forEach((schedule) => {
      const card = document.createElement("div");
      card.className = `schedule-saved-card${schedule.id === activeScheduleId ? " is-active" : ""}`;
      card.dataset.id = schedule.id;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Load ${schedule.name}`);

      const header = document.createElement("div");
      header.className = "schedule-saved-card-header";

      const info = document.createElement("div");

      const title = document.createElement("div");
      title.className = "schedule-saved-title";
      title.textContent = schedule.name;

      const titleRow = document.createElement("div");
      titleRow.className = "schedule-saved-title-row";
      titleRow.appendChild(title);

      if (schedule.isFavorite) {
        const badge = document.createElement("span");
        badge.className = "schedule-saved-badge";
        badge.textContent = "Favorite";
        titleRow.appendChild(badge);
      }

      const meta = document.createElement("div");
      meta.className = "schedule-saved-meta";
      meta.textContent = formatScheduleMeta(schedule);

      info.appendChild(titleRow);
      info.appendChild(meta);
      header.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "schedule-saved-actions";

      const favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = `schedule-saved-action star${schedule.isFavorite ? " is-favorite" : ""}`;
      favoriteButton.dataset.action = "favorite";
      favoriteButton.setAttribute("aria-label", schedule.isFavorite ? "Unstar schedule" : "Star schedule");
      favoriteButton.setAttribute("title", schedule.isFavorite ? "Unstar schedule" : "Star schedule");
      favoriteButton.setAttribute("aria-pressed", String(schedule.isFavorite));

      const favoriteIcon = document.createElement("span");
      favoriteIcon.className = "material-symbols-rounded";
      favoriteIcon.setAttribute("aria-hidden", "true");
      favoriteIcon.textContent = "star";
      favoriteButton.appendChild(favoriteIcon);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "schedule-saved-action delete";
      deleteButton.dataset.action = "delete";
      deleteButton.setAttribute("aria-label", "Delete schedule");
      deleteButton.setAttribute("title", "Delete schedule");

      const deleteIcon = document.createElement("span");
      deleteIcon.className = "material-symbols-rounded";
      deleteIcon.setAttribute("aria-hidden", "true");
      deleteIcon.textContent = "delete";
      deleteButton.appendChild(deleteIcon);

      actions.appendChild(favoriteButton);
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
