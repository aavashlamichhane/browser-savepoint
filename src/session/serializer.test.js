import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionPayload,
  decodePayload,
  encodePayload,
  validateSessionPayload
} from "./serializer.js";

test("createSessionPayload filters unsupported URLs", () => {
  const payload = createSessionPayload({
    tabs: [
      { url: "https://example.com", title: "ok", pinned: false, index: 0 },
      { url: "chrome://settings", title: "skip", pinned: false, index: 1 }
    ],
    metadata: { test: true }
  });

  assert.equal(payload.tabs.length, 1);
  assert.equal(payload.tabs[0].url, "https://example.com");
});

test("encode/decode payload roundtrip", () => {
  const payload = createSessionPayload({
    tabs: [{ url: "https://example.com", title: "ok", pinned: true, index: 0 }],
    metadata: { source: "test" }
  });

  const bytes = encodePayload(payload);
  const decoded = decodePayload(bytes);
  assert.equal(decoded.tabs.length, 1);
  assert.equal(decoded.metadata.source, "test");
});

test("validateSessionPayload rejects malformed payload", () => {
  assert.throws(
    () => validateSessionPayload({ schemaVersion: 999, tabs: [] }),
    /Unsupported schema version/
  );
});
