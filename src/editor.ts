import type { Editor } from "@tiptap/core";
import { EditorState, Selection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { tagRanges, tagsOf, tagText } from "./tags";

export function noteEditorContent(markdown: string) {
  let body = markdown;
  for (const range of tagRanges(markdown).reverse())
    body = body.slice(0, range.from) + body.slice(range.to);
  return { body: body.trimEnd(), tags: tagsOf(markdown) };
}

function documentJSON(editor: Editor, markdown: string, notes: boolean) {
  const { body, tags } = notes
    ? noteEditorContent(markdown)
    : { body: markdown, tags: null };
  const json = editor.markdown!.parse(body);
  return { ...json, attrs: { ...json.attrs, noteTags: tags } };
}

export function setDocumentContent(
  editor: Editor,
  markdown: string,
  notes = false,
) {
  const json = documentJSON(editor, markdown, notes);
  editor
    .chain()
    .setContent(json, { emitUpdate: false })
    .command(({ tr }) => {
      tr.setDocAttribute("noteTags", json.attrs.noteTags);
      return true;
    })
    .run();
}

export function loadDocument(editor: Editor, markdown: string, notes = false) {
  setDocumentContent(editor, markdown, notes);
  // New plugin state keeps undo/redo within this document.
  const { doc, plugins } = editor.state;
  // Start in editable text, rather than preselecting a leading image before
  // image tools have mounted. A later click must be a real selection change.
  const selection =
    Selection.findFrom(doc.resolve(0), 1, true) ?? Selection.atStart(doc);
  editor.view.updateState(
    EditorState.create({ schema: editor.schema, doc, selection, plugins }),
  );
}

export function editorMarkdown(editor: Editor, notes = false) {
  let body = editor.getMarkdown();
  if (!notes) return body;
  // Hashtags typed in the formatted body are ordinary text, not tag commands.
  for (const range of tagRanges(body).reverse())
    body = body.slice(0, range.from) + "\\" + body.slice(range.from);
  const tags = (editor.state.doc.attrs.noteTags ?? []) as string[];
  return tags.length
    ? `${body.trimEnd()}${body.trim() ? "\n\n" : ""}${tags.map(tagText).join(" ")}\n`
    : body;
}

// Apply body and hidden tag changes together, retaining selection and undo.
export function editMarkdown(editor: Editor, markdown: string, notes = false) {
  if (!editor.markdown) return;
  const next = editor.schema.nodeFromJSON(
    documentJSON(editor, markdown, notes),
  );
  const current = editor.state.doc;
  let transaction = editor.state.tr;
  const start = current.content.findDiffStart(next.content);
  if (start !== null) {
    const end = current.content.findDiffEnd(next.content)!;
    const overlap = start - Math.min(end.a, end.b);
    const oldEnd = overlap > 0 ? end.a + overlap : end.a;
    const newEnd = overlap > 0 ? end.b + overlap : end.b;
    transaction = transaction.replace(start, oldEnd, next.slice(start, newEnd));
  }
  if (
    notes &&
    JSON.stringify(current.attrs.noteTags) !==
      JSON.stringify(next.attrs.noteTags)
  )
    transaction.setDocAttribute("noteTags", next.attrs.noteTags);
  if (transaction.steps.length) editor.view.dispatch(closeHistory(transaction));
}
