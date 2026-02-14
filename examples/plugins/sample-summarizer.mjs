export function summarizeWorkItem(item) {
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) {
    return [];
  }

  return [`Plugin summary: ${title}`];
}

