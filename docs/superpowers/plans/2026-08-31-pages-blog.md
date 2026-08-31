# Pages Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a paper-styled Eleventy blog at https://shikaiwi.github.io with a tag-filtered chronological homepage and rendered article pages.

**Architecture:** Eleventy reads `src/` and passthrough-copies `resources/` into `_site/`. Homepage and post HTML are generated at build time. Tag filtering is a small ES module that toggles DOM nodes and the `?tag=` query string. GitHub Actions builds and deploys `_site/` to GitHub Pages.

**Tech Stack:** Node 22, `@11ty/eleventy` ^3, `@11ty/eleventy-plugin-syntaxhighlight` ^5, Node built-in `node:test` (no extra test runner), Nunjucks templates, vanilla JS.

**Spec:** `docs/superpowers/specs/2026-08-31-pages-blog-design.md`

## Global Constraints

- Site name is exactly `Wei Xikai`; subtitle is exactly `notes on systems and code`.
- Tags are lowercase English: `go`, `database`, `network`, `os`, `web`. No `/tags/<name>/` pages.
- Paper style only: background `#f7f3eb`, serif titles, underline for the selected tag, no dark theme, no pill buttons, no card shadows.
- User-site URLs live at the domain root: `/`, `/posts/<slug>/`, `/css/`, `/js/`, `/resources/`.
- Posts must have YAML `title`, `date`, and non-empty `tags`, or the build throws.
- Empty-tag copy is exactly `没有这个 tag 的文章`.
- Do not add search, RSS, pagination, comments, Hugo, or a third-party test framework.
- Do not rewrite article prose except frontmatter and `blob/master/resources` URL rewrites.

## File map

| File | Responsibility |
|---|---|
| `package.json` | scripts `start` / `build` / `test`; ESM; 11ty deps |
| `eleventy.config.js` | input `src`, output `_site`, passthrough, collections, filters, highlight plugin, frontmatter guard |
| `src/lib/posts.js` | `missingFrontmatterFields`, `uniqueTags`, `monthKey`, `monthLabel`, `groupByMonth` |
| `src/lib/friends.js` | `shouldShowFriends` |
| `src/js/filter.js` | `selectedTag`, `nextSelectedTag`, `articleVisible`, `applyFilter`, bootstrapping |
| `src/_data/site.json` | name + subtitle |
| `src/_data/friends.json` | friend `{name,url}` list |
| `src/_includes/layout.njk` | HTML shell, paper CSS link, friends footer |
| `src/_includes/post.njk` | article chrome wrapping `content` |
| `src/index.njk` | tag row + month-grouped timeline |
| `src/css/style.css` | paper visual |
| `src/posts/<slug>.md` | nine migrated articles |
| `test/posts.test.mjs` | helpers + frontmatter guard |
| `test/friends.test.mjs` | friends visibility |
| `test/filter.test.mjs` | query-string / visibility logic |
| `test/build.test.mjs` | built HTML assertions |
| `.github/workflows/pages.yml` | CI build + Pages deploy |
| `README.md` | points at the live site; Pages source note |

---

### Task 1: Post helpers and an Eleventy paper homepage that builds

**Files:**
- Create: `src/lib/posts.js`
- Create: `test/posts.test.mjs`
- Create: `package.json`
- Create: `eleventy.config.js`
- Create: `src/_data/site.json`
- Create: `src/_includes/layout.njk`
- Create: `src/index.njk`
- Create: `src/css/style.css`
- Create: `test/build.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `missingFrontmatterFields(data) -> string[]` where `data` is `{ title?, date?, tags? }`
  - `uniqueTags(posts) -> string[]` where each post is `{ data: { tags: string[] } }`; sorted A–Z; ignores the 11ty reserved name `"posts"`
  - `monthKey(date) -> string` as `YYYY-MM` in UTC
  - `monthLabel(date) -> string` as `October 2018` using `en-US` UTC
  - `groupByMonth(posts) -> { key, label, posts }[]` assuming `posts` already sorted newest-first
  - npm scripts: `start` = `eleventy --serve`, `build` = `eleventy`, `test` = `node --test test/*.test.mjs`
  - 11ty dirs: `dir.input = "src"`, `dir.output = "_site"`
  - passthrough: `{ "src/css": "css" }`, `{ "src/js": "js" }`, `{ "resources": "resources" }`

- [ ] **Step 1: Write the failing helper tests**

Create `test/posts.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  missingFrontmatterFields,
  uniqueTags,
  monthKey,
  monthLabel,
  groupByMonth,
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
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run: `node --test test/posts.test.mjs`

Expected: FAIL with `Cannot find module` for `../src/lib/posts.js` (or the named exports).

- [ ] **Step 3: Implement `src/lib/posts.js`**

```js
export function missingFrontmatterFields(data) {
  const missing = [];
  if (data.title == null || String(data.title).trim() === "") missing.push("title");
  if (data.date == null || data.date === "") missing.push("date");
  if (!Array.isArray(data.tags) || data.tags.length === 0) missing.push("tags");
  return missing;
}

export function uniqueTags(posts) {
  const set = new Set();
  for (const post of posts) {
    for (const tag of post.data.tags || []) {
      if (tag && tag !== "posts") set.add(tag);
    }
  }
  return [...set].sort();
}

export function monthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabel(date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function groupByMonth(posts) {
  const groups = [];
  for (const post of posts) {
    const key = monthKey(post.date);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) {
      groups.push({ key, label: monthLabel(post.date), posts: [post] });
    } else {
      last.posts.push(post);
    }
  }
  return groups;
}
```

- [ ] **Step 4: Re-run helper tests**

Run: `node --test test/posts.test.mjs`

Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing build test for the homepage chrome**

Create `test/build.test.mjs`:

```js
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
  assert.match(html, /#f7f3eb/);
  assert.equal(existsSync("_site/css/style.css"), true);
});
```

- [ ] **Step 6: Run the build test to verify it fails**

Run: `node --test test/build.test.mjs`

Expected: FAIL (`npx eleventy` missing, or homepage lacks the strings).

- [ ] **Step 7: Scaffold Eleventy and the paper homepage**

`package.json`:

```json
{
  "name": "shikaiwi-github-io",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "eleventy --serve",
    "build": "eleventy",
    "test": "node --test test/*.test.mjs"
  },
  "devDependencies": {
    "@11ty/eleventy": "^3.1.2",
    "@11ty/eleventy-plugin-syntaxhighlight": "^5.0.2"
  }
}
```

`src/_data/site.json`:

```json
{
  "name": "Wei Xikai",
  "subtitle": "notes on systems and code"
}
```

`eleventy.config.js`:

```js
import { uniqueTags, groupByMonth } from "./src/lib/posts.js";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ resources: "resources" });

  eleventyConfig.addFilter("uniqueTags", uniqueTags);
  eleventyConfig.addFilter("groupByMonth", groupByMonth);

  eleventyConfig.addCollection("blog", (api) => {
    return api.getFilteredByGlob("src/posts/*.md").sort((a, b) => b.date - a.date);
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
```

`src/_includes/layout.njk`:

```njk
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% if title %}{{ title }} · {% endif %}{{ site.name }}</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="page">
    {{ content | safe }}
    {% if friends and friends.length %}
    <footer class="friends">
      <span>friends</span>
      {% for friend in friends %}
      <a href="{{ friend.url }}">{{ friend.name }}</a>
      {% endfor %}
    </footer>
    {% endif %}
  </div>
</body>
</html>
```

`src/index.njk`:

```njk
---
layout: layout.njk
permalink: /
---
<header class="masthead">
  <h1>{{ site.name }}</h1>
  <p class="subtitle">{{ site.subtitle }}</p>
</header>
```

`src/css/style.css`:

```css
:root {
  --paper: #f7f3eb;
  --ink: #2a2418;
  --muted: #7a7264;
  --line: #d8d0c2;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #f7f3eb; color: #2a2418; }
body {
  font-family: Georgia, ui-serif, "Times New Roman", serif;
  line-height: 1.6;
}
.page { max-width: 44rem; margin: 0 auto; padding: 3rem 1.5rem 4rem; }
.masthead h1 { font-weight: 500; letter-spacing: 0.01em; margin: 0; }
.subtitle { color: #7a7264; margin: 0.35rem 0 0; }
code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; }
```

Then run: `npm install`

- [ ] **Step 8: Run helper and build tests**

Run: `npm test`

Expected: `test/posts.test.mjs` PASS; `test/build.test.mjs` PASS (`_site/index.html` contains `Wei Xikai`, `notes on systems and code`, `#f7f3eb`).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json eleventy.config.js src/lib/posts.js src/_data/site.json src/_includes/layout.njk src/index.njk src/css/style.css test/posts.test.mjs test/build.test.mjs
git commit -m "feat: scaffold 11ty paper homepage"
```

---

### Task 2: Friends footer from data

**Files:**
- Create: `src/lib/friends.js`
- Create: `test/friends.test.mjs`
- Create: `src/_data/friends.json`
- Modify: `src/_includes/layout.njk` (already has the footer; wire is data-only)
- Modify: `test/build.test.mjs` (add friends assertions)

**Interfaces:**
- Consumes: `layout.njk` footer that renders when `friends.length`
- Produces: `shouldShowFriends(friends) -> boolean` — true only for a non-empty array
- Produces: `src/_data/friends.json` with exactly:
  - `{ "name": "tao", "url": "http://tao93.top" }`
  - `{ "name": "hamson", "url": "https://zxshamson.github.io" }`
  - `{ "name": "ja1r0", "url": "https://ja1r0.github.io/" }`
  - `{ "name": "sadhen", "url": "http://sadhen.com/" }`

- [ ] **Step 1: Write the failing friends tests**

Create `test/friends.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowFriends } from "../src/lib/friends.js";

test("shouldShowFriends hides empty or missing lists", () => {
  assert.equal(shouldShowFriends(undefined), false);
  assert.equal(shouldShowFriends(null), false);
  assert.equal(shouldShowFriends([]), false);
  assert.equal(shouldShowFriends([{ name: "tao", url: "http://tao93.top" }]), true);
});
```

Add to `test/build.test.mjs`:

```js
test("homepage footer lists the four friends", () => {
  const result = spawnSync("npx", ["eleventy"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync("_site/index.html", "utf8");
  assert.match(html, /tao93\.top/);
  assert.match(html, /zxshamson\.github\.io/);
  assert.match(html, /ja1r0\.github\.io/);
  assert.match(html, /sadhen\.com/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/friends.test.mjs test/build.test.mjs`

Expected: FAIL — `src/lib/friends.js` missing; homepage lacks friend URLs.

- [ ] **Step 3: Implement friends helper and data**

`src/lib/friends.js`:

```js
export function shouldShowFriends(friends) {
  return Array.isArray(friends) && friends.length > 0;
}
```

`src/_data/friends.json`:

```json
[
  { "name": "tao", "url": "http://tao93.top" },
  { "name": "hamson", "url": "https://zxshamson.github.io" },
  { "name": "ja1r0", "url": "https://ja1r0.github.io/" },
  { "name": "sadhen", "url": "http://sadhen.com/" }
]
```

In `src/_includes/layout.njk`, import the helper only if you prefer to call it from Nunjucks. 11ty already exposes `_data/friends.json` as `friends`. Keep the existing `{% if friends and friends.length %}` guard — that is the template equivalent of `shouldShowFriends`. Do not add a friends heading beyond the lowercase `friends` label already in the layout.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS, including the four friend URLs in `_site/index.html`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/friends.js src/_data/friends.json test/friends.test.mjs test/build.test.mjs src/_includes/layout.njk
git commit -m "feat: render friends links from data"
```

---

### Task 3: Frontmatter guard, post layout, and the first article

**Files:**
- Modify: `eleventy.config.js` (guard + default post layout + highlight plugin)
- Create: `src/_includes/post.njk`
- Create: `src/posts/mutex-impl.md` (move from `Mutex-Impl.md`, add frontmatter, rewrite resource URLs)
- Delete: `Mutex-Impl.md` after the move
- Modify: `src/css/style.css` (article + code styles)
- Modify: `test/posts.test.mjs` (source-header date check)
- Modify: `test/build.test.mjs` (mutex page assertions)
- Modify: `src/lib/posts.js` (add `frontmatterHasRequiredFields(rawMarkdown)`)

**Interfaces:**
- Consumes: `missingFrontmatterFields` from Task 1
- Produces:
  - `frontmatterHasRequiredFields(rawMarkdown) -> string[]` — inspects the first YAML fence for `title:`, `date:`, and `tags:` keys
  - `blog` collection throws `Error` whose message contains `Post <inputPath> missing` and the field names
  - Post permalink `/posts/<fileSlug>/`
  - Post layout path `src/_includes/post.njk` with back link `← all posts` to `/`
  - `mutex-impl` frontmatter: `title: Mutex Implementation`, `date: 2018-10-24`, `tags: [os]`

- [ ] **Step 1: Write the failing source-header and article-page tests**

Add to `src/lib/posts.js` only after the test fails. First add tests to `test/posts.test.mjs`:

```js
import { frontmatterHasRequiredFields } from "../src/lib/posts.js";

test("frontmatterHasRequiredFields reads the YAML fence", () => {
  const raw = `---\ntitle: Hello\ndate: 2018-10-24\ntags:\n  - os\n---\nbody\n`;
  assert.deepEqual(frontmatterHasRequiredFields(raw), []);
  assert.deepEqual(frontmatterHasRequiredFields(`---\ntitle: Hello\n---\n`), ["date", "tags"]);
});
```

Add to `test/build.test.mjs`:

```js
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
```

Do not add a temporary fixture post under `src/posts/` to test the guard. `frontmatterHasRequiredFields` is the unit that proves missing keys are detected; `eleventy.config.js` throws when that function returns a non-empty list for a real post.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test test/posts.test.mjs test/build.test.mjs`

Expected: FAIL — `frontmatterHasRequiredFields` not exported; `_site/posts/mutex-impl/` missing.

- [ ] **Step 3: Implement the guard, layout, highlight plugin, and mutex post**

Add to `src/lib/posts.js`:

```js
export function frontmatterHasRequiredFields(rawMarkdown) {
  const match = rawMarkdown.match(/^---\n([\s\S]*?)\n---/);
  const block = match ? match[1] : "";
  const has = (key) => new RegExp(`^${key}:`, "m").test(block);
  const missing = [];
  if (!has("title")) missing.push("title");
  if (!has("date")) missing.push("date");
  if (!has("tags")) missing.push("tags");
  return missing;
}
```

Replace the `blog` collection in `eleventy.config.js` with:

```js
import { readFileSync } from "node:fs";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import {
  uniqueTags,
  groupByMonth,
  frontmatterHasRequiredFields,
} from "./src/lib/posts.js";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ resources: "resources" });

  eleventyConfig.addFilter("uniqueTags", uniqueTags);
  eleventyConfig.addFilter("groupByMonth", groupByMonth);
  eleventyConfig.addFilter("isoDate", (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  });

  eleventyConfig.addCollection("blog", (api) => {
    const posts = api.getFilteredByGlob("./src/posts/*.md")
      .filter((post) => !post.inputPath.includes("_fixture-"))
      .sort((a, b) => b.date - a.date);
    for (const post of posts) {
      const raw = readFileSync(post.inputPath, "utf8");
      const missing = frontmatterHasRequiredFields(raw);
      if (missing.length) {
        throw new Error(`Post ${post.inputPath} missing ${missing.join(", ")}`);
      }
    }
    return posts;
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
```

`src/_includes/post.njk`:

```njk
---
layout: layout.njk
---
<article class="post">
  <p class="back"><a href="/">← all posts</a></p>
  <h1>{{ title }}</h1>
  <p class="meta">
    <time datetime="{{ page.date | isoDate }}">{{ page.date | isoDate }}</time>
    {% for tag in tags %}
      {% if tag != "posts" %}
      <a class="tag" href="/?tag={{ tag }}">{{ tag }}</a>
      {% endif %}
    {% endfor %}
  </p>
  <div class="body">
    {{ content | safe }}
  </div>
</article>
```

Set a default layout for posts. Add to `src/posts/mutex-impl.md` (and later every post) this frontmatter field: `layout: post.njk`.

Create `src/posts/mutex-impl.md` by moving the existing file and prepending frontmatter. Run:

```bash
mkdir -p src/posts
git mv Mutex-Impl.md src/posts/mutex-impl.md
```

Prepend this exact frontmatter (keep the original body after it). Also replace every

`https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/`

with `/resources/` in that file. The rust example becomes `/resources/mutex-impl/mmutex.rs`.

Frontmatter:

```yaml
---
title: Mutex Implementation
date: 2018-10-24
tags:
  - os
layout: post.njk
---
```

Add to `src/css/style.css`:

```css
.back { font-size: 0.95rem; }
.back a { color: #7a7264; text-decoration: none; border-bottom: 1px solid #d8d0c2; }
.meta { color: #7a7264; font-size: 0.95rem; }
.tag { color: #7a7264; text-decoration: none; border-bottom: 1px solid #c8c0b2; margin-left: 0.6rem; }
.body pre { background: #efe8dc; padding: 0.9rem 1rem; overflow-x: auto; }
.body img { max-width: 100%; height: auto; }
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS. `_site/posts/mutex-impl/index.html` exists with title, `2018-10-24`, `/?tag=os`, and body text.

- [ ] **Step 5: Commit**

```bash
git add eleventy.config.js src/lib/posts.js src/_includes/post.njk src/posts/mutex-impl.md src/css/style.css test/posts.test.mjs test/build.test.mjs
git add -u Mutex-Impl.md
git commit -m "feat: render mutex post with required frontmatter"
```

---

### Task 4: Migrate the remaining eight posts and resource URLs

**Files:**
- Create: `src/posts/bloom-filter.md`
- Create: `src/posts/tcp-time-wait-state.md`
- Create: `src/posts/golang-syncmap.md`
- Create: `src/posts/go-to-https.md`
- Create: `src/posts/weak-isolation-level-of-database-transaction.md`
- Create: `src/posts/stream-reading.md`
- Create: `src/posts/golang-json-encoding.md`
- Create: `src/posts/es5-inheritance.md`
- Delete the eight matching root `*.md` files (not `README.md`)
- Modify: `test/build.test.mjs`

**Interfaces:**
- Consumes: `layout: post.njk`, URL rewrite rule, `blog` collection
- Produces: nine posts with the slug / date / tags table in the spec; every in-repo `blob/master/resources/` URL rewritten to `/resources/`

Frontmatter table (copy verbatim):

| dest | title | date | tags |
|---|---|---|---|
| `src/posts/bloom-filter.md` | Bloom Filter | 2018-10-06 | database |
| `src/posts/tcp-time-wait-state.md` | TCP Time Wait State | 2018-09-23 | network |
| `src/posts/golang-syncmap.md` | Golang SyncMap | 2018-09-14 | go |
| `src/posts/go-to-https.md` | Go To HTTPS | 2018-09-10 | web, network |
| `src/posts/weak-isolation-level-of-database-transaction.md` | Weak Isolation Level of Database Transaction | 2018-08-27 | database |
| `src/posts/stream-reading.md` | Stream Reading | 2018-08-22 | go |
| `src/posts/golang-json-encoding.md` | Golang JSON Encoding | 2018-08-16 | go |
| `src/posts/es5-inheritance.md` | ES5 Inheritance | 2018-08-15 | web |

- [ ] **Step 1: Extend the build test for all slugs and rewritten images**

Add to `test/build.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test --test-name-pattern="all nine posts" test/build.test.mjs`

Expected: FAIL — missing slugs under `_site/posts/`.

- [ ] **Step 3: Move, stamp frontmatter, rewrite URLs**

```bash
git mv Bloom-Filter.md src/posts/bloom-filter.md
git mv TCP-Time-Wait-State.md src/posts/tcp-time-wait-state.md
git mv Golang-SyncMap.md src/posts/golang-syncmap.md
git mv Go-To-HTTPS.md src/posts/go-to-https.md
git mv Weak-Isolation-Level-Of-Database-Transaction.md src/posts/weak-isolation-level-of-database-transaction.md
git mv Stream-Reading.md src/posts/stream-reading.md
git mv Golang-JSON-Encoding.md src/posts/golang-json-encoding.md
git mv ES5-Inheritance.md src/posts/es5-inheritance.md
```

For each file, prepend the matching YAML (including `layout: post.njk`) and run this rewrite on the body:

```bash
perl -pi -e 's#https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/#/resources/#g' src/posts/*.md
```

`go-to-https` tags YAML:

```yaml
tags:
  - web
  - network
```

Do not change any sentence of the article bodies.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS. Nine post directories exist. Built HTML has no GitHub blob resource URLs. The four image fixtures exist under `_site/resources/`.

- [ ] **Step 5: Commit**

```bash
git add src/posts test/build.test.mjs
git add -u Bloom-Filter.md TCP-Time-Wait-State.md Golang-SyncMap.md Go-To-HTTPS.md Weak-Isolation-Level-Of-Database-Transaction.md Stream-Reading.md Golang-JSON-Encoding.md ES5-Inheritance.md
git commit -m "feat: migrate remaining posts onto 11ty with local resources"
```

---

### Task 5: Homepage timeline and tag row (server-rendered)

**Files:**
- Modify: `src/index.njk`
- Modify: `src/css/style.css`
- Modify: `test/build.test.mjs`

**Interfaces:**
- Consumes: `collections.blog`, `uniqueTags`, `groupByMonth`
- Produces: homepage markup:
  - nav `.tags` with `a[data-tag="all"]` first, then one `a[data-tag="<tag>"]` per `uniqueTags(collections.blog)`
  - one `section.month[data-month=YYYY-MM]` per group, `h2` text from `monthLabel`
  - each article `article.entry[data-tags="tag1 tag2"]` linking to `post.url`
  - `p#empty-tags` with text `没有这个 tag 的文章` and the `hidden` attribute
- Without JS, all nine titles are visible (progressive enhancement)

- [ ] **Step 1: Write the failing homepage content tests**

Add to `test/build.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --test-name-pattern="homepage lists posts" test/build.test.mjs`

Expected: FAIL — `src/index.njk` still only has the masthead.

- [ ] **Step 3: Render the timeline and tag row**

Replace `src/index.njk` with:

```njk
---
layout: layout.njk
permalink: /
---
<header class="masthead">
  <h1>{{ site.name }}</h1>
  <p class="subtitle">{{ site.subtitle }}</p>
</header>

<nav class="tags" aria-label="tags">
  <a href="/" data-tag="all">all</a>
  {% for tag in collections.blog | uniqueTags %}
  <a href="/?tag={{ tag }}" data-tag="{{ tag }}">{{ tag }}</a>
  {% endfor %}
</nav>

<p id="empty-tags" hidden>没有这个 tag 的文章</p>

<div class="timeline">
  {% for month in collections.blog | groupByMonth %}
  <section class="month" data-month="{{ month.key }}">
    <h2>{{ month.label }}</h2>
    {% for post in month.posts %}
    <article class="entry" data-tags="{% for tag in post.data.tags %}{% if tag != "posts" %}{{ tag }} {% endif %}{% endfor %}">
      <a href="{{ post.url }}">{{ post.data.title }}</a>
      <span class="entry-tags">
        {% for tag in post.data.tags %}
          {% if tag != "posts" %}{{ tag }} {% endif %}
        {% endfor %}
      </span>
    </article>
    {% endfor %}
  </section>
  {% endfor %}
</div>
```

Add CSS:

```css
.tags { display: flex; flex-wrap: wrap; gap: 0.9rem; border-bottom: 1px solid #d8d0c2; padding-bottom: 0.8rem; margin: 1.8rem 0 1.6rem; }
.tags a { color: #7a7264; text-decoration: none; }
.tags a.is-active { color: #2a2418; border-bottom: 1px solid #2a2418; }
.month h2 { font-size: 0.85rem; color: #9a9284; font-weight: 500; margin: 1.4rem 0 0.4rem; }
.entry { display: flex; justify-content: space-between; gap: 1rem; padding: 0.25rem 0; }
.entry a { color: #2a2418; text-decoration: none; }
.entry a:hover { border-bottom: 1px solid #2a2418; }
.entry-tags { color: #9a9284; font-size: 0.85rem; }
#empty-tags { color: #7a7264; }
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS. Homepage HTML has month headings in newest-first order and all five tags plus `all`.

- [ ] **Step 5: Commit**

```bash
git add src/index.njk src/css/style.css test/build.test.mjs
git commit -m "feat: list posts on a monthly timeline"
```

---

### Task 6: Client-side tag filter

**Files:**
- Create: `src/js/filter.js`
- Create: `test/filter.test.mjs`
- Modify: `src/index.njk` (script tag)
- Modify: `src/_includes/layout.njk` only if a shared hook is needed — prefer loading the script from `index.njk`

**Interfaces:**
- Consumes: homepage `data-tag`, `data-tags`, `section.month`, `#empty-tags`
- Produces:
  - `selectedTag(search: string) -> string | null` — reads `tag`; empty or missing → `null`
  - `nextSelectedTag(clicked: string, current: string | null) -> string | null` — `"all"` or a repeat of `current` → `null`; otherwise `clicked`
  - `articleVisible(tagList: string[], selected: string | null) -> boolean`
  - `applyFilter({ search, articles, months, empty, tagLinks, replaceState })` — sets `hidden` on articles and empty months, toggles `.is-active`, shows `#empty-tags` when `selected` is non-null and every article is hidden, calls `replaceState` with `/?tag=go` or `/`
  - default export / `boot()` listens on `.tags` clicks (`preventDefault`) and runs `applyFilter` on load

- [ ] **Step 1: Write the failing filter tests**

Create `test/filter.test.mjs`:

```js
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
```

- [ ] **Step 2: Run filter tests to verify they fail**

Run: `node --test test/filter.test.mjs`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/js/filter.js`**

```js
export function selectedTag(search) {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(q).get("tag");
  if (raw == null) return null;
  const tag = raw.trim();
  return tag === "" ? null : tag;
}

export function nextSelectedTag(clicked, current) {
  if (clicked === "all" || clicked === current) return null;
  return clicked;
}

export function articleVisible(tagList, selected) {
  if (selected == null) return true;
  return tagList.includes(selected);
}

export function applyFilter({ search, articles, months, empty, tagLinks, replaceState }) {
  const selected = selectedTag(search);
  let visibleCount = 0;
  for (const article of articles) {
    const tags = (article.getAttribute("data-tags") || "").trim().split(/\s+/).filter(Boolean);
    const show = articleVisible(tags, selected);
    article.hidden = !show;
    if (show) visibleCount += 1;
  }
  for (const month of months) {
    const entries = month.querySelectorAll(".entry");
    month.hidden = [...entries].every((entry) => entry.hidden);
  }
  empty.hidden = !(selected != null && visibleCount === 0);
  for (const link of tagLinks) {
    const tag = link.getAttribute("data-tag");
    const active = selected == null ? tag === "all" : tag === selected;
    link.classList.toggle("is-active", active);
  }
  const url = selected ? `/?tag=${encodeURIComponent(selected)}` : "/";
  replaceState(url);
}

export function boot(doc = document, loc = location, hist = history) {
  const articles = [...doc.querySelectorAll(".entry")];
  const months = [...doc.querySelectorAll(".month")];
  const empty = doc.querySelector("#empty-tags");
  const tagLinks = [...doc.querySelectorAll(".tags [data-tag]")];
  const run = (search) =>
    applyFilter({
      search,
      articles,
      months,
      empty,
      tagLinks,
      replaceState: (url) => hist.replaceState(null, "", url),
    });
  run(loc.search);
  doc.querySelector(".tags")?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-tag]");
    if (!link) return;
    event.preventDefault();
    const next = nextSelectedTag(link.getAttribute("data-tag"), selectedTag(loc.search));
    run(next ? `?tag=${next}` : "");
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => boot());
}
```

Add at the bottom of `src/index.njk`:

```njk
<script type="module" src="/js/filter.js"></script>
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS. `test/filter.test.mjs` covers query parsing, toggle, empty state, and restore-all. Build test still copies `src/js/filter.js` to `_site/js/filter.js`.

- [ ] **Step 5: Manual check (required)**

Run: `npm start`

Open `http://localhost:8080/?tag=go`. Exactly three titles remain: Golang SyncMap, Stream Reading, Golang JSON Encoding. Click `all` — all nine return and the URL is `/`. Click `os` twice — filter clears.

- [ ] **Step 6: Commit**

```bash
git add src/js/filter.js src/index.njk test/filter.test.mjs
git commit -m "feat: filter the timeline by tag query"
```

---

### Task 7: GitHub Actions deploy and README

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`
- Modify: `package.json` only if the Node version in `engines` is added — set `"engines": { "node": ">=22" }`

**Interfaces:**
- Consumes: `npm ci`, `npm test`, `npm run build`, `_site/`
- Produces: workflow on `push` to `master` and `workflow_dispatch`; permissions `contents: read`, `pages: write`, `id-token: write`; steps checkout → setup-node 22 with cache → `npm ci` → `npm test` → `npm run build` → `actions/upload-pages-artifact` (path `_site`) → `actions/deploy-pages`
- README: one-paragraph pointer to https://shikaiwi.github.io plus a note that Pages Source must be GitHub Actions

- [ ] **Step 1: Write a failing assertion that the workflow file exists**

Add to `test/build.test.mjs`:

```js
test("pages workflow deploys _site via GitHub Actions", () => {
  const yml = readFileSync(".github/workflows/pages.yml", "utf8");
  assert.match(yml, /actions\/upload-pages-artifact/);
  assert.match(yml, /actions\/deploy-pages/);
  assert.match(yml, /npm test/);
  assert.match(yml, /npm run build/);
  assert.match(yml, /pages: write/);
});
```

- [ ] **Step 2: Run that test to verify it fails**

Run: `node --test --test-name-pattern="pages workflow" test/build.test.mjs`

Expected: FAIL — file missing.

- [ ] **Step 3: Add the workflow and rewrite README**

`.github/workflows/pages.yml`:

```yaml
name: Deploy Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Replace `README.md` with:

```markdown
# Wei Xikai

Notes on systems and code: https://shikaiwi.github.io

This repository is built with [Eleventy](https://www.11ty.dev/). After the first deploy, set **Settings → Pages → Source** to **GitHub Actions**.

```sh
npm install
npm start
```
```

Add to `package.json`:

```json
  "engines": {
    "node": ">=22"
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS, including the workflow file test.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml README.md package.json
git commit -m "feat: deploy the 11ty site with GitHub Actions"
```

After merge/push, the human owner must switch Pages Source to GitHub Actions once. The implementer cannot do that from git.

---

## Self-review

Spec coverage:

| Spec requirement | Task |
|---|---|
| Independent Pages site, not README-as-homepage | 1, 7 |
| Timeline newest-first, month groups (`October 2018`) | 5 |
| Tag filter on the same list; no `/tags/go/` | 5, 6 |
| Article HTML pages at `/posts/<slug>/` | 3, 4 |
| Paper visual (color, serif, underline tags) | 1, 5 |
| Friends four links; hide if empty | 2 |
| 11ty + Actions, not Hugo | 1, 7 |
| `src/` input, `resources/` passthrough | 1, 4 |
| `?tag=` shareable; unknown tag empty copy | 6 |
| Required frontmatter fails the build | 3 (`frontmatterHasRequiredFields` on every real post) |
| Nine slugs/dates/tags + URL rewrite | 3, 4 |
| Syntax highlight | 3 (plugin) |
| README + Pages source note | 7 |
| No-JS still lists all posts | 5 (server-rendered), 6 (enhancement only) |

No TBD/TODO placeholders remain. Helper names (`uniqueTags`, `groupByMonth`, `selectedTag`, `nextSelectedTag`, `articleVisible`, `applyFilter`, `shouldShowFriends`, `frontmatterHasRequiredFields`) are stable across tasks.
