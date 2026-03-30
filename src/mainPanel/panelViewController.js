import { on } from "../utilities/dom.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";

const MAIN_PANEL_VIEWS = new Set(["course-list-panel", "schedule-panel"]);
const debug = debugFor("panelViewController");
debugLog({ local: { panelViewController: false } });

// Creates the panel view controller. Input: ui object and view state. Output: controller object.
export function createPanelViewController(ui, viewState) {
  debug.log({ id: "createPanelViewController.start" }, "Initializing panel view controller");
  const setActiveView = (viewKey) => {
    debug.log({ id: "createPanelViewController.setActiveView" }, "Setting active view", {
      viewKey,
      previousView: viewState.panel,
    });
    if (MAIN_PANEL_VIEWS.has(viewKey)) {
      viewState.lastMainPanel = viewKey;
    }

    viewState.panel = viewKey;

    ui.views.forEach((el) => el.classList.toggle("is-active", el.dataset.panel === viewKey));
    ui.viewTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.panel === viewKey));

    ui.mainPanel.classList.toggle("is-schedule-view", viewKey === "schedule-panel");
    ui.mainPanel.classList.toggle("is-settings-view", viewKey === "settings-panel");
    ui.mainPanel.classList.toggle("is-help-view", viewKey === "help-panel");
  };

  const syncFloatingButtonState = () => {
    const isCollapsed = ui.mainPanel.classList.contains("is-hidden");
    debug.log({ id: "createPanelViewController.syncFloatingButtonState" }, "Syncing floating button state", {
      isCollapsed,
    });
    ui.floatingButton.classList.toggle("is-collapsed", isCollapsed);
  };

  const toggleMainPanel = () => {
    debug.log({ id: "createPanelViewController.toggleMainPanel" }, "Toggling main panel");
    ui.mainPanel.classList.toggle("is-hidden");
    syncFloatingButtonState();
  };

  syncFloatingButtonState();

  if (ui.floatingButton) {
    on(ui.floatingButton, "click", toggleMainPanel);
  }

  return {
    setActiveView,
    syncFloatingButtonState,
    toggleMainPanel,
  };
}
