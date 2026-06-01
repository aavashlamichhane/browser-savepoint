import test from "node:test";
import assert from "node:assert/strict";
import { R2Adapter } from "./adapter.js";

test("R2Adapter reports configuration availability", () => {
  const missing = new R2Adapter();
  assert.equal(missing.isConfigured(), false);

  const configured = new R2Adapter({
    accountId: "acc",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "bucket"
  });
  assert.equal(configured.isConfigured(), true);
});

test("R2Adapter builds stable object key", () => {
  const adapter = new R2Adapter({
    accountId: "acc",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "bucket"
  });
  const key = adapter.buildObjectKey("sv_123", "tabs backup?.bsave");
  assert.equal(key, "saves/sv_123/tabs_backup_.bsave");
});
