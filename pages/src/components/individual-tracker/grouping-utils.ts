import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

function createEntryIndexMap(entries: readonly TrackerMatchHistoryEntry[]): Map<string, number> {
  const entryIndexMap = new Map<string, number>();
  for (const [index, entry] of entries.entries()) {
    entryIndexMap.set(entry.matchId, index);
  }
  return entryIndexMap;
}

function orderMatchIdsByEntryIndex(matchIds: readonly string[], entryIndexMap: Map<string, number>): string[] {
  return [...matchIds].sort((leftId, rightId) => {
    const left = entryIndexMap.get(leftId) ?? Number.MAX_SAFE_INTEGER;
    const right = entryIndexMap.get(rightId) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

function sortGroupsByTimeline(
  groups: readonly (readonly string[])[],
  entryIndexMap: Map<string, number>,
): readonly (readonly string[])[] {
  return [...groups].sort((leftGroup, rightGroup) => {
    const leftMin = Math.min(...leftGroup.map((matchId) => entryIndexMap.get(matchId) ?? Number.MAX_SAFE_INTEGER));
    const rightMin = Math.min(...rightGroup.map((matchId) => entryIndexMap.get(matchId) ?? Number.MAX_SAFE_INTEGER));
    return leftMin - rightMin;
  });
}

export function applyBreakFromGroup(
  groupings: readonly (readonly string[])[],
  entries: readonly TrackerMatchHistoryEntry[],
  matchId: string,
): readonly (readonly string[])[] {
  const entryIndexMap = createEntryIndexMap(entries);

  const nextGroupings: (readonly string[])[] = [];

  for (const group of groupings) {
    if (!group.includes(matchId)) {
      nextGroupings.push(group);
      continue;
    }

    const ordered = orderMatchIdsByEntryIndex(group, entryIndexMap);
    const breakIndex = ordered.indexOf(matchId);

    const before = ordered.slice(0, breakIndex);
    const after = ordered.slice(breakIndex + 1);

    if (before.length >= 2) {
      nextGroupings.push(before);
    }
    if (after.length >= 2) {
      nextGroupings.push(after);
    }
  }

  return nextGroupings;
}

export function applyAddToAdjacentGroup(
  groupings: readonly (readonly string[])[],
  entries: readonly TrackerMatchHistoryEntry[],
  matchId: string,
  direction: "above" | "below",
): readonly (readonly string[])[] {
  const entryIndexMap = createEntryIndexMap(entries);
  const entryIndex = entries.findIndex((e) => e.matchId === matchId);
  if (entryIndex === -1) {
    return groupings;
  }

  const adjacentIndex = direction === "above" ? entryIndex - 1 : entryIndex + 1;
  if (adjacentIndex < 0 || adjacentIndex >= entries.length) {
    return groupings;
  }

  const adjacentMatchId = entries[adjacentIndex].matchId;
  const sourceGroupIndex = groupings.findIndex((group) => group.includes(matchId));
  const targetGroupIndex = groupings.findIndex((group) => group.includes(adjacentMatchId));

  if (sourceGroupIndex !== -1 && sourceGroupIndex === targetGroupIndex) {
    return groupings;
  }

  const sourceGroup =
    sourceGroupIndex !== -1 ? orderMatchIdsByEntryIndex(groupings[sourceGroupIndex], entryIndexMap) : [matchId];
  const targetGroup =
    targetGroupIndex !== -1 ? orderMatchIdsByEntryIndex(groupings[targetGroupIndex], entryIndexMap) : [adjacentMatchId];

  const mergedGroup = direction === "above" ? [...targetGroup, ...sourceGroup] : [...sourceGroup, ...targetGroup];

  const nextGroups = groupings.filter((_, index) => index !== sourceGroupIndex && index !== targetGroupIndex);
  nextGroups.push(mergedGroup);

  return sortGroupsByTimeline(nextGroups, entryIndexMap);
}
