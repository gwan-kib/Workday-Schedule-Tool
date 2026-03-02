import { debugFor, debugLog } from "../utilities/debugTool.js";
import { parseSectionLinkString } from "../extraction/parsers/sectionLinkInfo.js";

const debug = debugFor("gradesApiCall");
debugLog({ local: { gradesApiCall: true } });

const API_BASE = "https://ubcgrades.com/api";
const DEFAULT_API_VERSION = "v3";

const TERM_CAMPUS_RE = /(\d{4})-\d{2}\s+(Winter|Summer)\s+Term\s+\d+\s+\((UBC-[VO])\)/i;

const SUBJECT_COURSE_RE = /^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/;

const responseCache = new Map();

// Normalizes a subject code by removing campus suffix. Input: string. Output: string.
const normalizeSubject = (raw) => String(raw || "").replace(/_[VO]$/i, "");

// Normalizes a section token to uppercase and max length 3. Input: string. Output: string.
const normalizeSection = (raw) => {
  const str = String(raw || "")
    .trim()
    .toUpperCase();
  if (!str) return "";
  return str.length > 3 ? str.slice(0, 3) : str;
};

// Builds the grades API URL. Input: params object. Output: URL string.
const buildGradesUrl = ({ version, campus, yearsession, subject, course, section }) => {
  const base = `${API_BASE}/${version}/grades/${campus}/${yearsession}/${subject}/${course}`;
  return section ? `${base}/${section}` : base;
};

// Builds the yearsessions API URL. Input: params object. Output: URL string.
const buildYearsessionsUrl = ({ version, campus }) =>
  `${API_BASE}/${version}/yearsessions/${campus}/`;

// Builds a cache key for API responses. Input: version, campus, yearsession, subject, course, section. Output: string.
const cacheKey = (version, campus, yearsession, subject, course, section) =>
  [version, campus, yearsession, subject, course, section].filter(Boolean).join("|");

// Fetches JSON from a URL. Input: URL string and optional options. Output: parsed JSON object.
async function fetchJson(url, { signal } = {}) {
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    const message = `UBCGrades request failed (${resp.status})`;
    const error = new Error(message);
    error.status = resp.status;
    error.url = url;
    throw error;
  }
  return resp.json();
}

// Fetches yearsessions list. Input: params object and optional options. Output: yearsessions data or null.
async function fetchYearsessions(
  { campus, version = DEFAULT_API_VERSION },
  { signal, useCache = true } = {},
) {
  if (!campus) return null;
  const cacheId = cacheKey(version, "yearsessions", campus);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildYearsessionsUrl({ version, campus });
  debug.log({ id: "fetchYearsessions.request" }, "UBCGrades yearsessions request:", { campus }, url);

  const data = await fetchJson(url, { signal });
  debug.log({ id: "fetchYearsessions.response" }, "UBCGrades yearsessions response:", { campus }, data);

  if (useCache) responseCache.set(cacheId, data);
  return data;
}

// Normalizes a yearsessions response to an array. Input: API data. Output: array of strings.
function normalizeYearsessionsList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean).map(String);
  if (Array.isArray(data?.yearsessions)) return data.yearsessions.filter(Boolean).map(String);
  return [];
}

// Resolves a fallback yearsession from available list. Input: requested string, available array. Output: string.
function resolveFallbackYearsession(requested, available) {
  if (!requested || !available.length) return requested || null;
  if (available.includes(requested)) return requested;

  const normalize = (value) => String(value || "").toUpperCase();
  const req = normalize(requested);
  const reqYear = Number(req.slice(0, 4));
  const reqSeason = req.slice(4);

  const parsed = available
    .map((value) => {
      const v = normalize(value);
      return { value: v, year: Number(v.slice(0, 4)), season: v.slice(4) };
    })
    .filter((item) => Number.isFinite(item.year));

  parsed.sort((a, b) => (a.year - b.year) || a.season.localeCompare(b.season));

  const sameSeasonPrior = parsed.filter((item) => item.season === reqSeason && item.year <= reqYear);
  if (sameSeasonPrior.length) return sameSeasonPrior[sameSeasonPrior.length - 1].value;

  return parsed.length ? parsed[parsed.length - 1].value : requested;
}

// Builds descending fallback yearsession candidates. Input: requested string, minYear number. Output: array of strings.
function buildYearsessionFallbacks(requested, minYear = 2020) {
  const req = String(requested || "").toUpperCase();
  const year = Number(req.slice(0, 4));
  const season = req.slice(4) || "W";
  if (!Number.isFinite(year)) return [];

  const out = [];
  for (let y = year; y >= minYear; y -= 1) {
    out.push(`${y}${season}`);
  }
  return out;
}

// Builds ordered candidate list from available yearsessions. Input: requested string, available array. Output: array.
function buildAvailableYearsessionCandidates(requested, available) {
  if (!available.length) return [];

  const normalize = (value) => String(value || "").toUpperCase();
  const req = normalize(requested);
  const reqYear = Number(req.slice(0, 4));
  const reqSeason = req.slice(4);

  const parsed = available
    .map((value) => {
      const v = normalize(value);
      return { value: v, year: Number(v.slice(0, 4)), season: v.slice(4) };
    })
    .filter((item) => Number.isFinite(item.year));

  const sameSeason = parsed
    .filter((item) => item.season === reqSeason && item.year <= reqYear)
    .sort((a, b) => b.year - a.year)
    .map((item) => item.value);

  const remaining = parsed
    .filter((item) => !sameSeason.includes(item.value))
    .sort((a, b) => (b.year - a.year) || a.season.localeCompare(b.season))
    .map((item) => item.value);

  return [...sameSeason, ...remaining];
}

// Parses a course code string. Input: code string. Output: { subject, course } or null.
function parseCourseCode(code) {
  const str = String(code || "")
    .trim()
    .toUpperCase();
  const match = str.match(SUBJECT_COURSE_RE);
  if (!match) return null;

  const subject = normalizeSubject(match[1]);
  const course = match[2];

  return { subject, course };
}

// Parses a course prompt string. Input: prompt text string. Output: course info object or null.
export function parseCourseInfoFromPromptText(promptText) {
  const parsed = parseSectionLinkString(promptText);
  if (!parsed) return null;

  const codeInfo = parseCourseCode(parsed.code);
  if (!codeInfo) return null;

  return {
    ...codeInfo,
    section: normalizeSection(parsed.section_number),
    title: parsed.title,
    full: parsed.full,
  };
}

// Reads term campus info from text. Input: page text string. Output: { campus, yearsession } or null.
function readTermCampusFromText(text) {
  const m = String(text || "").match(TERM_CAMPUS_RE);
  if (!m) return null;

  const startYear = m[1];
  const season = m[2].toLowerCase();
  const campusRaw = m[3].toUpperCase();

  const yearsession = `${startYear}${season === "winter" ? "W" : "S"}`;
  const campus = campusRaw === "UBC-V" ? "UBCV" : "UBCO";

  return { campus, yearsession };
}

// Reads term campus info from the document body. Input: none. Output: { campus, yearsession } or null.
export function readTermCampus() {
  const text = document?.body?.innerText || "";
  return readTermCampusFromText(text);
}

// Fetches course grades. Input: params object and optional options. Output: API JSON or null.
async function fetchCourseGrades(
  { campus, yearsession, subject, course, version = DEFAULT_API_VERSION },
  { signal, useCache = true } = {},
) {
  if (!campus || !yearsession || !subject || !course) return null;

  const cacheId = cacheKey(version, campus, yearsession, subject, course);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildGradesUrl({
    version,
    campus,
    yearsession,
    subject,
    course,
  });

  debug.log(
    { id: "fetchCourseGrades.request" },
    "UBCGrades course request:",
    { version, campus, yearsession, subject, course },
    url,
  );

  const data = await fetchJson(url, { signal });
  debug.log(
    { id: "fetchCourseGrades.response" },
    "UBCGrades response:",
    { version, campus, yearsession, subject, course },
    data,
  );
  if (useCache) responseCache.set(cacheId, data);
  return data;
}

// Fetches course grades with yearsession fallback. Input: params object and optional options. Output: API JSON or null.
export async function fetchSectionGradesWithFallback(
  { campus, yearsession, subject, course, section },
  { signal, useCache = true, isValid } = {},
) {
  let resolvedYearsession = yearsession;
  let yearsessionCandidates = [];
  try {
    const list = await fetchYearsessions({ campus }, { signal, useCache });
    const available = normalizeYearsessionsList(list);
    resolvedYearsession = resolveFallbackYearsession(yearsession, available);
    yearsessionCandidates = buildAvailableYearsessionCandidates(resolvedYearsession, available);
  } catch (error) {
    debug.warn(
      { id: "fetchSectionGradesWithFallback.yearsessionLookupFailed" },
      "yearsession lookup failed; continuing with requested",
      { error: String(error), campus, yearsession },
    );
  }

  if (!yearsessionCandidates.length) {
    yearsessionCandidates = [resolvedYearsession, ...buildYearsessionFallbacks(resolvedYearsession, 2020)].filter(
      Boolean,
    );
  }

  if (section) {
    debug.log(
      { id: "fetchSectionGradesWithFallback.sectionIgnored" },
      "section provided; using course-level endpoint only",
      { campus, yearsession, subject, course, section },
    );
  }

  const seen = new Set();
  for (const candidate of yearsessionCandidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    if (candidate !== yearsession) {
      debug.warn(
        { id: "fetchSectionGradesWithFallback.yearsessionFallback" },
        "trying fallback yearsession",
        { campus, requested: yearsession, candidate },
      );
    }

    try {
      const data = await fetchCourseGrades(
        { campus, yearsession: candidate, subject, course, version: DEFAULT_API_VERSION },
        { signal, useCache },
      );
      if (typeof isValid !== "function" || isValid(data)) return data;
      debug.warn(
        { id: "fetchSectionGradesWithFallback.invalidData" },
        "course-level v3 returned invalid data; trying next yearsession",
        { campus, yearsession: candidate, subject, course },
      );
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
  }

  return null;
}
