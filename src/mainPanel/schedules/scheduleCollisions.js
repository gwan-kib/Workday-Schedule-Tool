import { debugFor, debugLog } from "../../utilities/debugTool.js";

const debug = debugFor("scheduleCollisions");
debugLog({ local: { scheduleCollisions: false } });

function formatConflictLabel(event) {
  const code = event?.code || event?.title || "";
  const label = event?.label || "";
  return [code, label].filter(Boolean).join(" ");
}

// Detects overlapping schedule events by day. Input: eventsByDay map. Output: conflict blocks + codes.
export function detectScheduleConflicts(eventsByDay) {
  const conflictBlocks = [];
  const conflictCodes = new Set();
  const blockMap = new Map();

  if (!eventsByDay || typeof eventsByDay.forEach !== "function") {
    return { conflictBlocks, conflictCodes: [] };
  }

  eventsByDay.forEach((events, day) => {
    if (!Array.isArray(events) || events.length < 2) return;

    const sorted = [...events].sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);

    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];

        if (b.startIdx >= a.endIdx) break;

        const overlapStart = Math.max(a.startIdx, b.startIdx);
        const overlapEnd = Math.min(a.endIdx, b.endIdx);
        if (overlapEnd <= overlapStart) continue;

        const key = `${day}|${overlapStart}|${overlapEnd}`;
        let block = blockMap.get(key);
        if (!block) {
          block = {
            day,
            rowStart: overlapStart,
            rowSpan: overlapEnd - overlapStart,
            startIdx: overlapStart,
            endIdx: overlapEnd,
            baseCodes: new Set(),
            codes: new Set(),
          };
          blockMap.set(key, block);
          conflictBlocks.push(block);
        }

        const codeA = a.code || a.title || "";
        const codeB = b.code || b.title || "";
        const labelA = formatConflictLabel(a);
        const labelB = formatConflictLabel(b);

        if (codeA) {
          block.baseCodes.add(codeA);
          block.codes.add(labelA || codeA);
          conflictCodes.add(codeA);
        }
        if (codeB) {
          block.baseCodes.add(codeB);
          block.codes.add(labelB || codeB);
          conflictCodes.add(codeB);
        }
      }
    }
  });

  const codes = Array.from(conflictCodes).sort((a, b) => a.localeCompare(b));
  conflictBlocks.forEach((block) => {
    block.baseCodes = Array.from(block.baseCodes || []).sort((a, b) => a.localeCompare(b));
    block.codes = Array.from(block.codes || []).sort((a, b) => a.localeCompare(b));
  });

  debug.log({ id: "detectScheduleConflicts" }, "Detected conflicts", { codes, blocks: conflictBlocks });

  return { conflictBlocks, conflictCodes: codes };
}
