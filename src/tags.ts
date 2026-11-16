// Tags are derived from Markdown, never a second source of note content.
export type TagRange = { tag: string; from: number; to: number };
export function tagRanges(markdown: string): TagRange[] {
  const ranges: TagRange[] = [];
  // Mask code, HTML, links and images without changing offsets.
  let fence: { char: string; length: number } | null = null;
  const codeMasked = markdown
    .split(/(?<=\n)/)
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      const mask = !!fence || !!marker || /^(?: {4}|\t)/.test(line);
      if (marker) {
        if (!fence) fence = { char: marker[1][0], length: marker[1].length };
        else if (
          marker[1][0] === fence.char &&
          marker[1].length >= fence.length &&
          !line.slice(marker[0].length).trim()
        )
          fence = null;
      }
      return mask ? line.replace(/[^\n]/g, " ") : line;
    })
    .join("");
  const masked = codeMasked.replace(
    /(`+)[^\n]*?\1|!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|<[^>]*>/g,
    (text) => text.replace(/[^\n]/g, " "),
  );
  const re =
    /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/ -]*?)#(?=$|[\s.,;:!?)])|(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
  for (const m of masked.matchAll(re)) {
    const tag = (m[2] ?? m[4]).trim().normalize("NFC");
    if (!tag || tag.length > 512 || tag.split("/").some((part) => !part.trim()))
      continue;
    const from = m.index! + (m[1] ?? m[3]).length;
    ranges.push({ tag, from, to: m.index! + m[0].length });
  }
  return ranges;
}
export const tagsOf = (markdown: string) =>
  [...new Set(tagRanges(markdown).map((r) => r.tag))].sort();
export const tagText = (tag: string) => `#${tag}${/\s/.test(tag) ? "#" : ""}`;
export function replaceTag(
  markdown: string,
  before: string,
  after: string | null,
) {
  let next = markdown;
  for (const range of tagRanges(markdown).reverse()) {
    if (range.tag !== before && !range.tag.startsWith(`${before}/`)) continue;
    const replacement =
      after === null ? "" : tagText(after + range.tag.slice(before.length));
    next = next.slice(0, range.from) + replacement + next.slice(range.to);
  }
  return next;
}
