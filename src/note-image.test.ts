// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { NoteImage } from "./note-image";
describe("image geometry persistence", () => {
  it("round trips crop and size without changing the original source or title", () => {
    const first = new Editor({
      extensions: [StarterKit, Markdown, NoteImage],
      content: "",
    });
    first.commands.setImage({
      src: "anubis-asset:" + "a".repeat(64),
      alt: 'A "photo"',
      title: "Original",
    });
    first.commands.updateAttributes("image", {
      width: 320,
      cropleft: 20,
      cropbottom: 10,
    });
    const markdown = first.getMarkdown();
    expect(markdown).toContain('width="320"');
    const second = new Editor({
      extensions: [StarterKit, Markdown, NoteImage],
      content: markdown,
      contentType: "markdown",
    });
    const image = second
      .getJSON()
      .content?.find((node) => node.type === "image");
    expect(image?.attrs).toMatchObject({
      width: 320,
      cropleft: 20,
      cropbottom: 10,
      title: "Original",
      src: "anubis-asset:" + "a".repeat(64),
    });
    first.destroy();
    second.destroy();
  });
});
