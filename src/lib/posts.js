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
