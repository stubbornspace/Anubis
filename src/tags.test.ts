import { describe, expect, it } from "vitest";
import { tagsOf, replaceTag } from "./tags";
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
