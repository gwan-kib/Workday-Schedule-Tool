import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("renderCourseRows");

const escHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function cleanLines(text) {
  return String(text || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function getBadge(course) {
  if (course.isLab) return "[Laboratory]";
  if (course.isSeminar) return "[Seminar]";
  if (course.isDiscussion) return "[Discussion]";
  return "";
}

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

export function renderCourseRows(ui, courses) {
  ui.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  (courses || []).forEach((course) => {
    const tr = document.createElement("tr");
    const badge = getBadge(course);

    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);

    tr.innerHTML = `
      <td class="title">
        <div class="title-main">${escHTML(course.title || "")}</div>
        ${badge ? `<div class="muted">${escHTML(badge)}</div>` : ""}
      </td>
      <td class="code">${escHTML(course.code || "")}</td>
      <td class="sect">${escHTML((course.section_number || "").trim())}</td>
      <td class="instructor">${escHTML(course.instructor || "")}</td>
      <td class="meeting">
        ${meetingMain ? `<span class="meeting-pill">${escHTML(meetingMain)}</span>` : ""}
        ${meetingSub ? `<div class="meeting-sub">${escHTML(meetingSub)}</div>` : ""}
      </td>
      <td class="instructionalFormat">${escHTML(course.instructionalFormat || "")}</td>
    `;

    frag.appendChild(tr);
  });

  ui.tableBody.appendChild(frag);

  debug.log({ id: "renderCourseRows.done" }, "Rendered course rows", {
    count: (courses || []).length,
  });
}
