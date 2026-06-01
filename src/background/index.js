import { extApi } from "../common/browser-api.js";
import { createAuthSetupMaterial, createLoginVerifier } from "../auth/master-auth.js";
import {
  decodeBase64ToBytes,
  decryptSessionBytes,
  encodeBytesToBase64,
  encryptSessionBytes
} from "../crypto/crypto.js";
import { FILE_EXTENSION } from "../session/schema.js";
import { decodePayload, encodePayload, createSessionPayload } from "../session/serializer.js";
import { openTabsInCurrentWindow, prepareImportPlan } from "../session/importer.js";
import { ServerApiAdapter } from "../storage/adapters.js";

const SETTINGS_KEY = "appSettings";
const DEFAULT_SERVER_URL = "http://localhost:8787";

const session = {
  unlockedMasterPassword: null,
  accessToken: null,
  refreshToken: null,
  onlineReady: false,
  lastServerError: null
};

let settings = {
  serverUrl: DEFAULT_SERVER_URL,
  preferServerMode: true
};

const loadSettings = async () => {
  const payload = await extApi.storage.localGet(SETTINGS_KEY);
  settings = {
    ...settings,
    ...(payload?.[SETTINGS_KEY] ?? {})
  };
};

const saveSettings = async () => {
  await extApi.storage.localSet({
    [SETTINGS_KEY]: settings
  });
};

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

const buildTimestamp = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
};

const buildExportFilename = (rawName) => {
  const timestamp = buildTimestamp();
  const base = (rawName ?? "").trim().replace(/\.bsave$/i, "");
  const safeBase = base || "tab-session";
  return `${safeBase}-${timestamp}${FILE_EXTENSION}`;
};

const getServerAdapter = () => new ServerApiAdapter({ serverUrl: settings.serverUrl });

const getAuthedServerAdapter = () =>
  new ServerApiAdapter({
    serverUrl: settings.serverUrl,
    accessToken: session.accessToken
  });

const markServerOffline = (error) => {
  session.onlineReady = false;
  session.lastServerError = error?.message ?? "Server unavailable";
};

const withServerAuth = async (fn) => {
  try {
    return await fn(getAuthedServerAdapter());
  } catch (error) {
    if (error?.code === "SESSION_EXPIRED" && session.refreshToken) {
      const refreshed = await getServerAdapter().refresh(session.refreshToken);
      session.accessToken = refreshed.accessToken;
      return fn(getAuthedServerAdapter());
    }
    throw error;
  }
};

const createEncryptedExport = async (message) => {
  const { payload, skippedCount } = await getExportableCurrentWindowTabs();
  if (payload.tabs.length === 0) {
    return {
      ok: false,
      code: "NO_EXPORTABLE_TABS",
      message: "No exportable tabs found in this window."
    };
  }

  const plainBytes = encodePayload(payload);
  const activePassword = message.password || session.unlockedMasterPassword;
  if (!activePassword || activePassword.length < 8) {
    return {
      ok: false,
      code: "SESSION_LOCKED",
      message: "Unlock with master password first."
    };
  }

  const encryptedBytes = await encryptSessionBytes(plainBytes, activePassword);

  return {
    ok: true,
    encryptedBase64: encodeBytesToBase64(encryptedBytes),
    filename: buildExportFilename(message.filename),
    tabCount: payload.tabs.length,
    skippedCount
  };
};

const handleExport = async (message) => {
  const exportPayload = await createEncryptedExport(message);
  if (!exportPayload.ok) {
    return exportPayload;
  }

  if (message.target === "server" && settings.preferServerMode) {
    if (!session.accessToken || !session.onlineReady) {
      return {
        ok: false,
        code: "SERVER_UNAVAILABLE",
        message: "Server mode is not ready. Login first or use local export."
      };
    }
    try {
      const save = await withServerAuth((adapter) =>
        adapter.uploadEncryptedFile({
          name: exportPayload.filename,
          encryptedBase64: exportPayload.encryptedBase64,
          ciphertextMeta: {
            tabCount: exportPayload.tabCount
          }
        })
      );
      return {
        ok: true,
        storedToServer: true,
        save
      };
    } catch (error) {
      markServerOffline(error);
      return {
        ok: false,
        code: "SERVER_UNAVAILABLE",
        message: "Could not store to server. Switch to local fallback or reconnect."
      };
    }
  }

  return exportPayload;
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

const handleServerSetupAndLogin = async (message) => {
  const password = message.password;
  if (!password || password.length < 8) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Master password must be at least 8 characters."
    };
  }

  try {
    const adapter = getServerAdapter();
    const authConfig = await adapter.getAuthConfig();

    if (!authConfig.configured) {
      if (!message.allowSetup) {
        return {
          ok: false,
          code: "NOT_CONFIGURED",
          message: "Server account is not configured. Use setup first."
        };
      }

      const setup = await createAuthSetupMaterial({ password });
      await adapter.setupAuth({
        ...setup,
        trustedRecoveryEnabled: Boolean(message.trustedRecoveryEnabled)
      });
    }

    const latestConfig = await adapter.getAuthConfig();
    const loginVerifier = await createLoginVerifier({
      password,
      authSaltB64: latestConfig.authSaltB64,
      authIterations: latestConfig.authIterations
    });
    const login = await adapter.login(loginVerifier);

    session.unlockedMasterPassword = password;
    session.accessToken = login.accessToken;
    session.refreshToken = login.refreshToken;
    session.onlineReady = true;
    session.lastServerError = null;

    return {
      ok: true,
      trustedRecoveryEnabled: latestConfig.trustedRecoveryEnabled
    };
  } catch (error) {
    markServerOffline(error);
    return {
      ok: false,
      code: "AUTH_FAILED",
      message: error?.message ?? "Unable to login to server."
    };
  }
};

const handleRemoteList = async () => {
  if (!session.accessToken) {
    return {
      ok: false,
      code: "SESSION_LOCKED",
      message: "Login first to browse server saves."
    };
  }

  try {
    const saves = await withServerAuth((adapter) => adapter.listEncryptedFiles());
    session.onlineReady = true;
    return {
      ok: true,
      saves
    };
  } catch (error) {
    markServerOffline(error);
    return {
      ok: false,
      code: "SERVER_UNAVAILABLE",
      message: "Could not fetch saves from server."
    };
  }
};

const handleImportRemoteSave = async (message) => {
  if (!session.accessToken) {
    return {
      ok: false,
      code: "SESSION_LOCKED",
      message: "Login first to restore from server."
    };
  }

  const activePassword = message.password || session.unlockedMasterPassword;
  if (!activePassword || activePassword.length < 8) {
    return {
      ok: false,
      code: "SESSION_LOCKED",
      message: "Unlock with master password first."
    };
  }

  try {
    const fetched = await withServerAuth((adapter) => adapter.downloadEncryptedFile({ id: message.id }));
    return handleImport({
      encryptedBase64: fetched.encryptedBase64,
      password: activePassword,
      confirmLargeImport: message.confirmLargeImport
    });
  } catch (error) {
    markServerOffline(error);
    return {
      ok: false,
      code: "SERVER_UNAVAILABLE",
      message: "Could not restore from server."
    };
  }
};

const handleDeleteRemoteSave = async (message) => {
  if (!session.accessToken) {
    return {
      ok: false,
      code: "SESSION_LOCKED",
      message: "Login first to delete server saves."
    };
  }
  try {
    await withServerAuth((adapter) => adapter.deleteEncryptedFile({ id: message.id }));
    return { ok: true };
  } catch (error) {
    markServerOffline(error);
    return {
      ok: false,
      code: "SERVER_UNAVAILABLE",
      message: "Could not delete save on server."
    };
  }
};

const handleHealthCheck = async () => {
  try {
    const health = await getServerAdapter().health();
    session.onlineReady = true;
    session.lastServerError = null;
    return {
      ok: true,
      health
    };
  } catch (error) {
    markServerOffline(error);
    return {
      ok: false,
      code: "SERVER_UNAVAILABLE",
      message: error?.message ?? "Server unavailable"
    };
  }
};

const lockSession = () => {
  session.unlockedMasterPassword = null;
  session.accessToken = null;
  session.refreshToken = null;
  session.onlineReady = false;
};

extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "INIT_APP_STATE") {
      await loadSettings();
      sendResponse({
        ok: true,
        settings,
        session: {
          unlocked: Boolean(session.unlockedMasterPassword),
          onlineReady: session.onlineReady,
          lastServerError: session.lastServerError
        }
      });
      return;
    }

    if (message?.type === "SET_SERVER_URL") {
      settings.serverUrl = String(message.serverUrl || "").trim() || DEFAULT_SERVER_URL;
      await saveSettings();
      sendResponse({ ok: true, settings });
      return;
    }

    if (message?.type === "SET_PREFER_SERVER_MODE") {
      settings.preferServerMode = Boolean(message.preferServerMode);
      await saveSettings();
      sendResponse({ ok: true, settings });
      return;
    }

    if (message?.type === "SETUP_OR_LOGIN") {
      const result = await handleServerSetupAndLogin(message);
      sendResponse(result);
      return;
    }

    if (message?.type === "LOGOUT_AND_LOCK") {
      if (session.refreshToken) {
        try {
          await getServerAdapter().logout(session.refreshToken);
        } catch {
          // Ignore logout failures in lock path.
        }
      }
      lockSession();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "LOCK_ONLY") {
      lockSession();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "CHECK_SERVER_HEALTH") {
      const result = await handleHealthCheck();
      sendResponse(result);
      return;
    }

    if (message?.type === "LIST_REMOTE_SAVES") {
      const result = await handleRemoteList();
      sendResponse(result);
      return;
    }

    if (message?.type === "IMPORT_REMOTE_SAVE") {
      const result = await handleImportRemoteSave(message);
      sendResponse(result);
      return;
    }

    if (message?.type === "DELETE_REMOTE_SAVE") {
      const result = await handleDeleteRemoteSave(message);
      sendResponse(result);
      return;
    }

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
