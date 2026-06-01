import { extApi } from "../common/browser-api.js";
import {
  decodeBase64ToBytes,
  decryptSessionBytes,
  encodeBytesToBase64,
  encryptSessionBytes
} from "../crypto/crypto.js";
import { FILE_EXTENSION } from "../session/schema.js";
import { decodePayload, encodePayload, createSessionPayload } from "../session/serializer.js";
import { openTabsInCurrentWindow, prepareImportPlan } from "../session/importer.js";

const getRuntimeInfo = () => ({
  browserAgent: navigator.userAgent,
  extensionVersion: extApi.runtime.getManifest().version
});

const getExportableCurrentWindowTabs = async () => {
  const allTabs = await extApi.tabs.query({ currentWindow: true });
  const filtered = allTabs
    .filter((tab) => typeof tab.url === "string")
    .map((tab, index) => ({
      url: tab.url,
      title: tab.title ?? "",
      pinned: Boolean(tab.pinned),
      index: typeof tab.index === "number" ? tab.index : index
    }));

  const payload = createSessionPayload({
    tabs: filtered,
    metadata: getRuntimeInfo()
  });

  return {
    payload,
    skippedCount: allTabs.length - payload.tabs.length
  };
};

const buildDefaultFilename = () => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");

  return `tab-session-${stamp}${FILE_EXTENSION}`;
};

const handleExport = async (message) => {
  const { payload, skippedCount } = await getExportableCurrentWindowTabs();
  if (payload.tabs.length === 0) {
    return {
      ok: false,
      code: "NO_EXPORTABLE_TABS",
      message: "No exportable tabs found in this window."
    };
  }

  const plainBytes = encodePayload(payload);
  const encryptedBytes = await encryptSessionBytes(plainBytes, message.password);

  return {
    ok: true,
    encryptedBase64: encodeBytesToBase64(encryptedBytes),
    filename: message.filename?.trim() || buildDefaultFilename(),
    tabCount: payload.tabs.length,
    skippedCount
  };
};

const handleImport = async (message) => {
  const encryptedBytes = decodeBase64ToBytes(message.encryptedBase64);
  const plainBytes = await decryptSessionBytes(encryptedBytes, message.password);
  const payload = decodePayload(plainBytes);

  const importPlan = prepareImportPlan({
    tabs: payload.tabs,
    confirmLargeImport: Boolean(message.confirmLargeImport)
  });

  if (importPlan.requiresConfirmation) {
    return {
      ok: false,
      code: "IMPORT_CONFIRMATION_REQUIRED",
      tabCount: importPlan.tabCount,
      message: `This file contains ${importPlan.tabCount} tabs. Confirm to continue import.`
    };
  }

  const currentWindow = await extApi.windows.getCurrent();
  const openedTabIds = await openTabsInCurrentWindow({
    extApi,
    tabs: importPlan.tabsToOpen,
    windowId: currentWindow.id
  });

  return {
    ok: true,
    openedCount: openedTabIds.length,
    duplicateCount: importPlan.duplicateCount,
    totalInFile: payload.tabs.length
  };
};

extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "EXPORT_SESSION") {
      const result = await handleExport(message);
      sendResponse(result);
      return;
    }

    if (message?.type === "IMPORT_SESSION") {
      const result = await handleImport(message);
      sendResponse(result);
      return;
    }

    if (message?.type === "CHECK_INCOGNITO_ACCESS") {
      const isAllowed = await extApi.extension.isAllowedIncognitoAccess();
      sendResponse({
        ok: true,
        isAllowed
      });
      return;
    }

    sendResponse({
      ok: false,
      code: "UNKNOWN_MESSAGE",
      message: "Unknown request."
    });
  })().catch((error) => {
    sendResponse({
      ok: false,
      code: "UNEXPECTED_FAILURE",
      message: error?.message ?? "Unknown error"
    });
  });

  return true;
});
