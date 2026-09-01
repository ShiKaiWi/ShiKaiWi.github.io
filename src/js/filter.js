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
  doc.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-tag]");
    if (!link || !link.closest(".tags, .entry-tags")) return;
    event.preventDefault();
    const next = nextSelectedTag(link.getAttribute("data-tag"), selectedTag(loc.search));
    run(next ? `?tag=${next}` : "");
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => boot());
}
