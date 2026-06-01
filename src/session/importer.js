import { LARGE_IMPORT_CONFIRMATION_THRESHOLD, MAX_IMPORT_TABS_DEFAULT } from "./schema.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dedupeTabs = (tabs) => {
  const seen = new Set();
  const unique = [];
  let duplicateCount = 0;

  for (const tab of tabs) {
    const key = tab.url;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push(tab);
  }

  return { unique, duplicateCount };
};

export const prepareImportPlan = ({
  tabs,
  maxTabs = MAX_IMPORT_TABS_DEFAULT,
  confirmLargeImport = false
}) => {
  if (tabs.length > maxTabs) {
    throw new Error(`Import rejected. File has ${tabs.length} tabs, max allowed is ${maxTabs}.`);
  }

  if (tabs.length > LARGE_IMPORT_CONFIRMATION_THRESHOLD && !confirmLargeImport) {
    return {
      requiresConfirmation: true,
      tabCount: tabs.length
    };
  }

  const { unique, duplicateCount } = dedupeTabs(tabs);
  unique.sort((a, b) => a.index - b.index);

  return {
    requiresConfirmation: false,
    tabsToOpen: unique,
    duplicateCount
  };
};

export const openTabsInCurrentWindow = async ({ extApi, tabs, windowId, batchSize = 10, delayMs = 120 }) => {
  const openedTabIds = [];
  for (let i = 0; i < tabs.length; i += 1) {
    const tab = tabs[i];

    try {
      const created = await extApi.tabs.create({
        windowId,
        url: tab.url,
        pinned: tab.pinned,
        active: false
      });
      openedTabIds.push(created.id);
    } catch {
      // Continue to attempt opening remaining tabs.
    }

    if ((i + 1) % batchSize === 0) {
      await sleep(delayMs);
    }
  }

  return openedTabIds;
};
