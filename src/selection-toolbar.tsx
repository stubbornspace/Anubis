import { NodeSelection } from "@tiptap/pm/state";
import { useEffect, useRef } from "react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Italic, List, Quote, Table, Heading2 } from "lucide-react";

export function SelectionToolbar({ editor }: { editor: Editor }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !editor.state.selection.empty &&
        menu.current &&
        getComputedStyle(menu.current).visibility !== "hidden" &&
        menu.current.getBoundingClientRect().width
      ) {
        event.preventDefault();
        menu.current.querySelector<HTMLButtonElement>("button")?.focus();
      }
      if (event.key === "Escape" && !editor.state.selection.empty) {
        editor.commands.setTextSelection(editor.state.selection.to);
      }
    };
    editor.view.dom.addEventListener("keydown", onKey);
    return () => editor.view.dom.removeEventListener("keydown", onKey);
  }, [editor]);
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: active, state, element, view }) =>
        active.isEditable &&
        !(state.selection instanceof NodeSelection) &&
        !state.selection.empty &&
        !!state.doc
          .textBetween(state.selection.from, state.selection.to)
          .trim() &&
        (view.hasFocus() || element.contains(document.activeElement))
      }
      className="selection-toolbar-anchor"
      updateDelay={0}
      options={{
        placement: "top",
        offset: 8,
        shift: { padding: 8 },
        flip: true,
      }}
    >
      <div
        ref={menu}
        className="selection-toolbar"
        role="toolbar"
        aria-label="Text formatting"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            editor
              .chain()
              .focus()
              .setTextSelection(editor.state.selection.to)
              .run();
          }
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button",
              ),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <button
          title="Bold (⌘B)"
          aria-label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </button>
        <button
          title="Italic (⌘I)"
          aria-label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </button>
        <button
          title="Heading"
          aria-label="Heading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={16} />
        </button>
        <button
          title="Bullet list"
          aria-label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </button>
        <button
          title="Quote"
          aria-label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={15} />
        </button>
        <button
          title="Insert table"
          aria-label="Insert table"
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <Table size={15} />
        </button>
      </div>
    </BubbleMenu>
  );
}
