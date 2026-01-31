import { debugFor } from "./debugTool.js";
const debug = debugFor("dom");

// shortcut for querySelector in shadowDom
export const $ = (root, sel) => {
  debug.log("Querying single element:", { root, sel });
  return root.querySelector(sel);
};

// shortcut for querySelectorAll in shadowDom, turns result into an array
export const $$ = (root, sel) => {
  debug.log("Querying multiple elements:", { root, sel });
  return Array.from(root.querySelectorAll(sel));
};

// if el exists, attaches event listener to el
export const on = (el, ev, fn, opts) => {
  if (el) {
    debug.log("Attaching event listener:", { el, ev, opts });
    el.addEventListener(ev, fn, opts);
  }
};

// limits how often a function is called, sets a timer and function can only be called again after timer is complete
export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    debug.log("Debouncing function call with delay:", { fn, ms, args: a });
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
