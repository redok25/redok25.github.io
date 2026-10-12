// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stamp, hashText } from "../tools/stamp.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("hash ignores CRLF vs LF (autocrlf checkouts must not change stamps)", () => {
  assert.equal(hashText("a\r\nb\r\n"), hashText("a\nb\n"));
  assert.notEqual(hashText("a\nb\n"), hashText("a\nc\n"));
});

test("index.html carries current content hashes (run: node tools/stamp.mjs)", () => {
  assert.equal(stamp(html), html);
});

test("every module and stylesheet URL in index.html is versioned", () => {
  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]);
  for (const [from, to] of Object.entries(map.imports)) {
    assert.match(to, new RegExp(`^${from.replace(/[.]/g, "\\.")}\\?v=[0-9a-f]{8}$`));
  }
  const unversioned = html.match(/(?:src|href)="(?:js|css)\/[^"?]+"/g);
  assert.equal(unversioned, null, `unversioned: ${unversioned}`);
});
