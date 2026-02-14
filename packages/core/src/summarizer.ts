import type { Event, WorkItem } from "./types.js";

function firstSentence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const sentence = trimmed.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? trimmed;
  return sentence.trim();
}

function latestSignalEvent(events: Event[]): Event | undefined {
  return [...events]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .find((event) => event.body || event.title);
}

export function summarizeWorkItem(item: WorkItem, maxHighlights = 3): string[] {
  const highlights: string[] = [];

  if (item.title.trim().length > 0) {
    highlights.push(firstSentence(item.title));
  }

  const latest = latestSignalEvent(item.evidence);
  if (latest?.body) {
    highlights.push(firstSentence(latest.body));
  } else if (latest?.title) {
    highlights.push(firstSentence(latest.title));
  }

  const unique = Array.from(new Set(highlights.filter((h) => h.length > 0)));
  return unique.slice(0, maxHighlights);
}

