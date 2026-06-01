import fs from "node:fs/promises";
import path from "node:path";
import { newId } from "../utils/crypto.js";

export class SaveRepository {
  constructor(stateStore) {
    this.stateStore = stateStore;
  }

  listSaves() {
    return [...this.stateStore.state.saves].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findSave(id) {
    return this.stateStore.state.saves.find((save) => save.id === id) ?? null;
  }

  async createSave({ filename, encryptedBase64, ciphertextMeta = {} }) {
    const id = newId("sv");
    const createdAt = new Date().toISOString();
    const fileName = `${id}.bsave`;
    const filePath = path.join(this.stateStore.blobsDir, fileName);
    const bytes = Buffer.from(encryptedBase64, "base64");

    await fs.writeFile(filePath, bytes);

    const save = {
      id,
      filename,
      fileName,
      sizeBytes: bytes.length,
      createdAt,
      ciphertextMeta
    };

    this.stateStore.state.saves.push(save);
    await this.stateStore.persist();

    return save;
  }

  async getSaveBlobBase64(id) {
    const save = this.findSave(id);
    if (!save) {
      return null;
    }
    const filePath = path.join(this.stateStore.blobsDir, save.fileName);
    const bytes = await fs.readFile(filePath);
    return {
      save,
      encryptedBase64: bytes.toString("base64")
    };
  }

  async deleteSave(id) {
    const current = this.findSave(id);
    if (!current) {
      return false;
    }

    this.stateStore.state.saves = this.stateStore.state.saves.filter((save) => save.id !== id);
    await this.stateStore.persist();

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
}
