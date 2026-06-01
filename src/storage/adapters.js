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

/**
 * Placeholder for v2:
 * - GoogleDriveAdapter will encapsulate OAuth and Drive API calls.
 * - CloudflareR2Adapter will use a backend-issued presigned URL flow.
 */
export const cloudAdapters = {
  GoogleDriveAdapter: null,
  CloudflareR2Adapter: null
};
