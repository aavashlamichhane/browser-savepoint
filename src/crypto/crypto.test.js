import test from "node:test";
import assert from "node:assert/strict";

import {
  decryptSessionBytes,
  decodeBase64ToBytes,
  encodeBytesToBase64,
  encryptSessionBytes
} from "./crypto.js";

test("encrypt/decrypt roundtrip returns original bytes", async () => {
  const source = new TextEncoder().encode(JSON.stringify({ sample: true, tabs: [1, 2, 3] }));
  const encrypted = await encryptSessionBytes(source, "correct-horse-battery-staple");
  const decrypted = await decryptSessionBytes(encrypted, "correct-horse-battery-staple");

  assert.deepEqual(Array.from(decrypted), Array.from(source));
});

test("decrypt fails on wrong password", async () => {
  const source = new TextEncoder().encode("secret");
  const encrypted = await encryptSessionBytes(source, "very-strong-password");

  await assert.rejects(
    () => decryptSessionBytes(encrypted, "wrong-password"),
    /Decryption failed/
  );
});

test("base64 helpers preserve raw bytes", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  const encoded = encodeBytesToBase64(bytes);
  const decoded = decodeBase64ToBytes(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(bytes));
});
