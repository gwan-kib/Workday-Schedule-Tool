import { debugFor, debugLog } from "../utilities/debugTool.js";
import { fetchSectionGradesWithFallback } from "../averageGrades/gradesApiCall.js";
import { fetchProfRating, inferCampusFromCourseCode, normalizeProfessorName } from "../rateMyProfessor/rmpApi.js";

const debug = debugFor("renderCourseObjects");
debugLog({ local: { renderCourseObjects: false } });

const renderKeyByCourse = new WeakMap();
const averageStateByCourse = new WeakMap();
const rmpStateByCourse = new WeakMap();
let renderKeyCounter = 0;

// Returns a stable render key per course object instance. Input: course object. Output: key string.
function getCourseRenderKey(course) {
  if (!course || typeof course !== "object") {
    renderKeyCounter += 1;
    return `course-render-${renderKeyCounter}`;
  }

  const existing = renderKeyByCourse.get(course);
  if (existing) return existing;

  renderKeyCounter += 1;
  const key = `course-render-${renderKeyCounter}`;
  renderKeyByCourse.set(course, key);
  return key;
}

// Returns persistent average-button UI state per course object. Input: course object. Output: state object.
function getCourseAverageState(course) {
  if (!course || typeof course !== "object") {
    return { status: "idle", label: "5 Year Average" };
  }

  const existing = averageStateByCourse.get(course);
  if (existing) return existing;

  const state = { status: "idle", label: "5 Year Average" };
  averageStateByCourse.set(course, state);
  return state;
}

// Returns persistent RMP UI state per course object. Input: course object. Output: state object.
function getCourseRmpState(course) {
  if (!course || typeof course !== "object") {
    return { status: "idle", data: null, button: null, pendingRequest: null };
  }

  const existing = rmpStateByCourse.get(course);
  if (existing) return existing;

  const state = { status: "idle", data: null, button: null, pendingRequest: null };
  rmpStateByCourse.set(course, state);
  return state;
}

// Escapes HTML entities in a string. Input: string. Output: escaped string.
const escHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeConflictToken = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

// Normalizes whitespace in multi-line strings. Input: string. Output: cleaned string.
function cleanLines(text) {
  return String(text || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Splits meeting text into main and sub lines. Input: meeting string. Output: { main, sub }.
function splitMeeting(meeting) {
  const parts = cleanLines(meeting).split("\n");
  const main = (parts[0] || "").trim();
  const sub = parts
    .slice(1)
    .map((s) => s.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "").trim())
    .filter(Boolean)
    .join("\n");

  return { main, sub };
}

// Splits a course code into subject/number. Input: code string. Output: object.
function splitCourseCode(code) {
  const match = String(code || "").match(/^([A-Z_]+)\s*(\d+[A-Z]?)$/);
  if (match) {
    return { subject: match[1], number: match[2], raw: `${match[1]} ${match[2]}` };
  }
  return { subject: "", number: "", raw: code || "" };
}

// Formats an instructor name for display. Input: name string. Output: string.
function formatInstructorName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";

  if (raw.includes(",")) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  }

  return raw;
}

// Formats multiline content for HTML. Input: string. Output: HTML string.
function formatMultiline(text) {
  return escHTML(text || "").replace(/\n/g, "<br>");
}

// Parses course info needed for average lookup. Input: course object. Output: { subject, course, section, campus } or null.
function buildAverageCourseInfo(courseData) {
  const match = String(courseData?.code || "")
    .trim()
    .toUpperCase()
    .match(/^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/);
  if (!match) return null;

  const section = String(courseData?.section_number || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const rawSubject = match[1];
  const campus = rawSubject.endsWith("_O") ? "UBCO" : "UBCV";

  return {
    subject: rawSubject.replace(/_[VO]$/i, ""),
    course: match[2],
    section,
    campus,
  };
}

// Extracts an average value from API data. Input: API payload. Output: number|string|null.
function extractAverage(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const avg = extractAverage(item);
      if (avg != null) return avg;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const direct =
    data.average ?? data.avg ?? data.average_grade ?? data.averagePercent ?? data.avgPercent ?? data.mean ?? null;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested = data?.grades?.average ?? data?.grades?.avg ?? data?.summary?.average ?? data?.summary?.avg ?? null;
  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  return null;
}

// Returns true when API payload has an average. Input: API payload. Output: boolean.
const hasValidAverage = (data) => extractAverage(data) != null;

// Formats average label for button text. Input: average value. Output: string.
function formatAverageText(average) {
  if (average == null) return "Average: N/A";
  if (typeof average === "number") return `Average: ${average.toFixed(1)}%`;
  return `Average: ${average}%`;
}

// Applies current average state to a button. Input: button element and state. Output: none.
function applyAverageButtonState(button, state) {
  if (!button) return;

  const status = state?.status || "idle";
  const label = state?.label || "5 Year Average";

  button.dataset.status = status;
  button.textContent = status === "loading" ? "Loading..." : label;
  button.disabled = status === "loading" || status === "resolved";
}

// Formats RMP label text. Input: rating data or null. Output: button label.
function formatRmpText(data) {
  if (!data) return "RMP N/A";
  const rating = typeof data.rating === "number" ? data.rating.toFixed(1) : String(data.rating || "").trim();
  return rating ? `RateMyProf:\n${rating} / 5` : "RateMyProf: N/A";
}

// Extracts instructor/campus info for an RMP lookup. Input: course object. Output: lookup object or null.
function buildRmpLookupInfo(courseData) {
  const normalized = normalizeProfessorName(courseData?.instructor);
  if (!normalized) return null;

  return {
    profName: normalized.fullName,
    campus: inferCampusFromCourseCode(courseData?.code),
  };
}

// Applies current RMP state to a button. Input: button element and state. Output: none.
function applyRmpButtonState(button, state) {
  if (!button) return;

  const status = state?.status || "idle";
  const data = state?.data || null;
  const hasProfileLink = status === "loaded" && Boolean(data?.link);

  button.disabled = status === "loading";
  button.dataset.status = status;
  button.classList.toggle("wd-hover-tooltip", hasProfileLink);

  if (hasProfileLink) {
    button.dataset.tooltip = "Visit RateMyProf Site ↗";
    button.title = "Open RateMyProfessors profile";
  } else {
    delete button.dataset.tooltip;
    button.removeAttribute("title");
  }

  if (status === "loading") {
    button.textContent = "Loading...";
    return;
  }

  if (hasProfileLink) {
    button.textContent = formatRmpText(data);
    return;
  }

  if (status === "empty") {
    button.textContent = "RateMyProf: N/A";
    return;
  }

  if (status === "error") {
    button.textContent = "RateMyProf: Error";
    return;
  }

  button.textContent = "RateMyProf";
}

// Loads RMP data into a course-card button and keeps the latest rendered button synced. Input: button/state object. Output: none.
async function loadRmpForButton(button, state, { force = false } = {}) {
  if (!button || !state) return;

  state.button = button;

  if (state.status === "loading") {
    applyRmpButtonState(button, state);
    try {
      await state.pendingRequest;
    } catch (error) {
      // The request path already updates UI state and logging.
    }
    return;
  }

  if (!force && (state.status === "loaded" || state.status === "empty")) {
    applyRmpButtonState(button, state);
    return;
  }

  const profName = button.dataset.profName || "";
  const campus = button.dataset.campus || "UBCV";

  if (!profName) {
    state.data = null;
    state.status = "empty";
    applyRmpButtonState(button, state);
    return;
  }

  state.status = "loading";
  applyRmpButtonState(button, state);

  const request = (async () => {
    try {
      const data = await fetchProfRating({ profName, campus });
      state.data = data;
      state.status = data?.link ? "loaded" : "empty";
    } catch (error) {
      state.data = null;
      state.status = "error";
      debug.warn({ id: "renderCourseObjects.rmpLookupFailed" }, "Failed to load RMP rating", {
        instructor: profName,
        campus,
        error: String(error),
      });
    } finally {
      state.pendingRequest = null;
      applyRmpButtonState(state.button, state);
    }
  })();

  state.pendingRequest = request;
  await request;
}

// Returns current yearsession string. Input: none. Output: YYYYW string.
function getCurrentYearsession() {
  return `${new Date().getFullYear()}W`;
}

// Loads average into a course-card button. Input: button element. Output: none.
async function loadAverageForButton(button, state) {
  if (!button || !state || state.status === "loading" || state.status === "resolved") return;

  const subject = button.dataset.subject || "";
  const course = button.dataset.course || "";
  const section = button.dataset.section || "";
  const campus = button.dataset.campus || "UBCV";
  const yearsession = getCurrentYearsession();

  state.status = "loading";
  applyAverageButtonState(button, state);

  if (!subject || !course || !yearsession) {
    state.label = "Average: N/A";
    state.status = "resolved";
    applyAverageButtonState(button, state);
    return;
  }

  try {
    const data = await fetchSectionGradesWithFallback(
      {
        campus,
        yearsession,
        subject,
        course,
        section,
      },
      { isValid: hasValidAverage },
    );

    const average = extractAverage(data);
    state.label = formatAverageText(average);
  } catch (error) {
    state.label = "Average: N/A";
  } finally {
    state.status = "resolved";
    applyAverageButtonState(button, state);
  }
}

// Renders course rows into the table body. Input: ui object, courses array. Output: none.
export function renderCourseObjects(ui, courses) {
  ui.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();
  const conflictPartnersByCode = ui?.conflictPartnersByCode instanceof Map ? ui.conflictPartnersByCode : new Map();

  (courses || []).forEach((course, index) => {
    const formatLabel = String(course.instructionalFormat || "").trim();
    const sectionLabel = String(course.section_number || "").trim();
    const isLectureCourse = !(course?.isLab || course?.isSeminar || course?.isDiscussion);

    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);
    const codeInfo = splitCourseCode(course.code || "");
    const averageInfo = buildAverageCourseInfo(course);
    const showAverageButton = Boolean(averageInfo && isLectureCourse);
    const averageState = getCourseAverageState(course);
    const instructorName = (course.instructor || "").trim() || "TBA";
    const rmpInfo = buildRmpLookupInfo(course);
    const rmpState = getCourseRmpState(course);

    const card = document.createElement("div");
    card.dataset.courseRenderKey = getCourseRenderKey(course);
    const colorIndex = course?.colorIndex || (index % 7) + 1;
    const subClass = course.isLab || course.isSeminar || course.isDiscussion ? " course-card--sub" : "";
    card.className = `course-card course-card--color-${colorIndex}${subClass}`;
    const courseConflictKey = normalizeConflictToken(course.code || course.title || "");
    const conflictPartners = conflictPartnersByCode.get(courseConflictKey) || [];
    const conflictMessage = conflictPartners.length ? `Schedule conflict with: ${conflictPartners.join(", ")}` : "";
    const showConflictIcon = conflictPartners.length > 0;

    card.innerHTML = `
      <div class="course-card__top">
        <div class="course-card__code">
          ${
            showConflictIcon
              ? `<span class="course-code-conflict wd-hover-tooltip" aria-label="Schedule conflict warning" data-tooltip="${escHTML(conflictMessage)}">🚩</span>`
              : ""
          }
          ${
            codeInfo.subject
              ? `<span class="course-code-subject">${escHTML(codeInfo.subject)}</span>
                 <span class="course-code-number">${escHTML(codeInfo.number)}</span>`
              : `<span class="course-code-subject">${escHTML(codeInfo.raw)}</span>`
          }
          ${sectionLabel ? `<span class="course-code-section wd-hover-tooltip" data-tooltip="Section number">${escHTML(sectionLabel)}</span>` : ""}
          ${formatLabel ? `<span class="course-pill">${escHTML(formatLabel)}</span>` : ""}
        </div>
        <div class="course-card__instructor-wrap">
          ${
            rmpInfo
              ? `<button
                  type="button"
                  class="course-card__rmp-button"
                  data-prof-name="${escHTML(rmpInfo.profName)}"
                  data-campus="${escHTML(rmpInfo.campus)}"
                >
                  RMP Rating
                </button>`
              : ""
          }
          <div class="course-card__instructor">
              ${formatInstructorName(instructorName)}
          </div>
        </div>
      </div>
      <div class="course-card__title">${escHTML(course.title || "")}</div>
      <div class="course-card__body">
        <div class="course-card__details">
          ${
            meetingMain
              ? `<div class="course-card__detail">
                  <span class="material-symbols-rounded" aria-hidden="true">schedule</span>
                  <span>${formatMultiline(meetingMain)}</span>
                </div>`
              : ""
          }
          ${
            meetingSub
              ? `<div class="course-card__detail">
                  <span class="material-symbols-rounded" aria-hidden="true">location_on</span>
                  <span>${formatMultiline(meetingSub)}</span>
                </div>`
              : ""
          }
        </div>
        ${
          showAverageButton
            ? `<div class="course-card__actions">
                <button
                  type="button"
                  class="course-card__avg-button"
                  data-subject="${escHTML(averageInfo.subject)}"
                  data-course="${escHTML(averageInfo.course)}"
                  data-section="${escHTML(averageInfo.section)}"
                  data-campus="${escHTML(averageInfo.campus)}"
                >
                  5 Year Average
                </button>
              </div>`
            : ""
        }
      </div>
    `;

    const averageButton = card.querySelector(".course-card__avg-button");
    if (averageButton && showAverageButton) {
      applyAverageButtonState(averageButton, averageState);

      averageButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await loadAverageForButton(averageButton, averageState);
      });
    }

    const rmpButton = card.querySelector(".course-card__rmp-button");
    if (rmpButton) {
      rmpState.button = rmpButton;
      applyRmpButtonState(rmpButton, rmpState);

      rmpButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (rmpState.status === "loaded" && rmpState.data?.link) {
          window.open(rmpState.data.link, "_blank", "noopener,noreferrer");
          return;
        }

        if (rmpState.status === "loading") return;

        await loadRmpForButton(rmpButton, rmpState, { force: rmpState.status === "error" });
      });

      void loadRmpForButton(rmpButton, rmpState);
    }

    frag.appendChild(card);
  });

  ui.tableBody.appendChild(frag);

  debug.log({ id: "renderCourseObjects.done" }, "Rendered course rows", courses || []);
}

// Reorders already-rendered course cards to match courses order. Input: ui object, courses array. Output: none.
export function reorderCourseObjects(ui, courses) {
  const container = ui?.tableBody;
  if (!container) return;

  const cardsByKey = new Map();
  Array.from(container.children).forEach((child) => {
    const key = child?.dataset?.courseRenderKey;
    if (!key) return;
    cardsByKey.set(key, child);
  });

  const orderedCards = [];

  for (const course of courses || []) {
    const key = getCourseRenderKey(course);
    const card = cardsByKey.get(key);

    if (!card) {
      renderCourseObjects(ui, courses);
      return;
    }

    orderedCards.push(card);
  }

  const frag = document.createDocumentFragment();
  orderedCards.forEach((card) => frag.appendChild(card));
  container.appendChild(frag);

  debug.log({ id: "renderCourseObjects.reorder" }, "Reordered course rows", courses || []);
}
