import { createPortal } from "react-dom";
import { MoreHorizontal, Pin, Archive, Trash2, Undo2 } from "lucide-react";
import { interfaceScale } from "./platform";
import { useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { library, type Note } from "./library";
export function LibraryTools({ busy }: { busy: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <fieldset>
      <legend>Note library</legend>
      <p>
        Notes save on this device. A library backup includes images, Trash,
        drafts, and revision history. Importing a backup adds copies and keeps
        existing notes.
      </p>
      <div className="library-dialog-actions">
        <button disabled={busy} onClick={() => void library.export()}>
          Back up library
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          Import notes or backup
        </button>
      </div>
      <input
        hidden
        ref={file}
        type="file"
        accept=".md,.markdown,.mdown,.txt,.json"
        multiple
        onChange={async (e) => {
          const files = [...(e.target.files || [])];
          e.target.value = "";
          setError("");
          try {
            for (const f of files) {
              if (f.size > (f.name.endsWith(".json") ? 256 : 10) * 1024 * 1024)
                throw new Error("This file exceeds the import size limit.");
              const text = await f.text();
              const ok = f.name.endsWith(".json")
                ? await library.importBackup(text)
                : await library.create(undefined, text);
              if (!ok) break;
            }
          } catch (e) {
            setError(String(e));
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
export function NoteHistory({
  id,
  busy,
  onActivate,
  onClose,
}: {
  id: string;
  busy: boolean;
  onActivate?: () => void;
  onClose?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<Note[]>([]);
  const [error, setError] = useState("");
  return (
    <>
      <button
        ref={button}
        disabled={busy}
        onClick={async () => {
          onActivate?.();
          if (!(await library.save())) return;
          try {
            setHistory(
              await invoke<Note[]>("library_call", {
                request: { op: "history", id },
              }),
            );
            setError("");
            dialog.current?.showModal();
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        History
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="settings-dialog"
          aria-label="Note history"
          onClose={() => (onClose ? onClose() : button.current?.focus())}
        >
          <div className="settings-heading">
            <h2>Note history</h2>
            <button autoFocus onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          <p>Restoring keeps the current version in history.</p>
          {history.map((n) => (
            <details key={n.revision}>
              <summary>
                Version {n.revision} · {new Date(n.updated).toLocaleString()}
              </summary>
              <pre className="revision-preview">{n.markdown}</pre>
              <button
                disabled={busy}
                onClick={async () => {
                  if (await library.restoreRevision(n.markdown))
                    dialog.current?.close();
                }}
              >
                Restore version {n.revision}
              </button>
            </details>
          ))}
          {!history.length && <p>No previous versions yet.</p>}
        </dialog>,
        document.body,
      )}
      {error && <span role="alert">{error}</span>}
    </>
  );
}

export function NoteActions({ note, busy }: { note: Note; busy: boolean }) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const focusTrigger = () => trigger.current?.focus();
  const close = () => {
    popup.current?.hidePopover();
    focusTrigger();
  };
  const place = () => {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setPosition({
      top: Math.max(
        8,
        Math.min(rect.bottom + 4, innerHeight - popup.current.offsetHeight - 8),
      ),
      left: Math.max(
        8,
        Math.min(
          rect.right - (popup.current.offsetWidth || 180 * interfaceScale()),
          innerWidth - popup.current.offsetWidth - 8,
        ),
      ),
    });
  };
  return (
    <span className="note-options">
      <button
        ref={trigger}
        title="Note actions"
        aria-label="Note actions"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        disabled={busy}
        onClick={place}
      >
        <MoreHorizontal size={17} />
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        className="file-menu note-menu"
        style={position}
        onToggle={(event) => {
          const opened = event.newState === "open";
          setOpen(opened);
          if (opened) {
            place();
            popup.current
              ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
              ?.focus();
          }
        }}
        onKeyDown={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const buttons = [
              ...(popup.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) || []),
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
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }
        }}
      >
        <NoteHistory
          id={note.id}
          busy={busy || note.trashed}
          onActivate={close}
          onClose={focusTrigger}
        />
        <button
          disabled={busy}
          onClick={() => {
            close();
            void library.export(note.id);
          }}
        >
          Export
        </button>
        <button
          disabled={busy || note.trashed}
          onClick={() => {
            close();
            void library.change({ pinned: !note.pinned });
          }}
        >
          <Pin size={16} />
          {note.pinned ? "Unpin note" : "Pin note"}
        </button>
        <button
          disabled={busy || note.trashed}
          onClick={() => {
            close();
            void library.change({ archived: !note.archived });
          }}
        >
          <Archive size={16} />
          {note.archived ? "Unarchive note" : "Archive note"}
        </button>
        <button
          disabled={busy}
          className={note.trashed ? undefined : "danger"}
          onClick={() => {
            close();
            void library.change({ trashed: !note.trashed });
          }}
        >
          {note.trashed ? <Undo2 size={16} /> : <Trash2 size={16} />}
          {note.trashed ? "Restore note" : "Trash note"}
        </button>
      </div>
    </span>
  );
}
