/**
 * Cloud storage adapters are intentionally deferred to v2.
 * This interface keeps local encryption separate from upload mechanics.
 */
export class StorageAdapter {
  /**
   * @param {{ name: string, bytes: Uint8Array, mimeType: string }} payload
   * @returns {Promise<{ id: string, location: string }>}
   */
  async uploadEncryptedFile(_payload) {
    throw new Error("Not implemented");
  }

  /**
   * @param {{ id: string }} reference
   * @returns {Promise<Uint8Array>}
   */
  async downloadEncryptedFile(_reference) {
    throw new Error("Not implemented");
  }
}

export class LocalDownloadAdapter extends StorageAdapter {
  constructor(downloadFn) {
    super();
    this.downloadFn = downloadFn;
  }

  async uploadEncryptedFile(payload) {
    const id = await this.downloadFn(payload);
    return {
      id: String(id ?? "local-download"),
      location: "local-downloads"
    };
  }
}

const ensureJson = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const message = data?.message ?? `Request failed with ${response.status}`;
    const code = data?.code ?? "SERVER_ERROR";
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  return data;
};

const decodeBase64ToBytes = (base64String) => {
  const binary = atob(base64String);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
};

const encodeBytesToBase64 = (bytes) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

export class ServerApiAdapter extends StorageAdapter {
  constructor({ serverUrl, accessToken }) {
    super();
    this.serverUrl = (serverUrl ?? "").replace(/\/$/, "");
    this.accessToken = accessToken;
  }

  withSession(accessToken) {
    return new ServerApiAdapter({
      serverUrl: this.serverUrl,
      accessToken
    });
  }

  authHeaders() {
    if (!this.accessToken) {
      throw new Error("No access token for server adapter.");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`
    };
  }

  async health() {
    const response = await fetch(`${this.serverUrl}/api/v1/health`);
    return ensureJson(response);
  }

  async getAuthConfig() {
    const response = await fetch(`${this.serverUrl}/api/v1/auth/config`);
    return ensureJson(response);
  }

  async setupAuth(payload) {
    const response = await fetch(`${this.serverUrl}/api/v1/auth/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return ensureJson(response);
  }

  async login(authVerifierB64) {
    const response = await fetch(`${this.serverUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ authVerifierB64 })
    });
    return ensureJson(response);
  }

  async refresh(refreshToken) {
    const response = await fetch(`${this.serverUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refreshToken })
    });
    return ensureJson(response);
  }

  async logout(refreshToken) {
    const response = await fetch(`${this.serverUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refreshToken })
    });
    return ensureJson(response);
  }

  async uploadEncryptedFile(payload) {
    const response = await fetch(`${this.serverUrl}/api/v1/saves`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        filename: payload.name,
        encryptedBase64: payload.encryptedBase64,
        ciphertextMeta: payload.ciphertextMeta ?? {}
      })
    });
    const data = await ensureJson(response);
    return data.save;
  }

  async listEncryptedFiles() {
    const response = await fetch(`${this.serverUrl}/api/v1/saves`, {
      headers: this.authHeaders()
    });
    const data = await ensureJson(response);
    return data.saves;
  }

  async downloadEncryptedFile(reference) {
    const response = await fetch(`${this.serverUrl}/api/v1/saves/${encodeURIComponent(reference.id)}`, {
      headers: this.authHeaders()
    });
    const data = await ensureJson(response);
    return data;
  }

  async deleteEncryptedFile(reference) {
    const response = await fetch(`${this.serverUrl}/api/v1/saves/${encodeURIComponent(reference.id)}`, {
      method: "DELETE",
      headers: this.authHeaders()
    });
    return ensureJson(response);
  }
}

export class CloudflareR2Adapter extends ServerApiAdapter {
  async uploadEncryptedFile(payload) {
    const encryptedBytes = decodeBase64ToBytes(payload.encryptedBase64);
    const descriptorResponse = await fetch(`${this.serverUrl}/api/v1/saves/presign-upload`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        filename: payload.name,
        sizeBytes: encryptedBytes.length,
        contentType: payload.mimeType ?? "application/x-encrypted-tab-session",
        ciphertextMeta: payload.ciphertextMeta ?? {}
      })
    });
    const descriptorData = await ensureJson(descriptorResponse);

    try {
      const uploadResponse = await fetch(descriptorData.upload.url, {
        method: descriptorData.upload.method || "PUT",
        headers: descriptorData.upload.headers ?? {},
        body: encryptedBytes
      });
      if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed with ${uploadResponse.status}`);
      }
      return descriptorData.save;
    } catch (error) {
      await this.deleteEncryptedFile({ id: descriptorData?.save?.id }).catch(() => {});
      throw error;
    }
  }

  async downloadEncryptedFile(reference) {
    if ((reference.backend ?? "disk") !== "r2") {
      return super.downloadEncryptedFile(reference);
    }

    const descriptorResponse = await fetch(
      `${this.serverUrl}/api/v1/saves/${encodeURIComponent(reference.id)}/presign-download`,
      {
        method: "POST",
        headers: this.authHeaders()
      }
    );
    const descriptorData = await ensureJson(descriptorResponse);
    const downloadResponse = await fetch(descriptorData.download.url, {
      method: descriptorData.download.method || "GET",
      headers: descriptorData.download.headers ?? {}
    });
    if (!downloadResponse.ok) {
      throw new Error(`R2 download failed with ${downloadResponse.status}`);
    }
    const bytes = new Uint8Array(await downloadResponse.arrayBuffer());
    return {
      save: descriptorData.save,
      encryptedBase64: encodeBytesToBase64(bytes)
    };
  }
}

export class GoogleDriveAdapter extends StorageAdapter {
  async uploadEncryptedFile(_payload) {
    throw new Error("Google Drive adapter is planned for phase 3.");
  }
}
