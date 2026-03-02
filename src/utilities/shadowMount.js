import { debugFor } from "./debugTool.js";
const debug = debugFor("shadowMount");

const EXT_ID = "Workday - Schedule Tool";

// Ensures the extension container is mounted and returns its shadow root. Input: none. Output: ShadowRoot.
export function ensureMount() {
  let host = document.getElementById(EXT_ID);

  if (host) {
    debug.log("Returning existing shadow root:", host.shadowRoot);
    return host.shadowRoot;
  }

  host = document.createElement("div");
  host.id = EXT_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "16px";
  host.style.right = "16px";
  host.style.zIndex = "999999999";
  host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  debug.log("Mounted new extension container:", host.shadowRoot);
  return host.shadowRoot;
}
