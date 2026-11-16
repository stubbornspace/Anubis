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

// Add to the final tag-only line, leaving existing inline tags in place.
// Removal is exact: removing work does not remove work/project.
export function changeNoteTag(markdown: string, input: string, remove = false) {
  const tag = input
    .trim()
    .replace(/^#/, "")
    .replace(/#$/, "")
    .trim()
    .normalize("NFC");
  const text = tagText(tag);
  if (!tag || tagsOf(text).length !== 1 || tagsOf(text)[0] !== tag)
    throw new Error(
      "Enter a valid tag, such as work/project or meeting notes.",
    );
  const ranges = tagRanges(markdown);
  if (remove) {
    let next = markdown;
    for (const range of ranges.reverse()) {
      if (range.tag === tag)
        next = next.slice(0, range.from) + next.slice(range.to);
    }
    return next;
  }
  if (ranges.some((range) => range.tag === tag)) return markdown;
  const end = markdown.trimEnd();
  const lineStart = end.lastIndexOf("\n") + 1;
  let lastLine = end.slice(lineStart);
  const lastTags = ranges.filter((range) => range.from >= lineStart);
  for (const range of lastTags.slice().reverse())
    lastLine =
      lastLine.slice(0, range.from - lineStart) +
      lastLine.slice(range.to - lineStart);
  const separator = !end
    ? ""
    : lastTags.length && !lastLine.trim()
      ? " "
      : "\n\n";
  const next = end + separator + text + "\n";
  if (!tagsOf(next).includes(tag))
    throw new Error(
      "Close the unfinished code block or Markdown syntax before adding a tag.",
    );
  return next;
}
