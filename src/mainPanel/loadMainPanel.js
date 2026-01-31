import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("loadMainPanel");

export async function loadMainPanel(shadowRoot) {
  const htmlUrl = chrome.runtime.getURL("dist/panel.html");

  const cssFiles = [
    "formatting/widget-base.css",
    "formatting/widget-tabs-header.css",
    "formatting/widget-header-tabs.css",
    "formatting/course-list-view.css",
    "formatting/schedule-view.css",
    "formatting/settings-view.css",
    "formatting/help-view.css",
    "formatting/widget-footer.css",
    "formatting/floating-button.css",

    "colors/theme-tokens.css",
    "colors/widget-base-colors.css",
    "colors/widget-header-tabs-color.css",
    "colors/course-list-colors.css",
    "colors/schedule-view-colors.css",
    "colors/settings-view-colors.css",
    "colors/help-view-colors.css",
    "colors/widget-footer-colors.css",
    "colors/floating-button-colors.css",
    "colors/settings-colors.css",
  ];

  const [html, ...cssParts] = await Promise.all([
    fetch(htmlUrl).then((r) => r.text()),
    ...cssFiles.map((file) => fetch(chrome.runtime.getURL(`dist/css/${file}`)).then((r) => r.text())),
  ]);

  const css = cssParts.join("\n");

  shadowRoot.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = css;
  shadowRoot.appendChild(style);

  if (!document.querySelector('link[href*="Material+Symbols"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    document.head.appendChild(link);
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  shadowRoot.appendChild(wrap);

  const ui = {
    mainPanel: shadowRoot.querySelector(".widget"),

    root: shadowRoot,
    floatingButton: shadowRoot.querySelector("#floating-button"),

    tableBody: shadowRoot.querySelector("tbody"),
    tableHead: shadowRoot.querySelector("thead"),

    searchInput: shadowRoot.querySelector("#widget-search"),
    refreshButton: shadowRoot.querySelector("#widget-refresh"),
    saveScheduleButton: shadowRoot.querySelector("#widget-save-schedule"),

    exportDropdown: shadowRoot.querySelector("#widget-export"),
    exportButton: shadowRoot.querySelector("#widget-export-button"),
    exportMenu: shadowRoot.querySelector("#widget-export-menu"),

    viewTabs: shadowRoot.querySelectorAll(".tab-button"),
    views: shadowRoot.querySelectorAll(".widget-panel"),

    scheduleGrid: shadowRoot.querySelector("#schedule-grid"),
    semesterButtons: shadowRoot.querySelectorAll(".semester-button"),
    footerConflicts: shadowRoot.querySelector("#widget-conflicts"),

    savedDropdown: shadowRoot.querySelector("#schedule-saved-dropdown"),
    savedMenu: shadowRoot.querySelector("#schedule-saved-menu"),

    saveModal: shadowRoot.querySelector("#schedule-save-modal"),
    saveModalTitle: shadowRoot.querySelector("#schedule-modal-title"),
    saveModalMessage: shadowRoot.querySelector("#schedule-modal-message"),
    saveModalField: shadowRoot.querySelector("#schedule-modal-field"),
    saveModalInput: shadowRoot.querySelector("#schedule-modal-input"),
    saveModalCancel: shadowRoot.querySelector(".schedule-modal-cancel"),
    saveModalConfirm: shadowRoot.querySelector(".schedule-modal-confirm"),

    helpButton: shadowRoot.querySelector(".help"),
    settingsButton: shadowRoot.querySelector(".settings"),
  };

  debug.log({ id: "loadMainPanel.ui" }, "Loaded mainPanel UI refs", {
    hasMainPanel: !!ui.mainPanel,
    hasFloatingButton: !!ui.floatingButton,
    hasTable: !!ui.tableBody && !!ui.tableHead,
  });

  return ui;
}
