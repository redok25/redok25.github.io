// ===================================
// STAMP.MJS - Cache-busting without a build step.
// Content-hashes every js/*.js and css/**/*.css file and writes the URLs into index.html:
// an import map for module imports, and ?v=<hash> on entry scripts and stylesheets.
// A cached old index.html keeps pointing at old URLs, a new one at new URLs, so a
// visitor never mixes versions. Run after editing js/ or css/:  node tools/stamp.mjs
// Check only (CI/tests):  node tools/stamp.mjs --check
// ===================================
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Hash text with LF endings: git autocrlf may flip CRLF/LF on checkout without a content change.
export const hashText = (text) =>
  createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 8);
const hash = (rel) => hashText(readFileSync(path.join(root, rel), "utf8"));

export function stamp(html) {
  if (!html.includes('<script type="importmap">')) throw new Error("index.html has no importmap block");
  const modules = readdirSync(path.join(root, "js")).filter((f) => f.endsWith(".js")).sort();
  const imports = Object.fromEntries(
    modules.map((f) => [`./js/${f}`, `./js/${f}?v=${hash(`js/${f}`)}`])
  );
  // Keep index.html's own line endings (CRLF on an autocrlf checkout) so a stamped file is stable.
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.stringify({ imports }, null, 2).replace(/\n/g, nl);
  const importMap = `<script type="importmap">${nl}${json}${nl}    </script>`;
  return html
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, importMap)
    .replace(
      /((?:src|href)=")((?:js|css)\/[\w./-]+?\.(?:js|css))(?:\?v=[0-9a-f]+)?"/g,
      (_, attr, rel) => `${attr}${rel}?v=${hash(rel)}"`
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(root, "index.html");
  const html = readFileSync(file, "utf8");
  const next = stamp(html);
  if (process.argv.includes("--check")) {
    if (next !== html) {
      console.error("index.html is stale: run node tools/stamp.mjs");
      process.exit(1);
    }
  } else if (next !== html) {
    writeFileSync(file, next);
    console.log("index.html stamped");
  } else {
    console.log("index.html already current");
  }
}
