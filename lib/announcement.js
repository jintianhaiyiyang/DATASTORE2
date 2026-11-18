// Client-safe helpers for the site announcement.

const LEADING_NUMBER = /^(?:[（(]?\d{1,2}[）)]|\d{1,2}\s*[.、．:：]|\d{1,2}(?=\s))\s*/;

// Splits an announcement into list items.
// - One item per line when the admin used line breaks.
// - Otherwise detects inline numbering written as "1 … 2 … 3 …" (or "1. 2、"),
//   accepting only the next expected number so "24小时" is never a split.
export function splitAnnouncement(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  if (value.includes("\n")) {
    return value.split("\n").map((line) => line.trim().replace(LEADING_NUMBER, "")).filter(Boolean);
  }
  const marker = /(^|[\s。！!；;，,？?])[（(]?(\d{1,2})(?:[）)]|\s*[.、．:：]|(?=\s))\s*/g;
  const starts = [];
  let expected = 1;
  for (const match of value.matchAll(marker)) {
    if (Number(match[2]) !== expected) continue;
    const at = match.index + match[1].length;
    if (expected === 1 && at > 2) break;
    starts.push({ at, body: match.index + match[0].length });
    expected++;
  }
  if (starts.length < 2) return [value];
  return starts
    .map((start, i) => value.slice(start.body, i + 1 < starts.length ? starts[i + 1].at : undefined).trim())
    .filter(Boolean);
}
