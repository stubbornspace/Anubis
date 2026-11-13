import type { Editor } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";

export function loadDocument(editor: Editor, markdown: string) {
  editor.commands.setContent(markdown, {
    contentType: "markdown",
    emitUpdate: false,
  });
  // Suppressing updates does not clear history. New plugin state keeps undo/redo
  // within this document without making the load itself an undoable edit.
  const { doc, selection, plugins } = editor.state;
  editor.view.updateState(
    EditorState.create({ schema: editor.schema, doc, selection, plugins }),
  );
}
