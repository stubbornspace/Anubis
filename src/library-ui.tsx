import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FilePlus,
  Hash,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import { library, type LibraryState, type NoteSummary } from "./library";
import { interfaceScale } from "./platform";
export type LibraryView =
  | "all"
  | "untagged"
  | "today"
  | "todo"
  | "pinned"
  | "archive"
  | "trash"
  | `tag:${string}`;
const views: [LibraryView, string][] = [
  ["all", "All Notes"],
  ["untagged", "Untagged"],
  ["today", "Today"],
  ["todo", "To-do"],
  ["pinned", "Pinned"],
  ["archive", "Archive"],
  ["trash", "Trash"],
];
export const viewTitle = (view: LibraryView) =>
  view.startsWith("tag:")
    ? view.slice(4)
    : (views.find(([id]) => id === view)?.[1] ?? "All Notes");
export function matchesView(note: NoteSummary, view: LibraryView) {
  if (view === "trash") return note.trashed;
  if (note.trashed) return false;
  if (view === "archive") return note.archived;
  if (note.archived) return false;
  if (view.startsWith("tag:"))
    return note.tags.some(
      (tag) => tag === view.slice(4) || tag.startsWith(`${view.slice(4)}/`),
    );
  if (view === "untagged") return !note.tags.length;
  if (view === "pinned") return note.pinned;
  if (view === "todo") return note.todo;
  if (view === "today")
    return new Date(note.created).toDateString() === new Date().toDateString();
  return true;
}
export function LibrarySidebar({
  state,
  view,
  select,
}: {
  state: LibraryState;
  view: LibraryView;
  select: (view: LibraryView) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(JSON.parse(localStorage.getItem("kronos.expandedTags") || "[]")),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (editing !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  const tags = [
    ...new Set(
      state.notes
        .filter((n) => !n.trashed && !n.archived)
        .flatMap((n) =>
          n.tags.flatMap((tag) =>
            tag
              .split("/")
              .map((_, i, parts) => parts.slice(0, i + 1).join("/")),
          ),
        ),
    ),
  ];
  const tree = (parent = "", depth = 0): React.ReactNode =>
    tags
      .filter(
        (tag) =>
          tag.slice(0, tag.lastIndexOf("/") + 1) ===
          (parent ? `${parent}/` : ""),
      )
      .sort(
        (a, b) =>
          Number(state.pinnedTags.includes(b)) -
            Number(state.pinnedTags.includes(a)) || a.localeCompare(b),
      )
      .map((tag) => {
        const children = tags.some((t) => t.startsWith(`${tag}/`));
        return (
          <div key={tag}>
            <div
              className="library-tag-row"
              style={{ paddingLeft: `${depth * 0.75}rem` }}
            >
              {children ? (
                <button
                  aria-label={`${expanded.has(tag) ? "Collapse" : "Expand"} tag ${tag}`}
                  aria-expanded={expanded.has(tag)}
                  onClick={() => {
                    const next = new Set(expanded);
                    if (next.has(tag)) next.delete(tag);
                    else next.add(tag);
                    setExpanded(next);
                    localStorage.setItem(
                      "kronos.expandedTags",
                      JSON.stringify([...next]),
                    );
                  }}
                >
                  {expanded.has(tag) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ) : (
                <Hash size={14} />
              )}
              <button
                className="tag-select"
                aria-current={view === `tag:${tag}` ? "page" : undefined}
                onClick={() => select(`tag:${tag}`)}
                title={tag}
              >
                {tag.split("/").pop()}
                {state.pinnedTags.includes(tag) && <Pin size={12} />}
              </button>
              <button
                title={`Edit tag ${tag}`}
                aria-label={`Edit tag ${tag}`}
                onClick={(e) => {
                  trigger.current = e.currentTarget;
                  setEditing(tag);
                  setName(tag);
                }}
              >
                …
              </button>
            </div>
            {expanded.has(tag) && tree(tag, depth + 1)}
          </div>
        );
      });
  return (
    <>
      <nav
        className="library-navigation"
        aria-label="Note library"
        inert={state.busy}
      >
        {views.map(([id, title]) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => select(id)}
          >
            {id === "archive" ? (
              <Archive size={15} />
            ) : id === "trash" ? (
              <Trash2 size={15} />
            ) : id === "pinned" ? (
              <Pin size={15} />
            ) : null}
            <span>{title}</span>
            <small>
              {state.notes.filter((n) => matchesView(n, id)).length}
            </small>
          </button>
        ))}
        <h2>Tags</h2>
        {tree()}
        {!tags.length && (
          <p className="empty">
            Type #tags in a note to organize your library.
          </p>
        )}
      </nav>
      {(state.sync === "synced" || state.sync === "syncing") && (
        <p className="library-sync">
          {state.sync === "synced"
            ? "Synced with iCloud"
            : "Syncing with iCloud…"}
        </p>
      )}
      <dialog
        ref={dialog}
        className="settings-dialog"
        aria-label="Edit tag"
        onClose={() => {
          setEditing(null);
          trigger.current?.focus();
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (editing && (await library.renameTag(editing, name.trim()))) {
              select(`tag:${name.trim()}`);
              setEditing(null);
            }
          }}
        >
          <div className="settings-heading">
            <h2>Edit tag</h2>
            <button
              type="button"
              aria-label="Close tag settings"
              title="Close"
              onClick={() => setEditing(null)}
            >
              <X size={18} />
            </button>
          </div>
          <label>
            Tag name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="library-dialog-actions">
            <button type="submit" disabled={state.busy || !name.trim()}>
              Rename
            </button>
            <button
              type="button"
              disabled={state.busy}
              onClick={() => editing && void library.pinTag(editing)}
            >
              Toggle pin
            </button>
            <button
              type="button"
              disabled={state.busy}
              onClick={async () => {
                if (
                  editing &&
                  (await confirm(
                    "Remove this tag and its subtags from all notes? Notes will be kept.",
                    { title: "Remove tag", kind: "warning" },
                  ))
                ) {
                  if (await library.renameTag(editing, null)) {
                    select("all");
                    setEditing(null);
                  }
                }
              }}
            >
              Remove tag
            </button>
          </div>
          {state.error && <p role="alert">{state.error}</p>}
        </form>
      </dialog>
    </>
  );
}
export function NoteList({
  state,
  view,
  onOpen,
  onCreate,
}: {
  state: LibraryState;
  view: LibraryView;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchIds, setSearchIds] = useState<string[] | null>(null);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    let active = true;
    if (!query) {
      setSearchIds(null);
      setSearchError("");
      return;
    }
    const timer = setTimeout(() => {
      void invoke<string[]>("library_call", {
        request: { op: "search", query },
      })
        .then((ids) => {
          if (active) {
            setSearchIds(ids);
            setSearchError("");
          }
        })
        .catch((e) => {
          if (active) setSearchError(String(e));
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, state.notes]);
  const [sort, setSort] = useState(
    localStorage.getItem("kronos.noteSort") || "updated",
  );
  const [width, setWidth] = useState(() =>
    Math.max(
      220,
      Math.min(
        400,
        Number(localStorage.getItem("kronos.noteListWidth")) || 270,
      ),
    ),
  );
  const drag = useRef<{ x: number; width: number } | null>(null);
  const changeWidth = (value: number) => {
    const next = Math.max(220, Math.min(400, value));
    setWidth(next);
    localStorage.setItem("kronos.noteListWidth", String(next));
  };
  const notes = state.notes
    .filter(
      (n) => matchesView(n, view) && (!query || searchIds?.includes(n.id)),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "created"
            ? b.created - a.created
            : b.updated - a.updated),
    );
  return (
    <section
      className="note-list"
      aria-label="Notes"
      style={{ width: `${width / 16}rem` }}
    >
      <div className="note-list-heading">
        <strong>{viewTitle(view)}</strong>
        <button
          aria-label="New note"
          title="New note"
          disabled={state.busy || !state.ready || view === "trash"}
          onClick={onCreate}
        >
          <FilePlus size={18} />
        </button>
      </div>
      <input
        className="note-search"
        aria-label="Search notes"
        placeholder="Search notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searchError && <p role="alert">{searchError}</p>}
      <label className="note-sort">
        Sort by{" "}
        <select
          aria-label="Sort notes"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            localStorage.setItem("kronos.noteSort", e.target.value);
          }}
        >
          <option value="updated">Last edited</option>
          <option value="created">Created</option>
          <option value="title">Title</option>
        </select>
      </label>
      <div
        className="note-list-scroll"
        onScroll={(e) =>
          sessionStorage.setItem(
            `kronos.noteScroll:${view}`,
            String(e.currentTarget.scrollTop),
          )
        }
        ref={(el) => {
          if (el)
            el.scrollTop =
              Number(sessionStorage.getItem(`kronos.noteScroll:${view}`)) || 0;
        }}
      >
        {notes.map((n) => (
          <button
            key={n.id}
            className="note-card"
            aria-current={state.note?.id === n.id ? "page" : undefined}
            onClick={() => onOpen(n.id)}
            disabled={state.busy}
          >
            {n.thumbnail && <Thumbnail id={n.thumbnail} />}
            <strong>
              {n.pinned && <Pin size={12} />} {n.title || "Untitled note"}
            </strong>
            <span>{n.excerpt || "Empty note"}</span>
            <small>
              {new Date(n.updated).toLocaleDateString()}
              {n.tags.length
                ? ` · ${n.tags.map((t) => `#${t}`).join(" ")}`
                : ""}
            </small>
          </button>
        ))}
        {!notes.length && (
          <p className="empty">
            {query ? "No matching notes." : "No notes here yet."}
          </p>
        )}
      </div>
      <div
        className="note-list-resizer"
        role="separator"
        aria-label="Resize note list"
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={400}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          drag.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            changeWidth(
              drag.current.width +
                (e.clientX - drag.current.x) / interfaceScale(),
            );
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            changeWidth(
              e.key === "Home"
                ? 220
                : e.key === "End"
                  ? 400
                  : width + (e.key === "ArrowRight" ? 10 : -10),
            );
          }
        }}
      />
    </section>
  );
}

function Thumbnail({ id }: { id: string }) {
  const element = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void invoke<string>("library_call", { request: { op: "getAsset", id } })
        .then((url) => {
          if (active) setSrc(url);
        })
        .catch(() => {});
    });
    if (element.current) observer.observe(element.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [id]);
  return <img ref={element} src={src} alt="" className="note-thumbnail" />;
}
