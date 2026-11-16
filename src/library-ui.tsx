import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Hash,
} from "lucide-react";
import { type LibraryState, type NoteSummary } from "./library";
export type LibraryView = "all" | `tag:${string}`;

function parents(tag: string) {
  return tag.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/"));
}
function storedExpanded(): Set<string> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("kronos.expandedTags") || "[]",
    );
    return new Set(
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}
export function NoteList({
  state,
  view,
  onOpen,
  onCreate,
  select,
}: {
  state: LibraryState;
  view: LibraryView;
  onOpen: (id: string) => void;
  onCreate: () => void;
  select: (view: LibraryView) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchIds, setSearchIds] = useState<string[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [rootOpen, setRootOpen] = useState(
    () => localStorage.getItem("kronos.notesRootExpanded") !== "false",
  );
  const [expanded, setExpanded] = useState(storedExpanded);
  const rootButton = useRef<HTMLButtonElement>(null);
  const tree = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const previousNote = useRef<string | undefined>(undefined);
  const previousView = useRef(view);
  const saveExpanded = (next: Set<string>) => {
    setExpanded(next);
    localStorage.setItem("kronos.expandedTags", JSON.stringify([...next]));
  };
  const changeRoot = (open: boolean) => {
    setRootOpen(open);
    localStorage.setItem("kronos.notesRootExpanded", String(open));
  };
  const toggle = (tag: string, open = !expanded.has(tag)) => {
    const next = new Set(expanded);
    if (open) next.add(tag);
    else next.delete(tag);
    saveExpanded(next);
  };
  const activePath = state.note
    ? `${state.note.id}:${JSON.stringify(state.note.tags)}`
    : "";
  useEffect(() => {
    if (!state.ready || state.busy) return;
    const previous = previousNote.current;
    previousNote.current = activePath;
    // Preserve collapsed branches on relaunch, but reveal notes selected/created
    // during this session, including when typing adds a new tag.
    if (previous === undefined || previous === activePath || !state.note)
      return;
    changeRoot(true);
    setExpanded((current) => {
      const next = new Set(current);
      state.note!.tags.flatMap(parents).forEach((tag) => next.add(tag));
      localStorage.setItem("kronos.expandedTags", JSON.stringify([...next]));
      return next;
    });
  }, [activePath, state.ready, state.busy]);
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    if (previous === view || !view.startsWith("tag:")) return;
    changeRoot(true);
    setExpanded((current) => {
      const next = new Set(current);
      parents(view.slice(4)).forEach((tag) => next.add(tag));
      localStorage.setItem("kronos.expandedTags", JSON.stringify([...next]));
      return next;
    });
  }, [view]);
  useEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop =
        Number(sessionStorage.getItem("kronos.noteTreeScroll")) || 0;
  }, []);
  useEffect(() => {
    let active = true;
    setSearchIds(null);
    setSearchError("");
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void invoke<string[]>("library_call", {
        request: { op: "search", query: query.trim() },
      })
        .then((ids) => {
          if (active) setSearchIds(ids);
        })
        .catch((error) => {
          if (active) setSearchError(String(error));
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, state.notes]);
  const notes = [...state.notes].sort(
    (a, b) =>
      a.title.localeCompare(b.title, undefined, {
        numeric: true,
        sensitivity: "base",
      }) || a.id.localeCompare(b.id),
  );
  const tags = [
    ...new Set(notes.flatMap((note) => note.tags.flatMap(parents))),
  ].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  const searching = !!query.trim();
  const noteRow = (note: NoteSummary, depth: number, parent: string) => (
    <div
      key={note.id}
      className={`file-row note-row ${state.note?.id === note.id ? "active" : ""}`}
      style={{ marginLeft: `${(depth * 14) / 16}rem` }}
    >
      <button
        className="file-open"
        data-note-node
        data-parent={parent}
        aria-current={state.note?.id === note.id ? "page" : undefined}
        title={[
          note.title || "Untitled note",
          ...note.tags.map((tag) => `#${tag}`),
        ].join(" · ")}
        disabled={state.busy}
        onClick={() => onOpen(note.id)}
      >
        <FileText size={16} />
        <span>{note.title || "Untitled note"}</span>
      </button>
    </div>
  );
  const branches = (parent = "", depth = 1): React.ReactNode => (
    <>
      {tags
        .filter(
          (tag) =>
            tag.slice(0, tag.lastIndexOf("/") + 1) ===
            (parent ? `${parent}/` : ""),
        )
        .map((tag) => {
          const open = expanded.has(tag);
          return (
            <div key={tag}>
              <div
                className={`folder-row ${view === `tag:${tag}` ? "selected-folder" : ""}`}
                style={{ paddingLeft: `${(4 + depth * 14) / 16}rem` }}
              >
                <button
                  className="folder-disclosure"
                  aria-label={`${open ? "Collapse" : "Expand"} tag ${tag}`}
                  aria-expanded={open}
                  disabled={state.busy}
                  onClick={() => toggle(tag)}
                >
                  {open ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                </button>
                <button
                  className="folder-select"
                  data-note-node
                  data-tag={`tag:${tag}`}
                  data-parent={parent ? `tag:${parent}` : "all"}
                  aria-label={`Tag ${tag}`}
                  aria-expanded={open}
                  aria-pressed={view === `tag:${tag}`}
                  title={`Create inside #${tag}`}
                  disabled={state.busy}
                  onClick={() => {
                    select(`tag:${tag}`);
                    toggle(tag, true);
                  }}
                >
                  <Hash size={15} aria-hidden="true" />
                  <span>{tag.split("/").pop()}</span>
                </button>
              </div>
              {open && (
                <div role="group" aria-label={`Notes tagged ${tag}`}>
                  {branches(tag, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      {notes
        .filter((note) =>
          parent ? note.tags.includes(parent) : !note.tags.length,
        )
        .map((note) => noteRow(note, depth, parent ? `tag:${parent}` : "all"))}
    </>
  );
  const handleKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (!target.matches("[data-note-node]")) return;
    const nodes = [
      ...(tree.current?.querySelectorAll<HTMLButtonElement>(
        "[data-note-node]:not(:disabled)",
      ) || []),
    ];
    const index = nodes.indexOf(target as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      nodes[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? nodes.length - 1
            : Math.max(
                0,
                Math.min(
                  nodes.length - 1,
                  index + (e.key === "ArrowDown" ? 1 : -1),
                ),
              )
      ]?.focus();
    } else if (e.key === "ArrowRight" && target.dataset.tag) {
      e.preventDefault();
      const tag = target.dataset.tag;
      if (target.getAttribute("aria-expanded") === "true")
        nodes[index + 1]?.focus();
      else if (tag === "all") changeRoot(true);
      else toggle(tag.slice(4), true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const tag = target.dataset.tag;
      if (target.getAttribute("aria-expanded") === "true") {
        if (tag === "all") changeRoot(false);
        else if (tag) toggle(tag.slice(4), false);
      } else
        nodes
          .find((node) => node.dataset.tag === target.dataset.parent)
          ?.focus();
    }
  };
  return (
    <section className="note-list" aria-label="Notes">
      <div className="note-search-row">
        <input
          className="note-search"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          aria-label="New note"
          title="New note"
          disabled={state.busy || !state.ready}
          onClick={onCreate}
        >
          <FilePlus size={18} />
        </button>
      </div>
      {searchError && <p role="alert">{searchError}</p>}
      <nav
        className="files note-tree"
        aria-label="Note library"
        inert={state.busy}
        onKeyDown={handleKeys}
        ref={(el) => {
          tree.current = el;
          scroll.current = el;
        }}
        onScroll={(e) =>
          sessionStorage.setItem(
            "kronos.noteTreeScroll",
            String(e.currentTarget.scrollTop),
          )
        }
      >
        {searching ? (
          <>
            <p className="note-search-status" role="status">
              {searchIds === null
                ? searchError
                  ? "Search unavailable"
                  : "Searching…"
                : `${searchIds.length} matching note${searchIds.length === 1 ? "" : "s"}`}
            </p>
            {notes
              .filter((note) => searchIds?.includes(note.id))
              .map((note) => noteRow(note, 0, ""))}
          </>
        ) : (
          <>
            <div
              className={`folder-row note-root ${view === "all" ? "selected-folder" : ""}`}
            >
              <button
                className="folder-disclosure"
                aria-label={`${rootOpen ? "Collapse" : "Expand"} All Notes`}
                aria-expanded={rootOpen}
                onClick={() => changeRoot(!rootOpen)}
              >
                {rootOpen ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
              <button
                ref={rootButton}
                className="folder-select"
                data-note-node
                data-tag="all"
                aria-expanded={rootOpen}
                aria-pressed={view === "all"}
                onClick={() => {
                  select("all");
                  changeRoot(!rootOpen);
                }}
              >
                {rootOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>All Notes</span>
              </button>
            </div>
            {rootOpen && (
              <div role="group" aria-label="All Notes">
                {branches()}
                {!notes.length && <p className="folder-empty">No notes yet.</p>}
              </div>
            )}
          </>
        )}
      </nav>
    </section>
  );
}
