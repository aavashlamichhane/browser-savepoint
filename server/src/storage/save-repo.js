import fs from "node:fs/promises";
import path from "node:path";
import { newId } from "../utils/crypto.js";

const FILE_MIME = "application/x-encrypted-tab-session";

export class SaveRepository {
  constructor(stateStore, options = {}) {
    this.stateStore = stateStore;
    this.r2Adapter = options.r2Adapter ?? null;
    this.maxUploadBytes = Number(options.maxUploadBytes ?? 20 * 1024 * 1024);
  }

  normalizeSave(save) {
    return {
      ...save,
      backend: save.backend ?? "disk"
    };
  }

  listLocalSaves() {
    return [...this.stateStore.state.saves].map((save) => this.normalizeSave(save));
  }

  findLocalSave(id) {
    return this.listLocalSaves().find((save) => save.id === id) ?? null;
  }

  ensureR2Configured() {
    if (!this.r2Adapter?.isConfigured?.()) {
      const error = new Error("Cloudflare R2 backend is not configured.");
      error.code = "R2_NOT_CONFIGURED";
      throw error;
    }
  }

  assertUploadSize(sizeBytes) {
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > this.maxUploadBytes) {
      const error = new Error("Invalid encrypted payload size.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
  }

  buildDiskSaveRecord({ id, filename, fileName, sizeBytes, createdAt, ciphertextMeta = {} }) {
    return {
      id,
      filename,
      fileName,
      backend: "disk",
      sizeBytes,
      createdAt,
      ciphertextMeta
    };
  }

  buildR2SaveRecord({ id, filename, objectKey, sizeBytes, contentType, createdAt, ciphertextMeta = {} }) {
    return {
      id,
      filename,
      backend: "r2",
      objectKey,
      sizeBytes,
      contentType: contentType || FILE_MIME,
      createdAt,
      ciphertextMeta
    };
  }

  buildR2Manifest(save) {
    return {
      schemaVersion: 1,
      id: save.id,
      backend: "r2",
      filename: save.filename,
      objectKey: save.objectKey,
      sizeBytes: save.sizeBytes,
      contentType: save.contentType || FILE_MIME,
      createdAt: save.createdAt,
      ciphertextMeta: save.ciphertextMeta ?? {}
    };
  }

  parseR2Manifest(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    if (raw.backend !== "r2" || typeof raw.id !== "string" || typeof raw.objectKey !== "string") {
      return null;
    }
    return this.buildR2SaveRecord({
      id: raw.id,
      filename: raw.filename,
      objectKey: raw.objectKey,
      sizeBytes: Number(raw.sizeBytes ?? 0),
      contentType: raw.contentType || FILE_MIME,
      createdAt: raw.createdAt || new Date(0).toISOString(),
      ciphertextMeta: raw.ciphertextMeta ?? {}
    });
  }

  async listR2Saves() {
    this.ensureR2Configured();
    const manifestKeys = await this.r2Adapter.listManifestKeys("saves/");
    const manifests = await Promise.all(manifestKeys.map((key) => this.r2Adapter.getJsonObject(key)));
    return manifests.map((manifest) => this.parseR2Manifest(manifest)).filter(Boolean);
  }

  async listSaves() {
    const local = this.listLocalSaves();
    if (!this.r2Adapter?.isConfigured?.()) {
      return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    const remoteR2Saves = await this.listR2Saves();
    const merged = new Map();
    for (const save of local) {
      merged.set(save.id, save);
    }
    for (const save of remoteR2Saves) {
      merged.set(save.id, save);
    }
    return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getR2SaveById(id) {
    if (!this.r2Adapter?.isConfigured?.()) {
      return null;
    }
    const manifestKey = this.r2Adapter.buildManifestKey(id);
    const manifest = await this.r2Adapter.getJsonObject(manifestKey);
    const parsed = this.parseR2Manifest(manifest);
    if (parsed) {
      return parsed;
    }
    const legacy = this.findLocalSave(id);
    if (legacy?.backend === "r2" && typeof legacy.objectKey === "string") {
      return legacy;
    }
    return null;
  }

  async createSave({ filename, encryptedBase64, ciphertextMeta = {} }) {
    const id = newId("sv");
    const createdAt = new Date().toISOString();
    const fileName = `${id}.bsave`;
    const filePath = path.join(this.stateStore.blobsDir, fileName);
    const bytes = Buffer.from(encryptedBase64, "base64");
    this.assertUploadSize(bytes.length);

    await fs.writeFile(filePath, bytes);

    const save = this.buildDiskSaveRecord({
      id,
      filename,
      fileName,
      sizeBytes: bytes.length,
      createdAt,
      ciphertextMeta
    });

    this.stateStore.state.saves.push(save);
    await this.stateStore.persist();

    return save;
  }

  async createR2SaveAndGetUploadDescriptor({
    filename,
    sizeBytes,
    ciphertextMeta = {},
    contentType = FILE_MIME
  }) {
    this.ensureR2Configured();
    this.assertUploadSize(sizeBytes);

    const id = newId("sv");
    const createdAt = new Date().toISOString();
    const objectKey = this.r2Adapter.buildObjectKey(id, filename);
    const manifestKey = this.r2Adapter.buildManifestKey(id);
    const save = this.buildR2SaveRecord({
      id,
      filename,
      objectKey,
      sizeBytes,
      contentType,
      createdAt,
      ciphertextMeta
    });
    await this.r2Adapter.putJsonObject(manifestKey, this.buildR2Manifest(save));

    let upload = null;
    try {
      upload = await this.r2Adapter.getUploadDescriptor({
        objectKey,
        contentType
      });
    } catch (error) {
      await this.r2Adapter.deleteObjects([manifestKey]).catch(() => {});
      throw error;
    }

    return { save, upload };
  }

  async getSaveBlobBase64(id) {
    const save = this.findLocalSave(id);
    if (!save) {
      const maybeR2 = await this.getR2SaveById(id);
      if (maybeR2) {
        const error = new Error("Save is not stored on disk.");
        error.code = "UNSUPPORTED_BACKEND";
        throw error;
      }
      return null;
    }
    if ((save.backend ?? "disk") !== "disk") {
      const error = new Error("Save is not stored on disk.");
      error.code = "UNSUPPORTED_BACKEND";
      throw error;
    }
    const filePath = path.join(this.stateStore.blobsDir, save.fileName);
    const bytes = await fs.readFile(filePath);
    return {
      save,
      encryptedBase64: bytes.toString("base64")
    };
  }

  async getSaveDownloadDescriptor(id) {
    const local = this.findLocalSave(id);
    if (local && (local.backend ?? "disk") === "disk") {
      const error = new Error("Save is not stored in R2.");
      error.code = "UNSUPPORTED_BACKEND";
      throw error;
    }
    const save = await this.getR2SaveById(id);
    if (!save) {
      return null;
    }
    this.ensureR2Configured();
    const download = await this.r2Adapter.getDownloadDescriptor({
      objectKey: save.objectKey
    });
    return {
      save: {
        ...save,
        backend: "r2"
      },
      download
    };
  }

  async deleteSave(id) {
    const current = this.findLocalSave(id);
    if (current) {
      this.stateStore.state.saves = this.stateStore.state.saves.filter((save) => save.id !== id);
      await this.stateStore.persist();
    }

    const backend = current?.backend;
    if (backend === "disk") {
      const filePath = path.join(this.stateStore.blobsDir, current.fileName);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
      return true;
    }

    const remoteSave = await this.getR2SaveById(id);
    if (!current && !remoteSave) {
      return false;
    }
    if (remoteSave) {
      this.ensureR2Configured();
      const manifestKey = this.r2Adapter.buildManifestKey(id);
      const keys = [manifestKey, remoteSave.objectKey];
      if (current?.objectKey) {
        keys.push(current.objectKey);
      }
      await this.r2Adapter.deleteObjects(keys);
      return true;
    }
    return Boolean(current);
  }
}
