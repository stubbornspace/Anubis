import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { FilePlus } from "lucide-react";
import { SidebarTree, type SidebarTreeNode } from "./sidebar-tree";
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
  const [expanded, setExpanded] = useState(storedExpanded);
  const scroll = useRef<HTMLElement>(null);
  const previousNote = useRef<string | undefined>(undefined);
  const previousView = useRef(view);
  const saveExpanded = (next: Set<string>) => {
    setExpanded(next);
    localStorage.setItem("kronos.expandedTags", JSON.stringify([...next]));
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
    // during this session, including when the Tags picker adds a new tag.
    if (previous === undefined || previous === activePath || !state.note)
      return;
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
  const noteNode = (note: NoteSummary, parent: string): SidebarTreeNode => ({
    kind: "item",
    id: JSON.stringify([parent, note.id]),
    label: note.title || "Untitled note",
    className: "note-row",
    selected: state.note?.id === note.id,
    title: [
      note.title || "Untitled note",
      ...note.tags.map((tag) => `#${tag}`),
    ].join(" · "),
    icon: (
      <span className="note-list-marker" aria-hidden="true">
        -
      </span>
    ),
    onActivate: () => onOpen(note.id),
  });
  const branches = (parent = ""): SidebarTreeNode[] => [
    ...tags
      .filter(
        (tag) =>
          tag.slice(0, tag.lastIndexOf("/") + 1) ===
          (parent ? `${parent}/` : ""),
      )
      .map((tag): SidebarTreeNode => ({
        kind: "branch",
        id: `tag:${tag}`,
        label: tag.split("/").pop()!,
        accessibleLabel: `Tag ${tag}`,
        disclosureLabel: `tag ${tag}`,
        groupLabel: `Notes tagged ${tag}`,
        title:
          view === `tag:${tag}`
            ? "Clear tag selection"
            : `Create inside #${tag}`,
        selected: view === `tag:${tag}`,
        expanded: expanded.has(tag),
        children: expanded.has(tag) ? branches(tag) : [],
        onToggle: (open) => toggle(tag, open),
        onActivate: () => {
          select(view === `tag:${tag}` ? "all" : `tag:${tag}`);
          toggle(tag, true);
        },
      })),
    ...notes
      .filter((note) =>
        parent ? note.tags.includes(parent) : !note.tags.length,
      )
      .map((note) => noteNode(note, parent)),
  ];
  const nodes: SidebarTreeNode[] = searching
    ? notes
        .filter((note) => searchIds?.includes(note.id))
        .map((note) => noteNode(note, "search"))
    : branches();
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
        ref={scroll}
        onScroll={(e) =>
          sessionStorage.setItem(
            "kronos.noteTreeScroll",
            String(e.currentTarget.scrollTop),
          )
        }
      >
        {searching && (
          <p className="note-search-status" role="status">
            {searchIds === null
              ? searchError
                ? "Search unavailable"
                : "Searching…"
              : `${searchIds.length} matching note${searchIds.length === 1 ? "" : "s"}`}
          </p>
        )}
        <SidebarTree nodes={nodes} disabled={state.busy} />
        {!searching && state.ready && !notes.length && (
          <p className="folder-empty">No notes yet.</p>
        )}
      </nav>
    </section>
  );
}
