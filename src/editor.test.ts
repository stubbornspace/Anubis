// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { loadDocument, editMarkdown, editorMarkdown } from "./editor";
import { NoteTags } from "./tag-extension";
const extensions = [
  NoteTags,
  StarterKit,
  Markdown,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
];
describe("Markdown document integrity", () => {
  it("clears undo and redo across document loads without emitting edits", () => {
    const updates: string[] = [];
    const editor = new Editor({
      extensions,
      content: "",
      onUpdate: ({ editor }) => updates.push(editor.getMarkdown()),
    });
    loadDocument(editor, "# First");
    editor.commands.insertContent(" edited");
    editor.commands.undo();
    expect(editor.can().redo()).toBe(true);
    updates.length = 0;
    loadDocument(editor, "# Second");
    expect(editor.can().undo()).toBe(false);
    expect(editor.can().redo()).toBe(false);
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.getText().trim()).toBe("Second");
    expect(updates).toEqual([]);
    editor.commands.insertContent("New edit ");
    expect(editor.can().undo()).toBe(true);
    editor.commands.undo();
    expect(editor.getText().trim()).toBe("Second");
    editor.destroy();
  });
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

it("tag edits preserve selection and give each action its own undo step", () => {
  const editor = new Editor({
    extensions,
    content: "A **bold** thought.",
    contentType: "markdown",
  });
  editor.commands.setTextSelection({ from: 3, to: 7 });
  const selection = editor.state.selection.toJSON();
  const original = editor.getJSON();
  editMarkdown(editor, editor.getMarkdown() + "\n\n#work/project");
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(editor.getHTML()).toContain("<strong>bold</strong>");
  const firstTag = editor.getJSON();
  editMarkdown(editor, editor.getMarkdown() + " #meeting notes#");
  editor.commands.undo();
  expect(editor.getJSON()).toEqual(firstTag);
  editor.commands.undo();
  expect(editor.getJSON()).toEqual(original);
  editor.commands.redo();
  expect(editor.getJSON()).toEqual(firstTag);
  editor.destroy();
});

it("keeps tags outside editable text, including select-all replacement and tag undo", () => {
  const updates: string[] = [];
  const editor = new Editor({
    extensions,
    onUpdate: ({ editor }) => updates.push(editorMarkdown(editor, true)),
  });
  loadDocument(
    editor,
    "# Heading\n\nBody #legacy\n\n#work/project #meeting notes#",
    true,
  );
  expect(updates).toEqual([]);
  expect(editor.getText()).not.toContain("#legacy");
  expect(editor.getText()).not.toContain("#work/project");
  expect(editor.state.doc.attrs.noteTags).toEqual([
    "legacy",
    "meeting notes",
    "work/project",
  ]);
  editor.commands.selectAll();
  editor.commands.insertContent("Replacement body");
  expect(editorMarkdown(editor, true)).toBe(
    "Replacement body\n\n#legacy #meeting notes# #work/project\n",
  );
  editor.commands.setTextSelection(4);
  const selection = editor.state.selection.toJSON();
  editMarkdown(editor, "Replacement body\n\n#work/project", true);
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(editor.getText()).toBe("Replacement body");
  expect(editorMarkdown(editor, true)).toBe(
    "Replacement body\n\n#work/project\n",
  );
  editor.commands.undo();
  expect(editorMarkdown(editor, true)).toContain("#meeting notes#");
  expect(editor.getText()).toBe("Replacement body");
  editor.commands.redo();
  expect(editorMarkdown(editor, true)).not.toContain("#meeting notes#");
  loadDocument(editor, "Document #work/project", false);
  expect(editor.getText()).toBe("Document #work/project");
  expect(editor.state.doc.attrs.noteTags).toBeNull();
  editor.destroy();
});

it("preserves literal hashtags, code, links and image references while hiding legacy tags", () => {
  const editor = new Editor({ extensions });
  loadDocument(
    editor,
    "Literal \\#text and `#code` [#link](https://example.com)\n\n#hidden",
    true,
  );
  expect(editor.getText()).toContain("Literal #text");
  expect(editor.getText()).toContain("#code");
  expect(editor.getText()).toContain("#link");
  expect(editorMarkdown(editor, true)).toContain("\\#text");
  expect(editorMarkdown(editor, true)).toContain("`#code`");
  expect(editorMarkdown(editor, true)).toContain(
    "[#link](https://example.com)",
  );
  loadDocument(editor, "", true);
  editor.commands.insertContent("Typing #ordinary");
  const saved = editorMarkdown(editor, true);
  expect(saved).toBe("Typing \\#ordinary");
  loadDocument(editor, saved, true);
  expect(editor.getText()).toBe("Typing #ordinary");
  expect(editor.state.doc.attrs.noteTags).toEqual([]);
  editor.destroy();
});

it("supports tags on an otherwise empty note without exposing an editable tag line", () => {
  const editor = new Editor({ extensions });
  loadDocument(editor, "", true);
  editMarkdown(editor, "#work\n", true);
  expect(editor.getText()).toBe("");
  expect(editorMarkdown(editor, true)).toBe("#work\n");
  editor.commands.selectAll();
  editor.commands.deleteSelection();
  expect(editorMarkdown(editor, true)).toBe("#work\n");
  editor.commands.insertContent("New body");
  expect(editorMarkdown(editor, true)).toBe("New body\n\n#work\n");
  editor.destroy();
});
