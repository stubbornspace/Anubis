import { createPortal } from "react-dom";
import { History, Download, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { library, type Note } from "./library";
export function LibraryTools({ busy }: { busy: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <fieldset>
      <legend>Note library</legend>
      <p>
        Notes save on this device. A library backup includes images, drafts, and
        revision history. Importing a backup adds copies and keeps existing
        notes.
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
export function NoteHistory({ id, busy }: { id: string; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<Note[]>([]);
  const [error, setError] = useState("");
  return (
    <>
      <button
        ref={button}
        aria-label="History"
        title="History"
        disabled={busy}
        onClick={async () => {
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
        <History size={16} />
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="settings-dialog"
          aria-label="Note history"
          onClose={() => button.current?.focus()}
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
  const deleteButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <NoteHistory id={note.id} busy={busy} />
      <button
        aria-label="Export"
        title="Export"
        disabled={busy}
        onClick={() => void library.export(note.id)}
      >
        <Download size={16} />
      </button>
      <button
        ref={deleteButton}
        aria-label="Delete note"
        title="Delete note"
        disabled={busy}
        onClick={() => {
          void library.remove().then(() =>
            requestAnimationFrame(() => {
              if (!deleteButton.current?.isConnected)
                document
                  .querySelector<HTMLButtonElement>(
                    'button[aria-label="Toggle sidebar"]',
                  )
                  ?.focus();
            }),
          );
        }}
      >
        <Trash2 size={16} />
      </button>
    </>
  );
}
