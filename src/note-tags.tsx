import { createPortal } from "react-dom";
import {
  type CSSProperties,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Tags, X } from "lucide-react";
import { changeNoteTag } from "./tags";
import type { Note } from "./library";

export function NoteTagPicker({
  note,
  suggestions,
  busy,
  onChange,
}: {
  note: Note;
  suggestions: string[];
  busy: boolean;
  onChange: (markdown: string) => void;
}) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CSSProperties>({ top: 0, left: 0 });
  const matches = [...new Set(suggestions)]
    .filter(
      (tag) =>
        !note.tags.includes(tag) &&
        tag
          .toLocaleLowerCase()
          .includes(value.trim().replace(/^#/, "").toLocaleLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);
  const close = () => {
    popup.current?.hidePopover();
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!popup.current?.matches(":popover-open") || !trigger.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const gap =
        parseFloat(getComputedStyle(document.documentElement).fontSize) / 2;
      const maxWidth = Math.max(0, (viewport?.width ?? innerWidth) - gap * 2);
      const maxHeight = Math.max(
        0,
        (viewport?.height ?? innerHeight) - gap * 2,
      );
      setPosition({
        maxWidth,
        maxHeight,
        left: Math.max(
          left + gap,
          Math.min(
            rect.right - popup.current.offsetWidth,
            left +
              gap +
              maxWidth -
              Math.min(popup.current.offsetWidth, maxWidth),
          ),
        ),
        top: Math.max(
          top + gap,
          Math.min(
            rect.bottom + gap,
            top +
              gap +
              maxHeight -
              Math.min(popup.current.offsetHeight, maxHeight),
          ),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);
  const change = (tag: string, remove = false) => {
    if (busy) return;
    try {
      onChange(changeNoteTag(note.markdown, tag, remove));
      setValue("");
      setError("");
      input.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <button
        ref={trigger}
        aria-label="Tags"
        title="Tags"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        popoverTarget={id}
        disabled={busy}
      >
        <Tags size={16} />
      </button>
      {createPortal(
        <div
          ref={popup}
          id={id}
          popover="auto"
          role="dialog"
          aria-label="Tags"
          className="note-tags-popover"
          style={position}
          onToggle={(event) => {
            const visible = event.newState === "open";
            setOpen(visible);
            if (visible) {
              setError("");
              setValue("");
              input.current?.focus();
            } else if (popup.current?.contains(document.activeElement))
              trigger.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="note-tags-heading">
            <strong>Tags</strong>
            <button aria-label="Close tags" title="Close tags" onClick={close}>
              <X size={16} />
            </button>
          </div>
          <div className="note-tag-chips" aria-label="Assigned tags">
            {note.tags.map((tag) => (
              <span className="note-tag-chip" key={tag}>
                <span>{tag}</span>
                <button
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove tag ${tag}`}
                  disabled={busy}
                  onClick={() => change(tag, true)}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
            {!note.tags.length && (
              <span className="note-tags-hint">No tags yet.</span>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              change(value);
            }}
          >
            <label htmlFor={`${id}-input`}>Add tag</label>
            <div className="note-tag-input-row">
              <input
                id={`${id}-input`}
                ref={input}
                value={value}
                placeholder="work/project"
                maxLength={514}
                disabled={busy}
                autoComplete="off"
                onChange={(event) => {
                  setValue(event.target.value);
                  setError("");
                }}
              />
              <button type="submit" disabled={busy || !value.trim()}>
                Add
              </button>
            </div>
          </form>
          {!!matches.length && (
            <div
              className="note-tag-suggestions"
              role="group"
              aria-label="Suggested tags"
            >
              {matches.map((tag) => (
                <button key={tag} disabled={busy} onClick={() => change(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          )}
          <p className="note-tags-hint">
            Tags stay out of the writing area and are included in Markdown
            source and exports.
          </p>
          {error && <p role="alert">{error}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
