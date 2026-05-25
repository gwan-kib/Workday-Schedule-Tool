import { debugFor, debugLog } from "../utilities/debugTool.js";
import {
  extractStartDate,
  formatMeetingLineForPanel,
  normalizeMeetingPatternsText,
} from "./meetingPatternsInfo.js";

const debug = debugFor("singleCourseImport");
debugLog({ local: { singleCourseImport: false } });

const WORKDAY_HOST_RE = /(^|\.)myworkday\.com$/i;
const WORKDAY_COURSE_SECTION_SEGMENT_RE = /^15194\$\d+\.htmld$/i;
export const WRONG_COURSE_LINK_ERROR = "Wrong course link: Copy the link in the 'Section' column.";
const WORKDAY_JSON_LABELS = new Set([
  "Course",
  "Instructor Teaching",
  "Instructional Formats",
  "Meeting Patterns",
  "Delivery Mode",
]);
const normalizeSpaces = (value) =>
  String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasText = (value, pattern) => pattern.test(String(value || ""));
const labLike = (text) => hasText(text, /\b(laboratory|lab)\b/i);
const seminarLike = (text) => hasText(text, /\bseminar\b/i);
const discussionLike = (text) => hasText(text, /\bdiscussion\b/i);
const experientialLike = (text) => hasText(text, /\bexperiential\b/i);

function readInstanceText(instance) {
  if (!instance || typeof instance !== "object") return normalizeSpaces(instance);
  return normalizeSpaces(instance.text || instance.value || instance.descriptor || instance.label || "");
}

function readNodeInstances(node) {
  return Array.isArray(node?.instances) ? node.instances.map(readInstanceText).filter(Boolean) : [];
}

function collectWorkdayNodesWithLabels(root) {
  const results = [];
  const stack = Array.isArray(root) ? [...root] : [root];

  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;

    if (typeof node.label === "string" && WORKDAY_JSON_LABELS.has(node.label)) results.push(node);
    if (Array.isArray(node.children)) stack.push(...node.children);
  }

  return results;
}

function getWorkdayJsonChildren(data) {
  const bodyChildren = data?.body?.children;
  if (!Array.isArray(bodyChildren)) return [];
  return bodyChildren[0]?.children || bodyChildren;
}

function readWorkdayJsonTitle(data) {
  return readNodeInstances(data?.title)?.[0] || readInstanceText(data?.title?.instances?.[0]);
}

function getCourseIdFromUrl(url) {
  const parts = String(url || "").split("$");
  return parts[2]?.split(".")?.[0] || "";
}

function getTenantPath(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean)[0] || "ubc";
  } catch (error) {
    return "ubc";
  }
}

function normalizeWorkdayJsonUrl(url) {
  const parsed = new URL(url);
  // Workday copied URLs often include /d/, which returns a document response.
  // Removing that segment asks the same endpoint for the JSON payload.
  parsed.pathname = parsed.pathname.replace("/d/", "/");
  return parsed.href;
}

function buildWorkdayJsonUrlFromId(courseId, baseUrl = window.location.href) {
  const base = new URL(baseUrl);
  const tenant = getTenantPath(base.href);
  return `${base.origin}/${tenant}/inst/1$15194/15194$${courseId}.htmld`;
}

function buildWorkdayPageUrlFromId(courseId, baseUrl = window.location.href) {
  const base = new URL(baseUrl);
  const tenant = getTenantPath(base.href);
  return `${base.origin}/${tenant}/d/inst/1$15194/15194$${courseId}.htmld`;
}

function buildWorkdayPageUrlFromUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const instIndex = parts.indexOf("inst");
  if (instIndex !== -1 && parts[instIndex - 1] !== "d") {
    parts.splice(instIndex, 0, "d");
    parsed.pathname = `/${parts.join("/")}`;
  }
  return parsed.href;
}

function parseWorkdaySectionLabel(labelText) {
  const text = normalizeSpaces(labelText).replace(/\s*\n\s*/g, " ");
  if (!text) return null;

  const match = text.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)\s*-\s*(\S+)(?:\s*[-–—]\s*(.+))?\s*$/i);
  if (match) {
    return {
      code: normalizeSpaces(match[1]),
      section_number: normalizeSpaces(match[2]),
      title: normalizeSpaces(match[3] || "").replace(/\s*:\s*/g, ":\n"),
      full: text,
    };
  }

  return null;
}

function parseCourseLabel(labelText) {
  const text = normalizeSpaces(labelText).replace(/\s*\n\s*/g, " ");
  const match = text.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)(?:\s*[-–—]\s*(.+))?\s*$/i);
  if (!match) return null;

  return {
    code: normalizeSpaces(match[1]),
    title: normalizeSpaces(match[2] || "").replace(/\s*:\s*/g, ":\n"),
    full: text,
  };
}

function parseSectionTitleText(titleText, courseText = "") {
  const direct = parseWorkdaySectionLabel(titleText);
  if (direct?.title) return direct;

  const courseDetails = parseCourseLabel(courseText);
  const sectionMatch =
    normalizeSpaces(titleText).match(/^[A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?\s*-\s*(\S+)/i) ||
    normalizeSpaces(titleText).match(/\bSection\s+(\S+)/i);

  if (courseDetails?.code && (direct?.section_number || sectionMatch?.[1])) {
    return {
      code: courseDetails.code,
      section_number: direct?.section_number || normalizeSpaces(sectionMatch[1]),
      title: direct?.title || courseDetails.title,
      full: normalizeSpaces(titleText || courseText),
    };
  }

  return direct;
}

function createCourseObject({
  sectionDetails,
  instructors = [],
  instructionalFormat = "",
  meetingLines = [],
  isOnline = false,
  workdayCourseId = "",
  workdayCourseLink = "",
}) {
  const format = normalizeSpaces(instructionalFormat);
  const isLab = labLike(format);
  const isSeminar = seminarLike(format);
  const isDiscussion = discussionLike(format);
  const isExperiential = experientialLike(format);
  const uniqueMeetingLines = [...new Set(meetingLines.map(normalizeSpaces).filter(Boolean))];

  return {
    code: sectionDetails.code,
    title: sectionDetails.title,
    section_number: sectionDetails.section_number,
    instructor: instructors.length ? instructors.join(", ") : "N/A",
    meeting: buildMeetingDisplay(uniqueMeetingLines, isOnline),
    instructionalFormat: format,
    startDate: extractStartDate(uniqueMeetingLines[0]) || "",
    meetingLines: uniqueMeetingLines,
    isLab,
    isSeminar,
    isDiscussion,
    isExperiential,
    workdayCourseId,
    workdayCourseLink,
  };
}

export function parseWorkdayCourseIdFromAutomationId(automationId) {
  const match = String(automationId || "").match(/^selectedItem_15194\$(\d+)$/);
  return match?.[1] || "";
}

export function extractWorkdayCourseIdFromElement(root) {
  const selectedCourseEl = root?.matches?.('[data-automation-id^="selectedItem_15194$"]')
    ? root
    : root?.querySelector?.('[data-automation-id^="selectedItem_15194$"]');
  const automationId = selectedCourseEl?.getAttribute?.("data-automation-id") || "";
  const courseId = parseWorkdayCourseIdFromAutomationId(automationId);

  return courseId;
}

function buildMeetingDisplay(meetingLines, isOnline) {
  if (!meetingLines.length) {
    return isOnline ? "No meeting time listed\nOnline" : "No meeting time listed\nNo location listed";
  }

  const meetingObj = formatMeetingLineForPanel(meetingLines[0]);
  if (isOnline) meetingObj.location = "Online";

  const meeting = [meetingObj.days, meetingObj.time].filter(Boolean).join(" | ");
  const location = meetingObj.location || (isOnline ? "Online" : "No location listed");
  return normalizeMeetingPatternsText(`${meeting}\n${location}`);
}

export function extractCourseFromWorkdayJson(data, { sourceUrl = "", courseLink = "" } = {}) {
  if (!data || typeof data !== "object") throw new Error("Workday did not return course JSON.");

  const selectedNodes = collectWorkdayNodesWithLabels(getWorkdayJsonChildren(data));
  const findNode = (label) => selectedNodes.find((node) => node.label === label);

  const courseText = readNodeInstances(findNode("Course"))[0] || "";
  const titleText = readWorkdayJsonTitle(data) || courseText;
  const sectionDetails = parseSectionTitleText(titleText, courseText);
  if (!sectionDetails) throw new Error("Could not find a course section in the Workday JSON.");

  const instructors = readNodeInstances(findNode("Instructor Teaching"));
  const instructionalFormat = readNodeInstances(findNode("Instructional Formats"))[0] || "";
  const meetingLines = readNodeInstances(findNode("Meeting Patterns"));
  const deliveryModes = readNodeInstances(findNode("Delivery Mode"));
  const workdayCourseId = getCourseIdFromUrl(sourceUrl);
  const workdayCourseLink = courseLink || (workdayCourseId ? buildWorkdayPageUrlFromUrl(sourceUrl) : "");

  const course = createCourseObject({
    sectionDetails,
    instructors,
    instructionalFormat,
    meetingLines,
    isOnline: deliveryModes.some((mode) => /online learning/i.test(mode)),
    workdayCourseId,
    workdayCourseLink,
  });

  debug.log({ id: "extractCourseFromWorkdayJson.result" }, "Extracted course from Workday JSON", course);
  return course;
}

// Validates that a user-entered link points to Workday. Input: string. Output: validation result.
export function validateWorkdayCourseLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: "Paste a Workday course link first." };

  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  if (!/^https?:$/i.test(url.protocol) || !WORKDAY_HOST_RE.test(url.hostname)) {
    return { ok: false, error: "Use a Workday link from a myworkday.com page." };
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.includes("inst") && !WORKDAY_COURSE_SECTION_SEGMENT_RE.test(pathParts[pathParts.length - 1] || "")) {
    return { ok: false, error: WRONG_COURSE_LINK_ERROR };
  }

  return { ok: true, url: normalizeWorkdayJsonUrl(url.href), pageUrl: buildWorkdayPageUrlFromUrl(url.href) };
}

// Loads a Workday course link and parses it with the same course shape used by schedule imports.
export async function fetchCourseFromWorkdayLink(link) {
  const validation = validateWorkdayCourseLink(link);
  if (!validation.ok) throw new Error(validation.error);

  debug.log({ id: "fetchCourseFromWorkdayLink.start" }, "Fetching Workday course JSON link", { url: validation.url });
  const response = await fetch(validation.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Workday returned ${response.status} for that course link.`);

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Workday did not return course JSON. Use the URL copied from the course title.");
  }

  const course = extractCourseFromWorkdayJson(data, { sourceUrl: validation.url, courseLink: validation.pageUrl });

  debug.log({ id: "fetchCourseFromWorkdayLink.done" }, "Parsed course from Workday link", course);
  return course;
}

export async function fetchCourseFromWorkdayId(courseId, { baseUrl = window.location.href } = {}) {
  const normalizedId = normalizeSpaces(courseId);
  if (!normalizedId) throw new Error("Course ID not found.");

  return fetchCourseFromWorkdayLink(buildWorkdayPageUrlFromId(normalizedId, baseUrl));
}
