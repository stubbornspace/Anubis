// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
const extensions = [
  StarterKit,
  Markdown,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
];
describe("Markdown document integrity", () => {
  it("preserves headings, marks, task state, code and tables through a source round trip", () => {
    const md =
      "# Title\n\nA **bold** and *italic* thought.\n\n- [x] Finished\n- [ ] Pending\n\n```js\nconst n = 3;\n```\n\n| Key | Value |\n| --- | --- |\n| a | b |";
    const first = new Editor({
      extensions,
      content: md,
      contentType: "markdown",
    });
    const second = new Editor({
      extensions,
      content: first.getMarkdown(),
      contentType: "markdown",
    });
    expect(second.getJSON()).toEqual(first.getJSON());
    expect(second.getHTML()).toContain("<strong>bold</strong>");
    expect(second.getHTML()).toContain('data-checked="true"');
    expect(second.getHTML()).toContain("<table");
    first.destroy();
    second.destroy();
  });
  it("does not execute imported script markup", () => {
    const e = new Editor({
      extensions,
      content: "# Test\n\n<script>alert(1)</script>",
      contentType: "markdown",
    });
    expect(e.getHTML()).not.toContain("<script>");
    e.destroy();
  });
});
