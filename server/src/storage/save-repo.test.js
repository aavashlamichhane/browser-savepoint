import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { SaveRepository } from "./save-repo.js";
import { StateStore } from "./state-store.js";

const makeTempStore = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "savepoint-repo-"));
  const store = new StateStore(dir);
  await store.init();
  return { dir, store };
};

const cleanupTempStore = async (dir) => {
  await fs.rm(dir, { recursive: true, force: true });
};

test("SaveRepository creates, reads, and deletes disk save", async () => {
  const { dir, store } = await makeTempStore();
  try {
    const repo = new SaveRepository(store);
    const body = Buffer.from("ciphertext").toString("base64");

    const created = await repo.createSave({
      filename: "tabs.bsave",
      encryptedBase64: body,
      ciphertextMeta: { tabCount: 2 }
    });

    assert.equal(created.backend, "disk");
    assert.equal(created.filename, "tabs.bsave");

    const listed = await repo.listSaves();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].backend, "disk");

    const fetched = await repo.getSaveBlobBase64(created.id);
    assert.equal(fetched.encryptedBase64, body);

    const deleted = await repo.deleteSave(created.id);
    assert.equal(deleted, true);
    assert.equal((await repo.listSaves()).length, 0);
  } finally {
    await cleanupTempStore(dir);
  }
});

test("SaveRepository supports R2 metadata and descriptors", async () => {
  const { dir, store } = await makeTempStore();
  const deletedKeys = [];
  const objects = new Map();
  const fakeR2 = {
    isConfigured: () => true,
    buildObjectKey: (id, filename) => `saves/${id}/${filename}`,
    buildManifestKey: (id) => `saves/${id}/meta.json`,
    getUploadDescriptor: async ({ objectKey }) => ({
      method: "PUT",
      url: `https://example.com/upload/${encodeURIComponent(objectKey)}`,
      headers: { "Content-Type": "application/x-encrypted-tab-session" },
      expiresAt: new Date().toISOString(),
      objectKey
    }),
    getDownloadDescriptor: async ({ objectKey }) => ({
      method: "GET",
      url: `https://example.com/download/${encodeURIComponent(objectKey)}`,
      headers: {},
      expiresAt: new Date().toISOString(),
      objectKey
    }),
    putJsonObject: async (key, value) => {
      objects.set(key, value);
    },
    getJsonObject: async (key) => objects.get(key) ?? null,
    listManifestKeys: async () => [...objects.keys()].filter((key) => key.endsWith("/meta.json")),
    deleteObjects: async (keys) => {
      for (const key of keys) {
        objects.delete(key);
        deletedKeys.push(key);
      }
    }
  };

  try {
    const repo = new SaveRepository(store, { r2Adapter: fakeR2 });

    const { save, upload } = await repo.createR2SaveAndGetUploadDescriptor({
      filename: "cloud.bsave",
      sizeBytes: 512,
      ciphertextMeta: { tabCount: 5 }
    });

    assert.equal(save.backend, "r2");
    assert.equal(upload.method, "PUT");
    assert.equal(upload.objectKey, save.objectKey);
    const listed = await repo.listSaves();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, save.id);
    assert.equal(listed[0].backend, "r2");

    const descriptor = await repo.getSaveDownloadDescriptor(save.id);
    assert.equal(descriptor.save.id, save.id);
    assert.equal(descriptor.download.method, "GET");

    const deleted = await repo.deleteSave(save.id);
    assert.equal(deleted, true);
    assert.equal(deletedKeys.includes(save.objectKey), true);
    assert.equal(deletedKeys.includes(fakeR2.buildManifestKey(save.id)), true);
  } finally {
    await cleanupTempStore(dir);
  }
});
