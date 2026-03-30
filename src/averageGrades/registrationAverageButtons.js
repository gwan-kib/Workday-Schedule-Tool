import { debugFor, debugLog } from "../utilities/debugTool.js";
import {
  fetchSectionGradesWithFallback,
  parseCourseInfoFromPromptText,
  readTermCampus,
} from "./gradesApiCall.js";

const registrationCardSelector = 'li[data-automation-id="compositeContainer"]';
const averageButtonSelector = "div.WHPF.WFPF, div.WHMF.WFMF";
const compositeSubHeaderSelector = '[data-automation-id="compositeSubHeaderOne"]';
const debug = debugFor("registrationAverageButtons");
debugLog({ local: { registrationAverageButtons: true } });

const extractAverage = (data) => {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const average = extractAverage(item);
      if (average != null) return average;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const direct =
    data.average ?? data.avg ?? data.average_grade ?? data.averagePercent ?? data.avgPercent ?? data.mean ?? null;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested = data?.grades?.average ?? data?.grades?.avg ?? data?.summary?.average ?? data?.summary?.avg ?? null;
  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  return null;
};

const buildAverageLabel = (average) => {
  if (average == null) return "Average:\nN/A";
  if (typeof average === "number") return `Average:\n${average.toFixed(1)}%`;
  return `Average:\n${average}%`;
};

const hasValidAverage = (data) => extractAverage(data) != null;
const lectureLike = (text) => /\blecture\b/i.test(String(text || ""));
const labLike = (text) => /\b(laboratory)\b/i.test(String(text || ""));
const seminarLike = (text) => /\bseminar\b/i.test(String(text || ""));
const discussionLike = (text) => /\bdiscussion\b/i.test(String(text || ""));
const isLectureFormat = (text) => lectureLike(text) && !labLike(text) && !seminarLike(text) && !discussionLike(text);
const summarizeDebugText = (text, maxLength = 160) => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};
const getRegistrationContainer = (headerWrapper) =>
  headerWrapper?.closest?.(registrationCardSelector) || headerWrapper || null;
const getStaticButtonLabel = (reason) => (reason === "not-lecture" ? "Not a lecture" : "Average:\nunavailable");

// Sets up registration average buttons on Workday pages. Input: none. Output: cleanup function.
export function setupRegistrationAverageButtons() {
  debug.log({ id: "setupRegistrationAverageButtons.start" }, "Initializing registration average buttons");
  let termCampus = readTermCampus();

  const getRegistrationAverageButtonState = (headerWrapper) => {
    const row = getRegistrationContainer(headerWrapper);
    const rowPreview = summarizeDebugText(row?.innerText || headerWrapper?.innerText || "");
    if (!row) {
      debug.log(
        { id: "setupRegistrationAverageButtons.resolveRow.noRow" },
        "Could not find a registration row while resolving average-button mode",
      );
      return {
        buttonMode: "static",
        staticReason: "not-lecture",
        isLecture: false,
        rowPreview,
        source: "missing-row",
        instructionalFormat: "",
      };
    }

    const compositeInstructionalFormat =
      row.querySelector?.(compositeSubHeaderSelector)?.getAttribute?.("title") ||
      row.querySelector?.(compositeSubHeaderSelector)?.textContent ||
      "";
    if (compositeInstructionalFormat) {
      const isLecture = isLectureFormat(compositeInstructionalFormat);
      debug.log(
        { id: "setupRegistrationAverageButtons.resolveRow.composite" },
        "Resolved row average-button mode from composite subheader",
        {
          instructionalFormat: summarizeDebugText(compositeInstructionalFormat),
          isLecture,
          buttonMode: isLecture ? "interactive" : "static",
          rowPreview,
        },
      );
      return {
        buttonMode: isLecture ? "interactive" : "static",
        staticReason: isLecture ? null : "not-lecture",
        isLecture,
        rowPreview,
        source: "composite-subheader",
        instructionalFormat: summarizeDebugText(compositeInstructionalFormat),
      };
    }

    const fallbackInstructionalText = row.innerText || headerWrapper.innerText || "";
    const isLecture = isLectureFormat(fallbackInstructionalText);
    debug.log({ id: "setupRegistrationAverageButtons.resolveRow.fallback" }, "Resolved row average-button mode from fallback text", {
      instructionalFormat: summarizeDebugText(fallbackInstructionalText),
      isLecture,
      buttonMode: isLecture ? "interactive" : "static",
      rowPreview,
    });
    return {
      buttonMode: isLecture ? "interactive" : "static",
      staticReason: isLecture ? null : "not-lecture",
      isLecture,
      rowPreview,
      source: "fallback-text",
      instructionalFormat: summarizeDebugText(fallbackInstructionalText),
    };
  };

  const createAverageButton = ({ courseInfo = null, mode = "interactive", staticReason = null } = {}) => {
    debug.log({ id: "setupRegistrationAverageButtons.createButton" }, "Creating registration average button", {
      courseInfo,
      mode,
      staticReason,
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration__avg-button";
    if (mode === "static") {
      button.classList.add("registration__avg-button--static");
      button.textContent = getStaticButtonLabel(staticReason);
      button.disabled = true;
      button.tabIndex = -1;
      return button;
    }

    button.textContent = "Class Average\n(past 5 years)";

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.loading === "true") return;
      button.dataset.loading = "true";
      button.textContent = "loading...";
      button.disabled = true;
      debug.log({ id: "setupRegistrationAverageButtons.fetch.start" }, "Fetching average data", { courseInfo });

      termCampus = readTermCampus() || termCampus;
      if (!termCampus) {
        debug.warn({ id: "setupRegistrationAverageButtons.fetch.noTermCampus" }, "Could not determine term campus");
        button.textContent = "Average:\nunavailable";
        button.disabled = false;
        button.dataset.loading = "false";
        return;
      }

      try {
        const data = await fetchSectionGradesWithFallback(
          {
            campus: termCampus.campus,
            yearsession: termCampus.yearsession,
            subject: courseInfo.subject,
            course: courseInfo.course,
            section: courseInfo.section,
          },
          { isValid: hasValidAverage },
        );

        if (!data) {
          debug.warn({ id: "setupRegistrationAverageButtons.fetch.noData" }, "No average data returned", { courseInfo });
          button.textContent = "Average:\nunavailable";
        } else {
          const average = extractAverage(data);
          debug.log({ id: "setupRegistrationAverageButtons.fetch.success" }, "Average data loaded", {
            courseInfo,
            average,
          });
          button.textContent = buildAverageLabel(average);
        }
      } catch (error) {
        debug.error({ id: "setupRegistrationAverageButtons.fetch.error" }, "Failed to load average data", {
          courseInfo,
          error: String(error),
        });
        button.textContent = "Average:\nunavailable";
      } finally {
        button.disabled = false;
        button.dataset.loading = "false";
      }
    });

    return button;
  };

  const ensureAverageButton = (headerWrapper) => {
    if (!headerWrapper || !(headerWrapper instanceof Element)) return;
    const row = getRegistrationContainer(headerWrapper);
    const rowPreview = summarizeDebugText(row?.innerText || headerWrapper.innerText || "");
    const alreadyHasButton = headerWrapper.previousElementSibling?.classList?.contains("registration__avg-button") || false;
    debug.log(
      { id: "setupRegistrationAverageButtons.ensureButton.rowState" },
      "Evaluating row button state",
      {
        alreadyHasButton,
        rowPreview,
      },
    );
    if (alreadyHasButton) {
      debug.log(
        { id: "setupRegistrationAverageButtons.ensureButton.skipExisting" },
        "Skipped row because an average button is already present",
        {
          rowPreview,
        },
      );
      return;
    }

    const buttonState = getRegistrationAverageButtonState(headerWrapper);
    debug.log(
      { id: "setupRegistrationAverageButtons.ensureButton.decision" },
      "Finished row average-button mode check",
      {
        buttonMode: buttonState.buttonMode,
        staticReason: buttonState.staticReason,
        instructionalFormat: buttonState.instructionalFormat,
        instructionalFormatSource: buttonState.source,
        rowPreview: buttonState.rowPreview || rowPreview,
      },
    );

    const parentElement = headerWrapper.parentElement;
    if (parentElement) {
      parentElement.style.display = "flex";
      parentElement.style.alignItems = "center";
    }

    if (buttonState.buttonMode === "static") {
      const button = createAverageButton({
        mode: "static",
        staticReason: buttonState.staticReason,
      });
      headerWrapper.parentNode?.insertBefore(button, headerWrapper);
      debug.log({ id: "setupRegistrationAverageButtons.ensureButton.inserted" }, "Inserted static registration average button", {
        staticReason: buttonState.staticReason,
        rowPreview: buttonState.rowPreview || rowPreview,
      });
      return;
    }

    const promptOption = headerWrapper.querySelector?.('[data-automation-id="promptOption"]') || headerWrapper;
    const promptText =
      promptOption.getAttribute?.("data-automation-label") ||
      promptOption.getAttribute?.("title") ||
      promptOption.getAttribute?.("aria-label") ||
      promptOption.textContent ||
      "";

    const courseInfo = parseCourseInfoFromPromptText(promptText);
    if (!courseInfo) {
      const fallbackButton = createAverageButton({
        mode: "static",
        staticReason: "unavailable",
      });
      headerWrapper.parentNode?.insertBefore(fallbackButton, headerWrapper);
      debug.warn(
        { id: "setupRegistrationAverageButtons.ensureButton.noCourseInfo" },
        "Could not parse course info for lecture row; inserted unavailable average button",
        {
          rowPreview: buttonState.rowPreview || rowPreview,
        },
      );
      return;
    }

    const button = createAverageButton({ courseInfo, mode: "interactive" });
    headerWrapper.parentNode?.insertBefore(button, headerWrapper);
    debug.log({ id: "setupRegistrationAverageButtons.ensureButton.inserted" }, "Inserted interactive registration average button", {
      courseInfo,
      rowPreview: buttonState.rowPreview || rowPreview,
    });
  };

  const handleAverageButtonNodes = (node) => {
    if (!(node instanceof Element)) return;
    
    if (node.matches?.(averageButtonSelector)) {
      ensureAverageButton(node);
    }
    node.querySelectorAll?.(averageButtonSelector).forEach((el) => ensureAverageButton(el));
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) return;
      mutation.addedNodes.forEach((node) => handleAverageButtonNodes(node));
    });
  });

  handleAverageButtonNodes(document.body);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    debug.log({ id: "setupRegistrationAverageButtons.cleanup" }, "Disconnecting average button observer");
    observer.disconnect();
  };
}
