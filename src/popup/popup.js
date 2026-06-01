const extApi = globalThis.browser ?? globalThis.chrome;

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
  offlineBanner: document.getElementById("offlineBanner")
};

const setBusy = (busy) => {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = busy;
  }
};

const showStatus = (message, type = "success") => {
  els.status.textContent = message;
  els.status.className = `alert ${type}`;
};

const clearStatus = () => {
  els.status.textContent = "";
  els.status.className = "alert hidden";
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

const ensurePassword = () => {
  const password = els.password.value;
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
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
    throw new Error("Local import password must be at least 8 characters.");
  }
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

const updateOfflineBanner = (isOffline, reason) => {
  if (!isOffline) {
    els.offlineBanner.className = "alert warning hidden";
    els.offlineBanner.textContent = "";
    return;
  }
  els.offlineBanner.textContent = reason || "Server unreachable, switched to local-only mode.";
  els.offlineBanner.className = "alert warning";
};

const runSaveSettings = async () => {
  clearStatus();
  setBusy(true);
  try {
    const setUrl = await callBackground({
      type: "SET_SERVER_URL",
      serverUrl: els.serverUrl.value
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
  } finally {
    setBusy(false);
  }
};

const runHealthCheck = async () => {
  clearStatus();
  setBusy(true);
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
  } finally {
    setBusy(false);
  }
};

const runSetupOrLogin = async () => {
  clearStatus();
  setBusy(true);
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
    updateOfflineBanner(false);
    showStatus("Unlocked and logged in.", "success");
  } catch (error) {
    updateOfflineBanner(true, error.message);
    showStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
};

const runLock = async () => {
  clearStatus();
  setBusy(true);
  try {
    await callBackground({ type: "LOCK_ONLY" });
    showStatus("Session locked.", "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
};

const runExport = async () => {
  clearStatus();
  setBusy(true);
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
  } finally {
    setBusy(false);
  }
};

const runImport = async (confirmLargeImport = false) => {
  clearStatus();
  setBusy(true);
  try {
    const password = getLocalImportPassword();
    if (!password) {
      throw new Error("Enter master password once to unlock, or disable toggle and provide local import password.");
    }
    const file = els.importFile.files?.[0];
    if (!file) {
      throw new Error("Select a .bsave file to import.");
    }

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
  } finally {
    setBusy(false);
  }
};

const loadIncognitoState = async () => {
  try {
    const response = await callBackground({ type: "CHECK_INCOGNITO_ACCESS" });
    if (response?.ok && response.isAllowed === false) {
      els.incognitoWarning.textContent =
        "Private/incognito access is not enabled for this extension. Enable it in extension settings to use private windows.";
      els.incognitoWarning.className = "alert warning";
    } else {
      els.incognitoWarning.className = "alert warning hidden";
    }
  } catch {
    // Ignore capability check failure; extension still works for normal windows.
  }
};

const renderSaveList = (saves) => {
  els.saveList.innerHTML = "";
  if (!Array.isArray(saves) || saves.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No server backups yet.";
    els.saveList.appendChild(item);
    return;
  }
  for (const save of saves) {
    const item = document.createElement("li");
    const head = document.createElement("div");
    head.className = "save-head";
    head.textContent = `${save.filename} - ${Math.round((save.sizeBytes || 0) / 1024)} KB`;
    item.appendChild(head);

    const actions = document.createElement("div");
    actions.className = "save-actions";

    const restore = document.createElement("button");
    restore.textContent = "Restore";
    restore.type = "button";
    restore.addEventListener("click", async () => {
      try {
        setBusy(true);
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
      } finally {
        setBusy(false);
      }
    });

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.type = "button";
    remove.className = "muted";
    remove.addEventListener("click", async () => {
      try {
        setBusy(true);
        const response = await callBackground({
          type: "DELETE_REMOTE_SAVE",
          id: save.id
        });
        if (!response?.ok) {
          throw new Error(response?.message ?? "Delete failed.");
        }
        await refreshServerSaves();
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        setBusy(false);
      }
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

els.saveSettingsBtn.addEventListener("click", runSaveSettings);
els.checkHealthBtn.addEventListener("click", runHealthCheck);
els.setupLoginBtn.addEventListener("click", runSetupOrLogin);
els.lockBtn.addEventListener("click", runLock);
els.exportBtn.addEventListener("click", runExport);
els.importBtn.addEventListener("click", () => runImport(false));
els.refreshSavesBtn.addEventListener("click", async () => {
  clearStatus();
  setBusy(true);
  try {
    await refreshServerSaves();
    showStatus("Server backups refreshed.", "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});
els.useMasterForLocalImport.addEventListener("change", syncLocalImportPasswordState);

loadIncognitoState();
initState();
syncLocalImportPasswordState();
