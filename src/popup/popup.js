const extApi = globalThis.browser ?? globalThis.chrome;

const state = {
  currentRoute: "home",
  unlocked: false,
  onlineReady: false
};

const els = {
  serverUrl: document.getElementById("serverUrl"),
  preferServerMode: document.getElementById("preferServerMode"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  checkHealthBtn: document.getElementById("checkHealthBtn"),
  setupLoginBtn: document.getElementById("setupLoginBtn"),
  lockBtn: document.getElementById("lockBtn"),
  password: document.getElementById("password"),
  useMasterForLocalImport: document.getElementById("useMasterForLocalImport"),
  localImportPassword: document.getElementById("localImportPassword"),
  filename: document.getElementById("filename"),
  exportTarget: document.getElementById("exportTarget"),
  importFile: document.getElementById("importFile"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  refreshSavesBtn: document.getElementById("refreshSavesBtn"),
  saveList: document.getElementById("saveList"),
  status: document.getElementById("status"),
  incognitoWarning: document.getElementById("incognitoWarning"),
  offlineBanner: document.getElementById("offlineBanner"),
  lockBadge: document.getElementById("lockBadge"),
  serverBadge: document.getElementById("serverBadge"),
  serverUrlError: document.getElementById("serverUrlError"),
  passwordError: document.getElementById("passwordError"),
  localImportPasswordError: document.getElementById("localImportPasswordError"),
  importFileError: document.getElementById("importFileError")
};

const routeButtons = Array.from(document.querySelectorAll(".tab-btn"));
const routeLinks = Array.from(document.querySelectorAll(".route-link"));
const pages = Array.from(document.querySelectorAll(".page"));

const setRoute = (route) => {
  state.currentRoute = route;
  for (const button of routeButtons) {
    const active = button.dataset.route === route;
    button.classList.toggle("active", active);
  }
  for (const page of pages) {
    const active = page.dataset.page === route;
    page.classList.toggle("active", active);
  }
};

const showStatus = (message, type = "success") => {
  els.status.textContent = message;
  els.status.className = `banner ${type}`;
};

const clearStatus = () => {
  els.status.textContent = "";
  els.status.className = "banner hidden";
};

const setFieldError = (el, message) => {
  if (!el) {
    return;
  }
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
};

const clearFieldErrors = () => {
  setFieldError(els.serverUrlError, "");
  setFieldError(els.passwordError, "");
  setFieldError(els.localImportPasswordError, "");
  setFieldError(els.importFileError, "");
};

const setButtonsBusy = (buttons, busy) => {
  for (const button of buttons) {
    if (button) {
      button.disabled = busy;
    }
  }
};

const withButtonBusy = async (buttons, task) => {
  setButtonsBusy(buttons, true);
  try {
    return await task();
  } finally {
    setButtonsBusy(buttons, false);
  }
};

const callBackground = (message) =>
  new Promise((resolve, reject) => {
    const maybePromise = extApi.runtime.sendMessage(message, (response) => {
      const lastError = extApi.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve).catch(reject);
    }
  });

const bytesFromBase64 = (base64String) => {
  const binary = atob(base64String);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const readFileAsBase64 = async (file) => {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const updateBadges = () => {
  if (state.unlocked) {
    els.lockBadge.textContent = "Unlocked";
    els.lockBadge.className = "badge success";
  } else {
    els.lockBadge.textContent = "Locked";
    els.lockBadge.className = "badge muted";
  }

  if (state.onlineReady) {
    els.serverBadge.textContent = "Server Online";
    els.serverBadge.className = "badge success";
  } else {
    els.serverBadge.textContent = "Server Offline";
    els.serverBadge.className = "badge warning";
  }
};

const updateOfflineBanner = (isOffline, reason) => {
  if (!isOffline) {
    state.onlineReady = true;
    els.offlineBanner.className = "banner warning hidden";
    els.offlineBanner.textContent = "";
    updateBadges();
    return;
  }
  state.onlineReady = false;
  els.offlineBanner.textContent = reason || "Server unreachable, switched to local-only mode.";
  els.offlineBanner.className = "banner warning";
  updateBadges();
};

const ensurePassword = () => {
  const password = els.password.value;
  if (!password || password.length < 8) {
    setFieldError(els.passwordError, "Password must be at least 8 characters.");
    throw new Error("Password must be at least 8 characters.");
  }
  setFieldError(els.passwordError, "");
  return password;
};

const getOptionalMasterPassword = () => {
  const raw = els.password.value?.trim() ?? "";
  if (!raw) {
    return undefined;
  }
  return ensurePassword();
};

const ensureLocalImportPassword = () => {
  const password = els.localImportPassword.value;
  if (!password || password.length < 8) {
    setFieldError(els.localImportPasswordError, "Local import password must be at least 8 characters.");
    throw new Error("Local import password must be at least 8 characters.");
  }
  setFieldError(els.localImportPasswordError, "");
  return password;
};

const getLocalImportPassword = () => {
  if (els.useMasterForLocalImport.checked) {
    return getOptionalMasterPassword();
  }
  return ensureLocalImportPassword();
};

const syncLocalImportPasswordState = () => {
  const usingMaster = els.useMasterForLocalImport.checked;
  els.localImportPassword.disabled = usingMaster;
  if (usingMaster) {
    els.localImportPassword.value = "";
    els.localImportPassword.placeholder = "Using master password";
    setFieldError(els.localImportPasswordError, "");
  } else {
    els.localImportPassword.placeholder = "";
  }
};

const downloadEncryptedFile = async ({ encryptedBase64, filename }) => {
  const bytes = bytesFromBase64(encryptedBase64);

  if (typeof window.showSaveFilePicker === "function") {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Encrypted Tab Session",
          accept: {
            "application/x-encrypted-tab-session": [".bsave"]
          }
        }
      ]
    });

    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return;
  }

  const blob = new Blob([bytes], { type: "application/x-encrypted-tab-session" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await extApi.downloads.download({
      url: blobUrl,
      filename,
      saveAs: true
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
};

const runSaveSettings = async () =>
  withButtonBusy([els.saveSettingsBtn, els.checkHealthBtn], async () => {
    clearStatus();
    clearFieldErrors();
    try {
      const trimmedServerUrl = String(els.serverUrl.value || "").trim();
      if (!trimmedServerUrl) {
        setFieldError(els.serverUrlError, "Server URL cannot be empty.");
        throw new Error("Server URL cannot be empty.");
      }
      setFieldError(els.serverUrlError, "");

      const setUrl = await callBackground({
        type: "SET_SERVER_URL",
        serverUrl: trimmedServerUrl
      });
      if (!setUrl?.ok) {
        throw new Error(setUrl?.message ?? "Failed to save server URL.");
      }
      const setMode = await callBackground({
        type: "SET_PREFER_SERVER_MODE",
        preferServerMode: Boolean(els.preferServerMode.checked)
      });
      if (!setMode?.ok) {
        throw new Error(setMode?.message ?? "Failed to save mode.");
      }
      showStatus("Settings saved.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  });

const runHealthCheck = async () =>
  withButtonBusy([els.checkHealthBtn, els.saveSettingsBtn], async () => {
    clearStatus();
    clearFieldErrors();
    try {
      const response = await callBackground({ type: "CHECK_SERVER_HEALTH" });
      if (!response?.ok) {
        updateOfflineBanner(true, response?.message);
        throw new Error(response?.message ?? "Server health check failed.");
      }
      updateOfflineBanner(false);
      showStatus("Server is reachable.", "success");
    } catch (error) {
      updateOfflineBanner(true, error.message);
      showStatus(error.message, "error");
    }
  });

const runSetupOrLogin = async () =>
  withButtonBusy([els.setupLoginBtn, els.lockBtn], async () => {
    clearStatus();
    clearFieldErrors();
    try {
      const password = ensurePassword();
      const response = await callBackground({
        type: "SETUP_OR_LOGIN",
        password,
        allowSetup: true
      });

      if (!response?.ok) {
        throw new Error(response?.message ?? "Setup/login failed.");
      }
      state.unlocked = true;
      updateOfflineBanner(false);
      updateBadges();
      showStatus("Unlocked and logged in.", "success");
    } catch (error) {
      updateOfflineBanner(true, error.message);
      showStatus(error.message, "error");
    }
  });

const runLock = async () =>
  withButtonBusy([els.lockBtn, els.setupLoginBtn], async () => {
    clearStatus();
    try {
      await callBackground({ type: "LOCK_ONLY" });
      state.unlocked = false;
      state.onlineReady = false;
      updateBadges();
      showStatus("Session locked.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  });

const runExport = async () =>
  withButtonBusy([els.exportBtn], async () => {
    clearStatus();
    clearFieldErrors();
    try {
      const password = els.password.value?.trim() ? ensurePassword() : undefined;
      const response = await callBackground({
        type: "EXPORT_SESSION",
        password,
        filename: els.filename.value,
        target: els.exportTarget.value
      });

      if (!response?.ok) {
        throw new Error(response?.message ?? "Export failed.");
      }

      if (response.storedToServer) {
        updateOfflineBanner(false);
        showStatus(`Saved to server as ${response.save.filename}.`, "success");
      } else {
        await downloadEncryptedFile(response);
        showStatus(
          `Exported ${response.tabCount} tabs.${response.skippedCount ? ` Skipped ${response.skippedCount}.` : ""}`,
          "success"
        );
      }
    } catch (error) {
      showStatus(error.message, "error");
    }
  });

const runImport = async (confirmLargeImport = false) =>
  withButtonBusy([els.importBtn], async () => {
    clearStatus();
    clearFieldErrors();
    try {
      const password = getLocalImportPassword();
      if (!password) {
        setFieldError(
          els.localImportPasswordError,
          "Enter master password once to unlock, or disable the toggle and provide local import password."
        );
        throw new Error("Provide a valid password for import.");
      }
      const file = els.importFile.files?.[0];
      if (!file) {
        setFieldError(els.importFileError, "Select a .bsave file to import.");
        throw new Error("Select a .bsave file to import.");
      }
      setFieldError(els.importFileError, "");

      const encryptedBase64 = await readFileAsBase64(file);
      const response = await callBackground({
        type: "IMPORT_SESSION",
        password,
        encryptedBase64,
        confirmLargeImport
      });

      if (!response?.ok) {
        if (response?.code === "IMPORT_CONFIRMATION_REQUIRED") {
          const shouldContinue = confirm(
            `This backup contains ${response.tabCount} tabs. Continue opening all tabs in current window?`
          );
          if (shouldContinue) {
            await runImport(true);
          }
          return;
        }
        throw new Error(response?.message ?? "Import failed.");
      }

      showStatus(
        `Imported ${response.openedCount}/${response.totalInFile} tabs.${response.duplicateCount ? ` Duplicates skipped: ${response.duplicateCount}.` : ""}`,
        "success"
      );
    } catch (error) {
      showStatus(error.message, "error");
    }
  });

const loadIncognitoState = async () => {
  try {
    const response = await callBackground({ type: "CHECK_INCOGNITO_ACCESS" });
    if (response?.ok && response.isAllowed === false) {
      els.incognitoWarning.textContent =
        "Private/incognito access is not enabled. Enable it in extension settings to include private windows.";
      els.incognitoWarning.className = "banner warning";
    } else {
      els.incognitoWarning.className = "banner warning hidden";
    }
  } catch {
    // Ignore capability check failure; extension still works for normal windows.
  }
};

const renderSaveList = (saves) => {
  els.saveList.innerHTML = "";
  if (!Array.isArray(saves) || saves.length === 0) {
    const item = document.createElement("li");
    item.innerHTML = '<p class="save-empty">No server backups yet.</p>';
    els.saveList.appendChild(item);
    return;
  }
  for (const save of saves) {
    const item = document.createElement("li");
    const sizeKb = Math.max(1, Math.round((save.sizeBytes || 0) / 1024));
    const createdAt = save.createdAt ? new Date(save.createdAt).toLocaleString() : "Unknown date";

    const head = document.createElement("div");
    head.className = "save-head";
    head.textContent = save.filename || "Unnamed backup";
    item.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "save-meta";
    meta.textContent = `${sizeKb} KB · ${createdAt}`;
    item.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "save-actions";

    const restore = document.createElement("button");
    restore.textContent = "Restore";
    restore.type = "button";
    restore.className = "btn primary";
    restore.addEventListener("click", async () => {
      await withButtonBusy([restore], async () => {
        try {
          const password = getOptionalMasterPassword();
          let response = await callBackground({
            type: "IMPORT_REMOTE_SAVE",
            id: save.id,
            password,
            confirmLargeImport: false
          });
          if (!response?.ok && response?.code === "IMPORT_CONFIRMATION_REQUIRED") {
            const shouldContinue = confirm(
              `This backup contains ${response.tabCount} tabs. Continue opening all tabs in current window?`
            );
            if (shouldContinue) {
              response = await callBackground({
                type: "IMPORT_REMOTE_SAVE",
                id: save.id,
                password,
                confirmLargeImport: true
              });
            }
          }
          if (!response?.ok) {
            throw new Error(response?.message ?? "Restore failed.");
          }
          showStatus(`Restored ${response.openedCount}/${response.totalInFile} tabs.`, "success");
        } catch (error) {
          showStatus(error.message, "error");
        }
      });
    });

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.type = "button";
    remove.className = "btn danger";
    remove.addEventListener("click", async () => {
      await withButtonBusy([remove], async () => {
        try {
          const shouldDelete = confirm(`Delete backup "${save.filename}" from server?`);
          if (!shouldDelete) {
            return;
          }
          const response = await callBackground({
            type: "DELETE_REMOTE_SAVE",
            id: save.id
          });
          if (!response?.ok) {
            throw new Error(response?.message ?? "Delete failed.");
          }
          await refreshServerSaves();
          showStatus("Backup deleted.", "success");
        } catch (error) {
          showStatus(error.message, "error");
        }
      });
    });

    actions.appendChild(restore);
    actions.appendChild(remove);
    item.appendChild(actions);
    els.saveList.appendChild(item);
  }
};

const refreshServerSaves = async () => {
  const response = await callBackground({ type: "LIST_REMOTE_SAVES" });
  if (!response?.ok) {
    updateOfflineBanner(true, response?.message);
    throw new Error(response?.message ?? "Could not load server saves.");
  }
  updateOfflineBanner(false);
  renderSaveList(response.saves);
};

const initState = async () => {
  const response = await callBackground({ type: "INIT_APP_STATE" });
  if (response?.ok) {
    els.serverUrl.value = response.settings.serverUrl ?? "http://localhost:8787";
    els.preferServerMode.checked = Boolean(response.settings.preferServerMode);
    state.unlocked = Boolean(response.session?.unlocked);
    state.onlineReady = Boolean(response.session?.onlineReady);
    updateBadges();
    if (response.session?.lastServerError) {
      updateOfflineBanner(true, response.session.lastServerError);
    }
  }
  try {
    await refreshServerSaves();
  } catch {
    // ignore until logged in or server up
  }
};

for (const button of routeButtons) {
  button.addEventListener("click", () => {
    clearStatus();
    setRoute(button.dataset.route);
  });
}

for (const button of routeLinks) {
  button.addEventListener("click", () => {
    setRoute(button.dataset.route);
  });
}

els.saveSettingsBtn.addEventListener("click", runSaveSettings);
els.checkHealthBtn.addEventListener("click", runHealthCheck);
els.setupLoginBtn.addEventListener("click", runSetupOrLogin);
els.lockBtn.addEventListener("click", runLock);
els.exportBtn.addEventListener("click", runExport);
els.importBtn.addEventListener("click", () => runImport(false));
els.refreshSavesBtn.addEventListener("click", async () => {
  await withButtonBusy([els.refreshSavesBtn], async () => {
    clearStatus();
    try {
      await refreshServerSaves();
      showStatus("Server backups refreshed.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  });
});
els.useMasterForLocalImport.addEventListener("change", syncLocalImportPasswordState);

setRoute("home");
loadIncognitoState();
initState();
syncLocalImportPasswordState();
