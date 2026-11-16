import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { tagRanges } from "./tags";
export const NoteTags = Extension.create<{
  active: () => boolean;
  select: (tag: string) => void;
  key: (event: KeyboardEvent) => boolean;
}>({
  name: "noteTags",
  addOptions: () => ({
    active: () => false,
    select: () => {},
    key: () => false,
  }),
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("noteTags"),
        props: {
          decorations(state) {
            if (!options.active()) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos, parent) => {
              if (node.type.name === "codeBlock") return false;
              if (
                !node.isText ||
                node.marks.some((m) => m.type.name === "code")
              )
                return;
              for (const range of tagRanges(node.text || "")) {
                if (range.from === 0 && parent && pos > 0) {
                  const before = state.doc.textBetween(
                    Math.max(0, pos - 1),
                    pos,
                  );
                  if (before && !/[\s(]/.test(before)) continue;
                }
                decorations.push(
                  Decoration.inline(pos + range.from, pos + range.to, {
                    class: "inline-note-tag",
                    "data-note-tag": range.tag,
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(_view, _pos, event) {
            const tag = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-note-tag]",
            )?.dataset.noteTag;
            if (tag && options.active()) {
              options.select(tag);
              return true;
            }
            return false;
          },
          handleKeyDown: (_view, event) =>
            options.active() && options.key(event),
        },
      }),
    ];
  },
});
