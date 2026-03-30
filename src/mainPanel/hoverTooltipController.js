import { on } from "../utilities/dom.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";
import { loadHoverTooltipSetting, persistHoverTooltipSetting } from "./hoverTooltipSettings.js";

const debug = debugFor("hoverTooltipController");
debugLog({ local: { hoverTooltipController: false } });

// Initializes hover tooltip settings UI. Input: ui object and view state. Output: controller object.
export async function initializeHoverTooltipController(ui, viewState) {
  debug.log({ id: "initializeHoverTooltipController.start" }, "Initializing hover tooltip controller");
  const applyHoverTipsSetting = async (enabled, { skipPersist = false } = {}) => {
    const normalized = enabled !== false;
    debug.log({ id: "initializeHoverTooltipController.apply" }, "Applying hover tooltip setting", {
      enabled: normalized,
      skipPersist,
    });
    viewState.hoverTipsEnabled = normalized;
    ui.mainPanel?.classList.toggle("is-hover-tooltips-off", !normalized);
    if (ui.hoverTipsToggle) ui.hoverTipsToggle.checked = normalized;
    if (!skipPersist) await persistHoverTooltipSetting(normalized);
  };

  const hoverTipsEnabled = await loadHoverTooltipSetting();
  debug.log({ id: "initializeHoverTooltipController.loaded" }, "Loaded hover tooltip setting", { hoverTipsEnabled });
  await applyHoverTipsSetting(hoverTipsEnabled, { skipPersist: true });

  if (ui.hoverTipsToggle) {
    on(ui.hoverTipsToggle, "change", async () => {
      debug.log({ id: "initializeHoverTooltipController.change" }, "Hover tooltip toggle changed", {
        checked: ui.hoverTipsToggle.checked,
      });
      await applyHoverTipsSetting(ui.hoverTipsToggle.checked);
    });
  }

  return { applyHoverTipsSetting };
}
