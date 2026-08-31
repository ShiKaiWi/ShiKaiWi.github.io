import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

function build() {
  return spawnSync("npx", ["eleventy"], { encoding: "utf8" });
}

test("homepage build prints the site name on paper", () => {
  const result = build();
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync("_site/index.html", "utf8");
  assert.match(html, /Wei Xikai/);
  assert.match(html, /notes on systems and code/);
  assert.match(html, /\/css\/style\.css/);
  const css = readFileSync("_site/css/style.css", "utf8");
  assert.match(css, /#f7f3eb/);
  assert.equal(existsSync("_site/css/style.css"), true);
});

test("homepage footer lists the four friends", () => {
  const result = build();
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync("_site/index.html", "utf8");
  assert.match(html, /tao93\.top/);
  assert.match(html, /zxshamson\.github\.io/);
  assert.match(html, /ja1r0\.github\.io/);
  assert.match(html, /sadhen\.com/);
});
