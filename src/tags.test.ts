import { describe, expect, it } from "vitest";
import { tagsOf, replaceTag, changeNoteTag } from "./tags";
describe("Markdown tags", () => {
  it("indexes nested and multiword tags without treating headings or code as tags", () => {
    expect(
      tagsOf(
        "# Heading\n\n#work/project #meeting notes# #work/project\n\\#escaped `#inline`\n```md\n#fenced\n```\n![#image](file.png) [#link](https://example.org)",
      ),
    ).toEqual(["meeting notes", "work/project"]);
  });
  it("renames complete tag paths and descendants without altering lookalikes", () => {
    expect(
      replaceTag("#work #work/project #worker `#work`", "work", "office"),
    ).toBe("#office #office/project #worker `#work`");
    expect(replaceTag("#work #work/project #worker", "work", null)).toBe(
      "  #worker",
    );
  });
});

it("ignores unfinished fences and indented code", () => {
  expect(tagsOf("#visible\n\n    #indented\n\n~~~md\n#unfinished")).toEqual([
    "visible",
  ]);
});

it("adds tags to a final tag line without moving existing inline tags", () => {
  expect(changeNoteTag("Text with #inline.\n\n#work\n", "meeting notes")).toBe(
    "Text with #inline.\n\n#work #meeting notes#\n",
  );
  expect(changeNoteTag("# Heading\n\nBody", "#work/project")).toBe(
    "# Heading\n\nBody\n\n#work/project\n",
  );
  expect(changeNoteTag("Text #work", "work")).toBe("Text #work");
  expect(changeNoteTag("", "cafe\u0301")).toBe("#café\n");
});

it("removes only the selected tag and preserves code, links, and descendants", () => {
  expect(
    changeNoteTag(
      "#work #work/project `#work` [#work](url) \\#work\n\n#work",
      "work",
      true,
    ),
  ).toBe(" #work/project `#work` [#work](url) \\#work\n\n");
});

it("rejects invalid tags and additions inside unclosed code blocks", () => {
  for (const tag of ["", "work//project", "work?", "a".repeat(513)])
    expect(() => changeNoteTag("Body", tag)).toThrow("Enter a valid tag");
  expect(() => changeNoteTag("```md\nexample", "work")).toThrow(
    "Close the unfinished",
  );
});
