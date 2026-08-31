import test from "node:test";
import assert from "node:assert/strict";
import {
  missingFrontmatterFields,
  uniqueTags,
  monthKey,
  monthLabel,
  groupByMonth,
  frontmatterHasRequiredFields,
} from "../src/lib/posts.js";

test("missingFrontmatterFields reports title, date, and tags", () => {
  assert.deepEqual(missingFrontmatterFields({}), ["title", "date", "tags"]);
  assert.deepEqual(missingFrontmatterFields({ title: "A", date: "2018-10-24", tags: ["os"] }), []);
  assert.deepEqual(missingFrontmatterFields({ title: "A", date: "2018-10-24", tags: [] }), ["tags"]);
});

test("uniqueTags sorts and drops the reserved posts tag", () => {
  const posts = [
    { data: { tags: ["go", "posts"] } },
    { data: { tags: ["database", "go"] } },
  ];
  assert.deepEqual(uniqueTags(posts), ["database", "go"]);
});

test("monthKey and monthLabel use UTC", () => {
  const d = new Date("2018-10-24T00:00:00.000Z");
  assert.equal(monthKey(d), "2018-10");
  assert.equal(monthLabel(d), "October 2018");
});

test("groupByMonth keeps newest-first groups", () => {
  const oct = { date: new Date("2018-10-24T00:00:00.000Z"), data: { title: "Mutex" } };
  const oct2 = { date: new Date("2018-10-06T00:00:00.000Z"), data: { title: "Bloom" } };
  const sep = { date: new Date("2018-09-23T00:00:00.000Z"), data: { title: "TCP" } };
  const groups = groupByMonth([oct, oct2, sep]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "2018-10");
  assert.equal(groups[0].label, "October 2018");
  assert.deepEqual(groups[0].posts.map((p) => p.data.title), ["Mutex", "Bloom"]);
  assert.equal(groups[1].key, "2018-09");
});

test("frontmatterHasRequiredFields reads the YAML fence", () => {
  const raw = `---\ntitle: Hello\ndate: 2018-10-24\ntags:\n  - os\n---\nbody\n`;
  assert.deepEqual(frontmatterHasRequiredFields(raw), []);
  assert.deepEqual(frontmatterHasRequiredFields(`---\ntitle: Hello\n---\n`), ["date", "tags"]);
});
