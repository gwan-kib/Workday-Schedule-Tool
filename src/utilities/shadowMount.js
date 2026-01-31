import { debugFor } from "./debugTool.js";
const debug = debugFor("shadowMount");

// extension ID
const EXT_ID = "Workday - Schedule Tool";

// first time it's called it mounts the extension, in subsequent calls it returns the extension's shadow root
export function ensureMount() {
  let host = document.getElementById(EXT_ID);

  if (host) {
    debug.log("Returning existing shadow root:", host);
    return host.shadowRoot;
  }

  // creates container for extension, sets styles, then appends extension to the page
  host = document.createElement("div");
  host.id = EXT_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "16px";
  host.style.right = "16px";
  host.style.zIndex = "999999999";
  host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  debug.log("Mounted new extension container:", host);
  return host.shadowRoot;
}
