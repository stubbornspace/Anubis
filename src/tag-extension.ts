import { Extension } from "@tiptap/core";

// Document attributes participate in undo without putting tags in editable text.
// Persistence remains Markdown; editor.ts projects these attributes to/from it.
export const NoteTags = Extension.create({
  name: "noteTags",
  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          noteTags: { default: null, rendered: false },
        },
      },
    ];
  },
});
