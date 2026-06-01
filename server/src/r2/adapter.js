/**
 * Phase-2 contract for Cloudflare R2.
 * Upload/download must keep ciphertext-only semantics.
 */
export class R2Adapter {
  constructor(options = {}) {
    this.options = options;
  }

  async getUploadDescriptor(_saveMeta) {
    throw new Error("R2 adapter not implemented yet.");
  }

  async getDownloadDescriptor(_saveMeta) {
    throw new Error("R2 adapter not implemented yet.");
  }
}
