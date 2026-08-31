# GitHub Pages 博客：按 tag 过滤的时间线首页

日期：2026-08-31  
状态：已确认  
站点：https://shikaiwi.github.io

## 背景

仓库 `ShiKaiWi.github.io` 现在只有一份按 Web / SourceRead / DataBase / OS 分组的 README。访问站点时没有独立博客，文章也没有统一的日期和标签。目标是做成真正的 GitHub Pages 站点：首页按时间线列出全部文章，并能按 tag 过滤；每篇文章有独立的 HTML 页。

## 目标

- 访问 `shikaiwi.github.io` 看到独立博客，而不是仓库 README。
- 首页默认按时间倒序列出全部文章，按月份分组。
- 用 tag 过滤同一条时间线，不另做「几个大分类」区块，也不做 `/tags/go/` 列表页。
- 点击文章进入站点内渲染的正文页。
- 视觉为浅色纸页风格：衬线标题、克制的下划线，不使用深色终端风或圆角卡片风。
- 首页底部保留 Friends 文字链接。

## 非目标

- 搜索、分页、RSS、评论、阅读量。
- 独立的 tag 归档页。
- 改写既有文章正文（只加 frontmatter，并修正会裂开的资源链接）。
- 用 Hugo。构建器用 Eleventy（11ty）。

## 架构

Eleventy 在 CI 里把 Markdown 和模板编译成静态文件，GitHub Actions 发布到 GitHub Pages。

```
src/posts/*.md  +  resources/
        ↓  11ty（本地 npm start / CI npx eleventy）
     _site/
        ↓  actions/upload-pages-artifact + actions/deploy-pages
https://shikaiwi.github.io
```

- 源码输入目录：`src/`。避免 11ty 把 README、LICENSE、workflow 当页面处理。
- `resources/` 仍留在仓库根目录，构建时 passthrough 到 `/resources/`。
- 输出目录：`_site/`，不提交。
- 运行时没有后端。tag 过滤是首页上的一小段原生 JavaScript，同步 URL 查询参数 `?tag=`。
- 这是用户站（`username.github.io`），发布后页面挂在域名根上，没有 `/ShiKaiWi.github.io/` 前缀。本地和线上都用根路径 `/css/`、`/posts/`、`/resources/`。

## 仓库结构

```
src/
  index.njk                 # 首页
  posts/*.md                # 现有文章，带 frontmatter
  css/style.css
  js/filter.js              # 仅首页使用
  _includes/
    layout.njk              # 纸页外壳：字体、页宽、页脚
    post.njk                # 文章页
  _data/
    site.json               # 站名、简介
    friends.json            # 友链
eleventy.config.js
package.json
.github/workflows/pages.yml
resources/                  # 现有图和示例代码，位置不变
README.md                   # 仓库说明，指向线上站点
```

本地命令：

- `npm start`：`eleventy --serve`
- `npm run build`：`eleventy`

## 页面

### 首页 `/`

从上到下：

1. 站名 `Wei Xikai`，副标题 `notes on systems and code`。
2. tag 行。第一项是 `all`（清除过滤）。其余 tag 从全部文章去重后按字母排序。当前选中的 tag 用下划线标出。
3. 时间线。文章按 `date` 倒序，用 `YYYY-MM` 做分组标题（英文月份 + 年，例如 `October 2018`）。每行是标题，右侧或后方跟该篇的 tag。标题链到文章页。
4. Friends。数据来自 `src/_data/friends.json`（`name` + `url`）。为空数组或文件缺失则整栏不渲染。初始四条：

   | name | url |
   |---|---|
   | tao | http://tao93.top |
   | hamson | https://zxshamson.github.io |
   | ja1r0 | https://ja1r0.github.io/ |
   | sadhen | http://sadhen.com/ |

过滤行为：

- 点击 tag：时间线只保留含该 tag 的文章；月份分组随结果重算。地址变为 `/?tag=go`。
- 点击 `all` 或再次点击当前 tag：恢复全部文章，去掉查询参数。
- 直接打开 `/?tag=go`：页面加载后按该 tag 过滤（可分享）。
- `/?tag=` 指向不存在的 tag：时间线区域显示「没有这个 tag 的文章」，tag 行仍在。

不使用框架。`filter.js` 只读写 DOM 和 `URLSearchParams`。

### 文章页 `/posts/<slug>/`

- 顶部：「← all posts」，回到 `/`。
- 标题、日期（`YYYY-MM-DD`）、可点击的 tag。点 tag 去 `/?tag=<name>`。
- 正文：Markdown 渲染为 HTML。代码块用等宽字体，带基础语法高亮。
- slug 取自现有文件名的 kebab-case 形式，见下表。

## 文章数据

每篇 `src/posts/<slug>.md` 必须有 YAML frontmatter。缺 `title`、`date` 或 `tags` 时构建失败（在 `eleventy.config.js` 里校验集合，而不是等上线后才发现）。

```yaml
---
title: Mutex Implementation
date: 2018-10-24
tags:
  - os
---
```

`tags` 为字符串数组，一律小写英文短词。一篇 1～2 个。首页 tag 行只出现至少被一篇使用过的 tag。

| 源文件 | slug | date | tags |
|---|---|---|---|
| Mutex-Impl.md | mutex-impl | 2018-10-24 | os |
| Bloom-Filter.md | bloom-filter | 2018-10-06 | database |
| TCP-Time-Wait-State.md | tcp-time-wait-state | 2018-09-23 | network |
| Golang-SyncMap.md | golang-syncmap | 2018-09-14 | go |
| Go-To-HTTPS.md | go-to-https | 2018-09-10 | web, network |
| Weak-Isolation-Level-Of-Database-Transaction.md | weak-isolation-level-of-database-transaction | 2018-08-27 | database |
| Stream-Reading.md | stream-reading | 2018-08-22 | go |
| Golang-JSON-Encoding.md | golang-json-encoding | 2018-08-16 | go |
| ES5-Inheritance.md | es5-inheritance | 2018-08-15 | web |

日期取该文件首次加入仓库的日期（`git log --follow --diff-filter=A`）。

根目录不再保留这些 `.md` 作为页面源。移入 `src/posts/` 后，旧的 GitHub blob URL 会 404；README 改为指向线上站点，不再链到仓库内的 md。

## 视觉

- 背景接近纸色（例如 `#f7f3eb`），正文深褐，次要信息偏低对比灰。
- 标题与站名用衬线（Georgia / `ui-serif`）；正文可用同一衬线或与之接近的阅读字体；代码用等宽。
- tag 不是药丸按钮：未选中为灰色文字，选中为深色加下划线。
- 单栏，最大宽度约 40～48rem，左右留白。
- 不用深色主题、圆角大卡片、重阴影。

## 资源链接

现有正文用 GitHub `blob` URL 引用图和示例。`blob` 页是 HTML，在独立站点里当图片会裂开。

构建前把正文里指向本仓库 `resources/` 的图片改成站点根路径：

- `https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/...` → `/resources/...`

示例代码链接（`.go` / `.py` / `.rs`）可以继续指向 GitHub，也可以改成 `/resources/...` 的静态文件。实现时统一改成站点路径，避免读者跳出去。

`resources/` 整树 passthrough，路径与现在一致（例如 `/resources/go-syncmap/read_dirty_map.svg`）。

## 构建与发布

`package.json` 依赖：`@11ty/eleventy`，以及 Markdown 语法高亮所需的官方或常用插件（例如 `@11ty/eleventy-plugin-syntaxhighlight`）。锁版本用 `package-lock.json`。

GitHub Actions（`.github/workflows/pages.yml`）：

1. 触发：推送 `master`，以及 `workflow_dispatch`。
2. `actions/checkout`、`actions/setup-node`（读 lockfile）、`npm ci`、`npm run build`。
3. `actions/upload-pages-artifact` 上传 `_site/`。
4. `actions/deploy-pages` 发布。
5. 权限：`contents: read`、`pages: write`、`id-token: write`。

仓库 Settings → Pages → Source 改为 GitHub Actions。这是一次性手动步骤；workflow 本身无法改这个设置。文档写在 README。

忽略：`node_modules/`、`_site/`、`.superpowers/`、`.DS_Store`。

## 边界

- 未知 `?tag=`：空状态文案，不 404。
- `friends.json` 为空数组或缺失：不渲染 Friends 栏。
- 某篇只有一个 tag：tag 行仍只显示全局用过的 tag。
- 同一月份多篇：组内仍按日期倒序。
- 浏览器无 JS：首页仍列出全部文章；过滤不可用，文章页和链接正常。这是可接受的降级。

## 验收

本地 `npm start`：

- 首页能看到全部 9 篇，按日期倒序，按月分组。
- 点击 `go` 只留下 SyncMap、Stream Reading、JSON Encoding 三篇；URL 为 `/?tag=go`。
- 刷新该 URL 后过滤仍然生效。
- 打开 Mutex 文章页，能看到标题、日期、`os` tag、正文。
- SyncMap、Bloom Filter、TCP Time Wait、Isolation Level 文中的图能显示。
- 底部四条 friend 链接可点。

CI：

- 推送 `master` 后 workflow 成功。
- https://shikaiwi.github.io 返回首页，https://shikaiwi.github.io/posts/mutex-impl/ 返回文章页。

不做独立测试框架。缺 frontmatter 或 `npm run build` 失败即不合格。
