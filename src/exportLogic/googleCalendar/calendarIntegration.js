import { debugFor, debugLog } from "../../utilities/debugTool.js";
import { buildEventsForCourse } from "./eventBuilder.js";

const debug = debugFor("calendarIntegration");
debugLog({ local: { calendarIntegration: false } });

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIMEZONE = "America/Vancouver";

// Marker stamped onto every imported event so we can find + delete previous imports
// without polluting Google's event IDs and without disturbing the user's other events.
const WST_PRIVATE_KEY = "wstSource";
const WST_PRIVATE_VALUE = "workday-import";

// Public message types used to bridge between popup/content scripts and the background worker.
// chrome.identity is unavailable in content scripts, so they must call request* helpers
// instead of the underlying functions directly.
export const CALENDAR_MESSAGE_TYPE = {
  SYNC: "SYNC_GCAL",
  AUTH_STATE: "AUTH_STATE_GCAL",
  SIGN_IN: "SIGN_IN_GCAL",
  DISCONNECT: "DISCONNECT_GCAL",
};

const GCAL_SIGNED_IN_STORAGE_KEY = "wstGoogleCalendarSignedIn";

// Wraps chrome.identity.getAuthToken in a Promise. Input: { interactive }. Output: token string.
const fetchAuthToken = ({ interactive = true } = {}) =>
  new Promise((resolve, reject) => {
    if (!chrome?.identity?.getAuthToken) {
      reject(
        new Error(
          "Chrome Identity API is unavailable. Reload the extension from chrome://extensions in Google Chrome and make sure the identity permission is enabled.",
        ),
      );
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Auth failed"));
      } else if (!token) {
        reject(new Error("No auth token returned by Chrome Identity API"));
      } else {
        resolve(token);
      }
    });
  });

// Drops a cached token so a stale/expired one is not reused. Input: token string. Output: none.
const invalidateAuthToken = (token) =>
  new Promise((resolve) => {
    if (!token) return resolve();
    if (!chrome?.identity?.removeCachedAuthToken) return resolve();
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });

// Reads the extension-level Google sign-in state. Input: none. Output: boolean.
const loadStoredSignedInState = () =>
  new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve(false);
      return;
    }

    chrome.storage.local.get({ [GCAL_SIGNED_IN_STORAGE_KEY]: false }, (result) => {
      resolve(Boolean(result?.[GCAL_SIGNED_IN_STORAGE_KEY]));
    });
  });

// Persists the extension-level Google sign-in state. Input: boolean. Output: none.
const persistSignedInState = (signedIn) =>
  new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve();
      return;
    }

    chrome.storage.local.set({ [GCAL_SIGNED_IN_STORAGE_KEY]: Boolean(signedIn) }, () => resolve());
  });

// Stamps the WST marker onto an event so list/delete can find it later. Input: event. Output: tagged event.
const tagEvent = (event) => ({
  ...event,
  extendedProperties: {
    ...(event.extendedProperties || {}),
    private: {
      ...(event.extendedProperties?.private || {}),
      [WST_PRIVATE_KEY]: WST_PRIVATE_VALUE,
    },
  },
});

// POSTs one event to a calendar. Input: token, calendarId, event. Output: response body or throws Error with .status.
const insertEvent = async (token, calendarId, event) => {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (response.ok) return response.json();

  const body = await response.text().catch(() => "");
  const error = new Error(`Calendar API error ${response.status}: ${body || response.statusText}`);
  error.status = response.status;
  throw error;
};

// Lists every event we previously imported, paging through results.
//   Input: token, calendarId. Output: array of { id }.
const listImportedEvents = async (token, calendarId) => {
  const events = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `${WST_PRIVATE_KEY}=${WST_PRIVATE_VALUE}`,
      maxResults: "2500",
      showDeleted: "false",
      fields: "items(id),nextPageToken",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(`Calendar list error ${response.status}: ${body || response.statusText}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    if (Array.isArray(data.items)) events.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
};

// Deletes one event. 410 Gone is treated as success since the event is already absent.
const deleteEvent = async (token, calendarId, eventId) => {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.ok || response.status === 410) return;

  const body = await response.text().catch(() => "");
  const error = new Error(`Calendar delete error ${response.status}: ${body || response.statusText}`);
  error.status = response.status;
  throw error;
};

// Syncs the user's Workday schedule into Google Calendar: wipes every event we previously imported
// (matched by the WST private marker), then re-imports the current schedule from scratch.
// Always safe to call — on the first run there's nothing to wipe and it behaves like a plain import.
//   Input: courses array (shape from extractCoursesData), optional { calendarId, timeZone }.
//   Output: { removed, deleteFailed, added, failed, skipped, errors } summary.
export async function syncCoursesToCalendar(courses, options = {}) {
  const calendarId = options.calendarId || "primary";
  const timeZone = options.timeZone || DEFAULT_TIMEZONE;

  if (!Array.isArray(courses) || !courses.length) {
    debug.warn("No courses provided");
    return { removed: 0, deleteFailed: 0, added: 0, failed: 0, skipped: 0, errors: [] };
  }

  const events = courses.flatMap((course) => buildEventsForCourse(course, { timeZone })).map(tagEvent);
  const meetingLineCount = courses.reduce(
    (total, course) => total + (Array.isArray(course?.meetingLines) ? course.meetingLines.length : 0),
    0,
  );
  const skipped = Math.max(0, meetingLineCount - events.length);

  debug.log(
    { id: "syncCoursesToCalendar.events" },
    `Built ${events.length} event(s) from ${courses.length} course(s); skipped ${skipped} unparseable line(s)`,
  );

  let token = await fetchAuthToken({ interactive: true });

  // Refresh token + retry once on 401 — covers stale cached tokens.
  const withRetry = async (operation) => {
    try {
      return await operation(token);
    } catch (error) {
      if (error.status !== 401) throw error;
      debug.warn({ id: "withRetry.refresh" }, "Token rejected, refreshing once");
      await invalidateAuthToken(token);
      token = await fetchAuthToken({ interactive: true });
      return operation(token);
    }
  };

  // Step 1: list and delete prior imports.
  const existing = await withRetry((tok) => listImportedEvents(tok, calendarId));
  debug.log({ id: "syncCoursesToCalendar.existing" }, `Found ${existing.length} previously imported event(s)`);

  const deleteResults = existing.length
    ? await Promise.allSettled(existing.map((event) => withRetry((tok) => deleteEvent(tok, calendarId, event.id))))
    : [];

  const removed = deleteResults.filter((r) => r.status === "fulfilled").length;
  const deleteFailed = deleteResults.filter((r) => r.status === "rejected").length;
  const deleteErrors = deleteResults.filter((r) => r.status === "rejected").map((r) => r.reason);

  // Step 2: insert fresh events in parallel.
  const insertResults = events.length
    ? await Promise.allSettled(events.map((event) => withRetry((tok) => insertEvent(tok, calendarId, event))))
    : [];

  const summary = {
    removed,
    deleteFailed,
    added: insertResults.filter((r) => r.status === "fulfilled").length,
    failed: insertResults.filter((r) => r.status === "rejected").length,
    skipped,
    errors: [...deleteErrors, ...insertResults.filter((r) => r.status === "rejected").map((r) => r.reason)],
  };

  debug.log({ id: "syncCoursesToCalendar.summary" }, summary);
  return summary;
}

// Reports whether the user has signed into Google from this extension.
//   Input: none. Output: { signedIn: boolean }.
export async function getCalendarAuthState() {
  return { signedIn: await loadStoredSignedInState() };
}

// Starts the interactive Google sign-in flow and records that this extension may sync.
//   Input: none. Output: { signedIn: boolean }.
export async function signInCalendar() {
  await fetchAuthToken({ interactive: true });
  await persistSignedInState(true);
  return { signedIn: true };
}

// Clears the cached OAuth token so the next import re-prompts for permission.
// Useful if the user wants to switch Google accounts or revoke access locally.
//   Input: none. Output: { cleared: boolean }.
export async function disconnectCalendar() {
  await persistSignedInState(false);

  try {
    const token = await fetchAuthToken({ interactive: false });
    await invalidateAuthToken(token);
    debug.log({ id: "disconnectCalendar" }, "Cached calendar auth token cleared");
    return { cleared: true };
  } catch (error) {
    debug.log({ id: "disconnectCalendar.noop" }, "No cached token to clear:", error.message);
    return { cleared: false };
  }
}

// Builds a Google Calendar week-view URL focused on the earliest course start date,
// so the user lands on a week that actually contains the imported events.
//   Input: courses array. Output: URL string.
export function buildCalendarViewUrl(courses) {
  const earliest = (Array.isArray(courses) ? courses : [])
    .map((course) => course?.startDate)
    .filter(Boolean)
    .sort()[0];

  if (!earliest) return "https://calendar.google.com/calendar/u/0/r/week";

  const [y, m, d] = earliest.split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return "https://calendar.google.com/calendar/u/0/r/week";

  return `https://calendar.google.com/calendar/u/0/r/week/${y}/${m}/${d}`;
}

// Generic message-passing helper, since all three request* helpers share the same plumbing.
const sendMessage = (type, payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || `Request '${type}' failed`));
        return;
      }
      resolve(response);
    });
  });

// Asks the background worker to wipe previous imports and re-import the schedule.
// Use from contexts without chrome.identity (popup/content).
//   Input: courses array, optional { calendarId, timeZone }.
//   Output: { removed, deleteFailed, added, failed, skipped, errors } (errors is an array of strings).
export async function requestSyncCoursesToCalendar(courses, options = {}) {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.SYNC, { courses, options });
  return response.summary;
}

// Asks the background worker for the extension-level Google sign-in state.
//   Input: none. Output: { signedIn: boolean }.
export async function requestCalendarAuthState() {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.AUTH_STATE, {});
  return { signedIn: Boolean(response.signedIn) };
}

// Asks the background worker to start the interactive Google sign-in flow.
//   Input: none. Output: { signedIn: boolean }.
export async function requestSignInCalendar() {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.SIGN_IN, {});
  return { signedIn: Boolean(response.signedIn) };
}

// Asks the background worker to clear the cached OAuth token.
//   Input: none. Output: { cleared: boolean }.
export async function requestDisconnectCalendar() {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.DISCONNECT, {});
  return { cleared: response.cleared };
}
