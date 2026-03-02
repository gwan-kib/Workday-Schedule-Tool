import { debugFor } from "./debugTool.js";
const debug = debugFor("dom");

// Returns all matching elements within root. Input: root Element/Document, selector string. Output: array of Elements.
export const $$ = (root, sel) => {
  const result = Array.from(root.querySelectorAll(sel));
  debug.log("Querying multiple elements:", result);
  return result;
};

// Attaches an event listener if the element exists. Input: element, event name, handler, options. Output: none.
export const on = (el, ev, fn, opts) => {
  if (el) {
    debug.log("Attaching event listener:", { el, ev, opts });
    el.addEventListener(ev, fn, opts);
  }
};

// Returns a debounced function that delays invocation. Input: function, delay ms. Output: debounced function.
export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    debug.log("Debouncing function call with delay:", { fn, ms, args: a });
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
