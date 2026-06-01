const extApi = globalThis.browser ?? globalThis.chrome;

const els = {
  password: document.getElementById("password"),
  filename: document.getElementById("filename"),
  importFile: document.getElementById("importFile"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  status: document.getElementById("status"),
  incognitoWarning: document.getElementById("incognitoWarning")
};

const setBusy = (busy) => {
  els.exportBtn.disabled = busy;
  els.importBtn.disabled = busy;
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

const runExport = async () => {
  clearStatus();
  setBusy(true);
  try {
    const password = ensurePassword();
    const response = await callBackground({
      type: "EXPORT_SESSION",
      password,
      filename: els.filename.value
    });

    if (!response?.ok) {
      throw new Error(response?.message ?? "Export failed.");
    }

    await downloadEncryptedFile(response);
    showStatus(
      `Exported ${response.tabCount} tabs.${response.skippedCount ? ` Skipped ${response.skippedCount}.` : ""}`,
      "success"
    );
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
    const password = ensurePassword();
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

els.exportBtn.addEventListener("click", runExport);
els.importBtn.addEventListener("click", () => runImport(false));

loadIncognitoState();
