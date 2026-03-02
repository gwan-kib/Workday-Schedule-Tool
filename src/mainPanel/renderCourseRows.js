import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("renderCourseRows");

// Escapes HTML entities in a string. Input: string. Output: escaped string.
const escHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
  const match = String(code || "").match(/^([A-Z_]+)\s*(\d+)$/);
  if (match) {
    return { subject: match[1], number: match[2], raw: `${match[1]} ${match[2]}` };
  }
  return { subject: "", number: "", raw: code || "" };
}

// Formats an instructor name for display. Input: name string. Output: string.
function formatInstructorName(name) {
  const nameParts = String(name || "")
    .trim()
    .split(/\s+/);
  if (nameParts.length > 1) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");
    return `${firstName} ${lastName}`;
  }
  return name || "";
}

// Formats multiline content for HTML. Input: string. Output: HTML string.
function formatMultiline(text) {
  return escHTML(text || "").replace(/\n/g, "<br>");
}

// Renders course rows into the table body. Input: ui object, courses array. Output: none.
export function renderCourseRows(ui, courses) {
  ui.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  (courses || []).forEach((course, index) => {
    const formatLabel = String(course.instructionalFormat || "").trim();
    const sectionLabel = String(course.section_number || "").trim();

    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);
    const codeInfo = splitCourseCode(course.code || "");
    const instructorName = (course.instructor || "").trim() || "TBA";

    const card = document.createElement("div");
    const colorIndex = course?.colorIndex || (index % 7) + 1;
    const subClass =
      course.isLab || course.isSeminar || course.isDiscussion ? " course-card--sub" : "";
    card.className = `course-card course-card--color-${colorIndex}${subClass}`;

    card.innerHTML = `
      <div class="course-card__top">
        <div class="course-card__code">
          ${
            codeInfo.subject
              ? `<span class="course-code-subject">${escHTML(codeInfo.subject)}</span>
                 <span class="course-code-number">${escHTML(codeInfo.number)}</span>`
              : `<span class="course-code-subject">${escHTML(codeInfo.raw)}</span>`
          }
          ${sectionLabel ? `<span class="course-code-section" title="Section Number">${escHTML(sectionLabel)}</span>` : ""}
          ${formatLabel ? `<span class="course-pill">${escHTML(formatLabel)}</span>` : ""}
        </div>
        <div class="course-card__instructor">
          <div class="instructor-wrapper">
            ${formatInstructorName(instructorName)}
            <div class="instructor-popup">
              <div class="instructor-popup-content">
                ${escHTML(instructorName)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="course-card__title">${escHTML(course.title || "")}</div>
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
    `;

    frag.appendChild(card);
  });

  ui.tableBody.appendChild(frag);

  debug.log({ id: "renderCourseRows.done" }, "Rendered course rows", courses || []);
}
