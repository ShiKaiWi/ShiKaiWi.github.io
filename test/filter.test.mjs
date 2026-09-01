import test from "node:test";
import assert from "node:assert/strict";
import { selectedTag, nextSelectedTag, articleVisible, applyFilter } from "../src/js/filter.js";

test("selectedTag parses the query string", () => {
  assert.equal(selectedTag(""), null);
  assert.equal(selectedTag("?"), null);
  assert.equal(selectedTag("?tag="), null);
  assert.equal(selectedTag("?tag=go"), "go");
  assert.equal(selectedTag("tag=go"), "go");
});

test("nextSelectedTag clears on all or a second click", () => {
  assert.equal(nextSelectedTag("all", "go"), null);
  assert.equal(nextSelectedTag("go", "go"), null);
  assert.equal(nextSelectedTag("go", null), "go");
  assert.equal(nextSelectedTag("os", "go"), "os");
});

test("articleVisible treats null as all", () => {
  assert.equal(articleVisible(["go"], null), true);
  assert.equal(articleVisible(["go"], "go"), true);
  assert.equal(articleVisible(["go"], "os"), false);
});

test("articleVisible matches any tag on a multi-tag post", () => {
  assert.equal(articleVisible(["web", "network"], "web"), true);
  assert.equal(articleVisible(["web", "network"], "network"), true);
  assert.equal(articleVisible(["web", "network"], "go"), false);
});

function node(attrs) {
  return {
    hidden: false,
    getAttribute: (k) => attrs[k],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    querySelectorAll(sel) {
      if (sel === ".entry") return attrs.entries;
      return [];
    },
  };
}

test("applyFilter hides months and shows the empty message", () => {
  const go = node({ "data-tags": "go" });
  const os = node({ "data-tags": "os" });
  const month = node({ entries: [go, os] });
  const empty = node({});
  const all = node({ "data-tag": "all" });
  const goLink = node({ "data-tag": "go" });
  const urls = [];
  applyFilter({
    search: "?tag=rust",
    articles: [go, os],
    months: [month],
    empty,
    tagLinks: [all, goLink],
    replaceState: (url) => urls.push(url),
  });
  assert.equal(go.hidden, true);
  assert.equal(os.hidden, true);
  assert.equal(month.hidden, true);
  assert.equal(empty.hidden, false);
  assert.equal(urls[0], "/?tag=rust");
});

test("applyFilter keeps matching entries and drops the query on all", () => {
  const go = node({ "data-tags": "go" });
  const month = node({ entries: [go] });
  const empty = { hidden: false };
  applyFilter({
    search: "",
    articles: [go],
    months: [month],
    empty,
    tagLinks: [node({ "data-tag": "all" })],
    replaceState: () => {},
  });
  assert.equal(go.hidden, false);
  assert.equal(month.hidden, false);
  assert.equal(empty.hidden, true);
});

test("applyFilter shows a multi-tag post for each of its tags", () => {
  const https = node({ "data-tags": "web network" });
  const go = node({ "data-tags": "go" });
  const month = node({ entries: [https, go] });
  const empty = node({});
  applyFilter({
    search: "?tag=network",
    articles: [https, go],
    months: [month],
    empty,
    tagLinks: [node({ "data-tag": "all" }), node({ "data-tag": "network" })],
    replaceState: () => {},
  });
  assert.equal(https.hidden, false);
  assert.equal(go.hidden, true);
  assert.equal(month.hidden, false);
  assert.equal(empty.hidden, true);
});
