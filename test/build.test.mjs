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

test("mutex article page renders title, date, tag, and body", () => {
  const result = spawnSync("npx", ["eleventy"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync("_site/posts/mutex-impl/index.html", "utf8");
  assert.match(html, /Mutex Implementation/);
  assert.match(html, /2018-10-24/);
  assert.match(html, /href="\/\?tag=os"/);
  assert.match(html, /all posts/);
  assert.match(html, /mutex/);
});

const SLUGS = [
  "mutex-impl",
  "bloom-filter",
  "tcp-time-wait-state",
  "golang-syncmap",
  "go-to-https",
  "weak-isolation-level-of-database-transaction",
  "stream-reading",
  "golang-json-encoding",
  "es5-inheritance",
];

test("all nine posts build and resource images are local", () => {
  const result = spawnSync("npx", ["eleventy"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const slug of SLUGS) {
    const html = readFileSync(`_site/posts/${slug}/index.html`, "utf8");
    assert.doesNotMatch(html, /github\.com\/ShiKaiWi\/ShiKaiWi\.github\.io\/blob\/master\/resources/);
  }
  const syncmap = readFileSync("_site/posts/golang-syncmap/index.html", "utf8");
  assert.match(syncmap, /src="\/resources\/go-syncmap\/read_dirty_map\.svg"/);
  assert.equal(existsSync("_site/resources/go-syncmap/read_dirty_map.svg"), true);
  assert.equal(existsSync("_site/resources/Bloom-Filter/false-positive-error-rate.png"), true);
  assert.equal(existsSync("_site/resources/tcp-time-wait-state/tcp-state-diagram.png"), true);
  assert.equal(
    existsSync("_site/resources/isolation-level-of-database-transaction/write_skew.svg"),
    true
  );
});

test("homepage lists posts by month and exposes tags", () => {
  const result = spawnSync("npx", ["eleventy"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync("_site/index.html", "utf8");
  assert.match(html, /October 2018/);
  assert.match(html, /September 2018/);
  assert.match(html, /August 2018/);
  assert.match(html, /data-tag="all"/);
  assert.match(html, /data-tag="database"/);
  assert.match(html, /data-tag="go"/);
  assert.match(html, /data-tag="network"/);
  assert.match(html, /data-tag="os"/);
  assert.match(html, /data-tag="web"/);
  assert.match(html, /Mutex Implementation/);
  assert.match(html, /ES5 Inheritance/);
  assert.match(html, /没有这个 tag 的文章/);
  const oct = html.indexOf("October 2018");
  const mutex = html.indexOf("Mutex Implementation");
  const bloom = html.indexOf("Bloom Filter");
  const sep = html.indexOf("September 2018");
  assert.ok(oct < mutex && mutex < bloom && bloom < sep);
});
