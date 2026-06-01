import test from "node:test";
import assert from "node:assert/strict";

import { prepareImportPlan } from "./importer.js";

test("prepareImportPlan requires confirmation for large imports", () => {
  const tabs = Array.from({ length: 80 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: String(i),
    pinned: false,
    index: i
  }));

  const result = prepareImportPlan({ tabs, confirmLargeImport: false });
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.tabCount, 80);
});

test("prepareImportPlan deduplicates URLs while preserving order index sort", () => {
  const result = prepareImportPlan({
    tabs: [
      { url: "https://one.test", title: "1", pinned: false, index: 5 },
      { url: "https://one.test", title: "1dup", pinned: false, index: 6 },
      { url: "https://zero.test", title: "0", pinned: true, index: 1 }
    ],
    confirmLargeImport: true
  });

  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.tabsToOpen[0].url, "https://zero.test");
  assert.equal(result.tabsToOpen[1].url, "https://one.test");
});

test("prepareImportPlan rejects too many tabs", () => {
  const tabs = Array.from({ length: 201 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: String(i),
    pinned: false,
    index: i
  }));

  assert.throws(
    () => prepareImportPlan({ tabs, confirmLargeImport: true }),
    /max allowed is 200/
  );
});
