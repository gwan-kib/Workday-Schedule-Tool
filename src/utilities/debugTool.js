const logConfiguration = {
  global: false, // master switch (all logs everywhere)
  local: {}, // per-scope switch: { "schedule": true/false, ... }
  log: {}, // per-log switch: { "schedule.render": true/false, ... }
};

// this function updates the logging configuration state:
// debugLog({ global: false })                    -> turns ALL logs off (global control)
// debugLog({ local: { schedule: true } })        -> turns logs ON for the "schedule" module (local control)
// debugLog({ log: { "schedule.render": false }}) -> disables logging for the "schedule.render" function (specific log control)
export const debugLog = ({ global, local, log } = {}) => {
  if (typeof global === "boolean") logConfiguration.global = global;

  if (local && typeof local === "object") {
    for (const [k, v] of Object.entries(local)) {
      if (typeof v === "boolean") logConfiguration.local[k] = v;
    }
  }

  if (log && typeof log === "object") {
    for (const [k, v] of Object.entries(log)) {
      if (typeof v === "boolean") logConfiguration.log[k] = v;
    }
  }
};

// quick read of current config settings (for debugging this file)
export const getLogConfiguration = () => ({
  global: logConfiguration.global,
  local: { ...logConfiguration.local },
  log: { ...logConfiguration.log },
});

// logic to decide if a log should print
const loggingIsOn = (scope, id) => {
  if (!logConfiguration.global) return false; // If global logging is off, return immediately

  if (scope && logConfiguration.local[scope] === false) return false; // Local control check
  if (id && logConfiguration.log[id] === false) return false; // Specific log control

  return true; // Default: logs are ON
};

// main logger factory for a given scope (file/module), eg. const D = debugFor("schedule");
export const debugFor = (scope) => {
  const prefix = scope ? `[Workday - Schedule Tool (file: ${scope})]\n` : "[Workday - Schedule Tool]\n"; // prefix at the start of all logs

  // .log can either be the message (string), .log("message"), or a meta object, .log({ id: "schedule.render" }, "message"),
  // or both, .log({ id: "schedule.render", on: false }, "message")
  // ...rest means it can also take in any additional arguments (an object, an array, etc.)
  const log = (metaOrMsg, ...rest) => {
    let meta = null;
    let args = null;

    if (metaOrMsg && typeof metaOrMsg === "object" && !Array.isArray(metaOrMsg)) {
      meta = metaOrMsg;
      args = rest;
    } else {
      meta = null;
      args = [metaOrMsg, ...rest];
    }

    const id = meta?.id;
    const forceOn = meta?.on === true; // if forceOn is true, this forces the log to show regardless of global/local/log settings.
    const forceOff = meta?.on === false; // if forceOff is true, immediately return (log is disabled for this specific call).

    if (forceOff) return;
    if (!forceOn && !loggingIsOn(scope, id)) return;

    console.log(prefix, ...args);
  };

  // same as log but for warnings
  const warning = (metaOrMsg, ...rest) => {
    let meta = null;
    let args = null;

    if (metaOrMsg && typeof metaOrMsg === "object" && !Array.isArray(metaOrMsg)) {
      meta = metaOrMsg;
      args = rest;
    } else {
      args = [metaOrMsg, ...rest];
    }

    const id = meta?.id;
    const forceOn = meta?.on === true;
    const forceOff = meta?.on === false;

    if (forceOff) return;
    if (!forceOn && !loggingIsOn(scope, id)) return;

    console.log("⚠️", prefix, ...args);
  };

  // same as log but for errors
  const error = (metaOrMsg, ...rest) => {
    let meta = null;
    let args = null;

    if (metaOrMsg && typeof metaOrMsg === "object" && !Array.isArray(metaOrMsg)) {
      meta = metaOrMsg;
      args = rest;
    } else {
      args = [metaOrMsg, ...rest];
    }

    const id = meta?.id;
    const forceOn = meta?.on === true;
    const forceOff = meta?.on === false;

    if (forceOff) return;
    if (!forceOn && !loggingIsOn(scope, id)) return;

    console.log("🚩", prefix, ...args);
  };

  // Convenience toggles for this scope (still goes through debugLog under the hood)
  const on = () => debugLog({ local: { [scope]: true } });
  const off = () => debugLog({ local: { [scope]: false } });

  return { log, warn: warning, error, on, off };
};
