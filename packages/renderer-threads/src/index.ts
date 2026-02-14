import type { Digest, WorkItem } from "@repodigest/core";

export type PublicTone = "calm" | "playful" | "hacker" | "formal";
export type PublicLang = "en" | "zh-TW" | "both";

export interface ThreadsRenderOptions {
  tone?: PublicTone;
  lang?: PublicLang;
  includeMetrics?: boolean;
}

export interface ThreadsRenderResult {
  blocks: string[];
}

function normalizeLang(lang: PublicLang | undefined): "en" | "zh-TW" {
  if (lang === "zh-TW") {
    return "zh-TW";
  }
  return "en";
}

function toneIntro(date: string, tone: PublicTone, lang: "en" | "zh-TW"): string {
  if (lang === "zh-TW") {
    switch (tone) {
      case "playful":
        return `今天的 build in public 更新 (${date})`;
      case "hacker":
        return `公開建置紀錄 ${date}`;
      case "formal":
        return `進度公開報告 (${date})`;
      default:
        return `今日公開進度 (${date})`;
    }
  }

  switch (tone) {
    case "playful":
      return `Build in public update (${date})`;
    case "hacker":
      return `Public build log (${date})`;
    case "formal":
      return `Progress report (${date})`;
    default:
      return `Public progress update (${date})`;
  }
}

function sectionTitle(key: "due" | "done" | "inProgress" | "blocked" | "next", lang: "en" | "zh-TW"): string {
  if (lang === "zh-TW") {
    if (key === "due") return "今日到期";
    if (key === "done") return "已完成";
    if (key === "inProgress") return "進行中";
    if (key === "blocked") return "阻塞";
    return "下一步";
  }
  if (key === "due") return "Due Today";
  if (key === "done") return "Done";
  if (key === "inProgress") return "In Progress";
  if (key === "blocked") return "Blocked";
  return "Next";
}

function formatItems(items: WorkItem[], lang: "en" | "zh-TW"): string[] {
  if (items.length === 0) {
    return [lang === "zh-TW" ? "- 目前沒有更新" : "- No updates"];
  }
  return items.slice(0, 5).map((item) => {
    const summary = item.highlights[0] ? ` (${item.highlights[0]})` : "";
    return `- ${item.title}${summary}`;
  });
}

function sectionBlock(
  title: string,
  items: WorkItem[],
  lang: "en" | "zh-TW"
): string {
  return [`${title}`, ...formatItems(items, lang)].join("\n");
}

export function renderThreadsDigest(
  digest: Digest,
  options: ThreadsRenderOptions = {}
): ThreadsRenderResult {
  const lang = normalizeLang(options.lang);
  const tone = options.tone ?? "calm";
  const includeMetrics = options.includeMetrics ?? true;

  const blocks: string[] = [];
  blocks.push(toneIntro(digest.date, tone, lang));

  if (includeMetrics) {
    blocks.push(
      lang === "zh-TW"
        ? `統計：完成 ${digest.stats.done}，進行中 ${digest.stats.inProgress}，阻塞 ${digest.stats.blocked}，今日到期 ${digest.stats.dueToday}`
        : `Stats: done ${digest.stats.done}, in progress ${digest.stats.inProgress}, blocked ${digest.stats.blocked}, due today ${digest.stats.dueToday}`
    );
  }

  blocks.push(sectionBlock(sectionTitle("due", lang), digest.sections.dueToday, lang));
  blocks.push(sectionBlock(sectionTitle("done", lang), digest.sections.done, lang));
  blocks.push(sectionBlock(sectionTitle("inProgress", lang), digest.sections.inProgress, lang));
  blocks.push(sectionBlock(sectionTitle("blocked", lang), digest.sections.blocked, lang));
  blocks.push(sectionBlock(sectionTitle("next", lang), digest.sections.next, lang));

  return { blocks };
}
