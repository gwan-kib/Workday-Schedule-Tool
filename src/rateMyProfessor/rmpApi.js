import { debugFor, debugLog } from "../utilities/debugTool.js";

const debug = debugFor("rmpApi");
debugLog({ local: { rmpApi: false } });

const RMP_BASE_URL = "https://www.ratemyprofessors.com";
const RMP_API_URL = "https://www.ratemyprofessors.com/graphql";
const BASIC_AUTH_KEY = "dGVzdDp0ZXN0";
const RMP_MESSAGE_TYPE = "FETCH_RMP_RATING";

const UBCV_SCHOOL_ID = "U2Nob29sLTE0MTM=";
const UBCO_SCHOOL_ID = "U2Nob29sLTU0MzY=";

const HONORIFIC_RE = /^(dr|prof|professor|mr|mrs|ms)\.?\s+/i;
const MULTI_INSTRUCTOR_RE = /\s(?:and|&)\s|\/|;|\|/i;

const responseCache = new Map();

// Collapses repeated whitespace in a string. Input: string. Output: normalized string.
function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

// Removes common non-name fragments before lookup. Input: instructor string. Output: cleaned string.
function stripInstructorNoise(value) {
  return normalizeWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(HONORIFIC_RE, "")
    .replace(/,$/, "")
    .trim();
}

// Normalizes an instructor name for RMP lookup. Input: instructor string. Output: fullName/firstName/lastName or null.
export function normalizeProfessorName(value) {
  const raw = stripInstructorNoise(value);
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (upper === "N/A" || upper === "TBA" || upper === "STAFF") return null;
  if (MULTI_INSTRUCTOR_RE.test(raw)) return null;

  let normalized = raw;
  if (raw.includes(",")) {
    const commaParts = raw
      .split(",")
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);

    if (commaParts.length !== 2) return null;
    normalized = `${commaParts[1]} ${commaParts[0]}`;
  }

  const parts = normalized
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  return {
    fullName: parts.join(" "),
    firstName,
    lastName,
  };
}

// Infers UBC campus from a course code. Input: code string. Output: UBCV/UBCO.
export function inferCampusFromCourseCode(code) {
  const subject = String(code || "")
    .trim()
    .toUpperCase()
    .match(/^([A-Z][A-Z0-9_]{1,8})\s*\d/);

  return subject?.[1]?.endsWith("_O") ? "UBCO" : "UBCV";
}

// Returns the RMP school id for a campus. Input: campus string. Output: GraphQL school id.
function getSchoolId(campus) {
  return String(campus || "").toUpperCase() === "UBCO" ? UBCO_SCHOOL_ID : UBCV_SCHOOL_ID;
}

// Builds the RMP GraphQL request payload. Input: professor name string and school id. Output: request body object.
function buildRMPQueryBody(profName, schoolID) {
  return {
    query:
      'query TeacherSearchResultsPageQuery(\n  $query: TeacherSearchQuery!\n  $schoolID: ID\n  $includeSchoolFilter: Boolean!\n) {\n  search: newSearch {\n    ...TeacherSearchPagination_search_1ZLmLD\n  }\n  school: node(id: $schoolID) @include(if: $includeSchoolFilter) {\n    __typename\n    ... on School {\n      name\n    }\n    id\n  }\n}\n\nfragment TeacherSearchPagination_search_1ZLmLD on newSearch {\n  teachers(query: $query, first: 8, after: "") {\n    didFallback\n    edges {\n      cursor\n      node {\n        ...TeacherCard_teacher\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n    resultCount\n    filters {\n      field\n      options {\n        value\n        id\n      }\n    }\n  }\n}\n\nfragment TeacherCard_teacher on Teacher {\n  id\n  legacyId\n  avgRating\n  numRatings\n  ...CardFeedback_teacher\n  ...CardSchool_teacher\n  ...CardName_teacher\n  ...TeacherBookmark_teacher\n}\n\nfragment CardFeedback_teacher on Teacher {\n  wouldTakeAgainPercent\n  avgDifficulty\n}\n\nfragment CardSchool_teacher on Teacher {\n  department\n  school {\n    name\n    id\n  }\n}\n\nfragment CardName_teacher on Teacher {\n  firstName\n  lastName\n}\n\nfragment TeacherBookmark_teacher on Teacher {\n  id\n  isSaved\n}\n',
    variables: {
      query: {
        text: profName,
        schoolID,
        fallback: false,
        departmentID: null,
      },
      schoolID,
      includeSchoolFilter: true,
    },
  };
}

// Extracts a conservative RMP match from search results. Input: response JSON and name object. Output: rating data or null.
function extractTeacherMatch(responseJson, normalizedName) {
  const edges = responseJson?.data?.search?.teachers?.edges;
  if (!Array.isArray(edges) || !edges.length) return null;

  const expectedFirst = String(normalizedName?.firstName || "").toLowerCase();
  const expectedLast = String(normalizedName?.lastName || "").toLowerCase();

  for (const edge of edges) {
    const teacher = edge?.node;
    if (!teacher || teacher.avgRating === 0) continue;

    const firstName = normalizeWhitespace(teacher.firstName).toLowerCase();
    const lastName = normalizeWhitespace(teacher.lastName).toLowerCase();

    if (firstName.startsWith(expectedFirst) && lastName.endsWith(expectedLast)) {
      return {
        rating: teacher.avgRating,
        link: `${RMP_BASE_URL}/professor/${teacher.legacyId}`,
      };
    }
  }

  return null;
}

// Queries RateMyProfessors from the background worker. Input: profName/campus object. Output: rating data or null.
export async function queryProfRating({ profName, campus } = {}) {
  const normalizedName = normalizeProfessorName(profName);
  if (!normalizedName) return null;

  const resolvedCampus = String(campus || "").toUpperCase() === "UBCO" ? "UBCO" : "UBCV";
  const schoolID = getSchoolId(resolvedCampus);
  const cacheId = `${resolvedCampus}|${normalizedName.fullName.toUpperCase()}`;

  if (responseCache.has(cacheId)) return responseCache.get(cacheId);

  debug.log({ id: "queryProfRating.request" }, "Fetching professor rating", {
    profName: normalizedName.fullName,
    campus: resolvedCampus,
  });

  const resp = await fetch(RMP_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIC_AUTH_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildRMPQueryBody(normalizedName.fullName, schoolID)),
  });

  if (!resp.ok) {
    const error = new Error(`RateMyProfessors request failed (${resp.status})`);
    error.status = resp.status;
    throw error;
  }

  const responseJson = await resp.json();
  const result = extractTeacherMatch(responseJson, normalizedName);
  responseCache.set(cacheId, result);

  debug.log({ id: "queryProfRating.response" }, "Resolved professor rating", {
    profName: normalizedName.fullName,
    campus: resolvedCampus,
    result,
  });

  return result;
}

// Fetches professor rating from the content script through the background worker. Input: profName/campus object. Output: rating data or null.
export function fetchProfRating({ profName, campus } = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: RMP_MESSAGE_TYPE,
        payload: { profName, campus },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "RateMyProfessors request failed"));
          return;
        }

        resolve(response.data ?? null);
      },
    );
  });
}

export { RMP_MESSAGE_TYPE };
