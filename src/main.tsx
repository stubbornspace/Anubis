import React, {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Settings,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  PanelLeft,
  FilePlus,
  Search,
  FileText,
  Code2,
  Sun,
  Moon,
  AlignVerticalSpaceAround,
  Bold,
  Italic,
  List,
  Quote,
  Table,
  Heading2,
  X,
  Trash2,
  Pencil,
} from "lucide-react";
import { workspace, type Entry } from "./workspace";
import { loadDocument } from "./editor";
import "./ocean.css";
import "./atom-one.css";
import "./style.css";

type FileModal = {
  kind: "new-file" | "new-folder" | "rename" | "copy";
  entry?: Entry;
};

function FileActions({
  document: file,
  onRename,
  onDelete,
}: {
  document: Entry;
  onRename: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const close = () => {
    popup.current?.hidePopover();
    trigger.current?.focus();
  };
  return (
    <div className="file-actions">
      <button
        ref={trigger}
        title="File options"
        aria-label={`Options for ${file.name}`}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.min(rect.bottom + 4, window.innerHeight - 100),
            left: Math.max(8, rect.right - 160),
          });
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      <div
        id={id}
        ref={popup}
        popover="auto"
        className="file-menu"
        style={position}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (isOpen)
            popup.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }}
      >
        <button
          aria-label={`Rename ${file.name}`}
          onClick={() => {
            close();
            onRename();
          }}
        >
          <Pencil size={14} />
          Rename
        </button>
        <button
          className="danger"
          aria-label={`Delete ${file.name}`}
          onClick={() => {
            close();
            onDelete();
          }}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

function FileTree({
  entries,
  active,
  selectedFolder,
  onRename,
  search,
}: {
  entries: Entry[];
  active: string;
  selectedFolder: string;
  onRename: (entry: Entry) => void;
  search: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      const parts = selectedFolder.split("/");
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join("/")));
      return next;
    });
  }, [selectedFolder]);
  const matches = (e: Entry): boolean =>
    e.path.toLowerCase().includes(search.toLowerCase()) ||
    e.children.some(matches);
  const render = (items: Entry[], depth = 0): React.ReactNode =>
    items.filter(matches).map((entry) => {
      if (entry.directory) {
        const open = !!search || expanded.has(entry.path);
        return (
          <div key={entry.path}>
            <div
              className={`folder-row ${selectedFolder === entry.path ? "selected-folder" : ""}`}
              style={{ paddingLeft: 4 + depth * 14 }}
            >
              <button
                className="folder-disclosure"
                aria-label={`${open ? "Collapse" : "Expand"} ${entry.name}`}
                aria-expanded={open}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (open) next.delete(entry.path);
                    else next.add(entry.path);
                    return next;
                  })
                }
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button
                className="folder-select"
                aria-label={`Folder ${entry.name}`}
                aria-pressed={selectedFolder === entry.path}
                title={`Create inside ${entry.path}`}
                onClick={() =>
                  workspace.selectFolder(
                    selectedFolder === entry.path ? "" : entry.path,
                  )
                }
              >
                {open ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{entry.name}</span>
              </button>
            </div>
            {open && (
              <div role="group" aria-label={entry.name}>
                {entry.children.length ? (
                  render(entry.children, depth + 1)
                ) : (
                  <p
                    className="folder-empty"
                    style={{ paddingLeft: 38 + depth * 14 }}
                  >
                    Empty folder
                  </p>
                )}
              </div>
            )}
          </div>
        );
      }
      return (
        <div
          className={`file-row ${active === entry.path ? "active" : ""}`}
          key={entry.path}
          style={{ marginLeft: depth * 14 }}
        >
          <button
            className="file-open"
            aria-current={active === entry.path ? "page" : undefined}
            title={entry.path}
            onClick={() => void workspace.select(entry.path)}
          >
            <FileText size={16} />
            <span>{entry.name}</span>
          </button>
          <FileActions
            document={entry}
            onRename={() => onRename(entry)}
            onDelete={() => void workspace.remove(entry)}
          />
        </div>
      );
    });
  return (
    <>
      {render(entries)}
      {entries.length > 0 && !entries.some(matches) && (
        <p className="empty">No matching files.</p>
      )}
    </>
  );
}

const MemoFileTree = React.memo(FileTree);

function App() {
  const state = useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const doc = state.doc || { path: "", name: "", markdown: "", version: "" };
  const plainText = /\.txt$/i.test(doc.name);
  const [sidebar, setSidebar] = useState(true),
    [search, setSearch] = useState(""),
    [source, setSource] = useState(false),
    [focusMode, setFocusMode] = useState(false),
    [dark, setDark] = useState(
      () => localStorage.getItem("typclone.dark") === "true",
    ),
    [modal, setModal] = useState<FileModal | null>(null),
    [name, setName] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem("kronos.sidebarWidth"));
    return Number.isFinite(saved) && saved >= 220 && saved <= 480 ? saved : 258;
  });
  const [sidebarLimit, setSidebarLimit] = useState(() =>
    Math.max(220, Math.min(480, window.innerWidth - 360)),
  );
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const visibleSidebarWidth = Math.min(sidebarWidth, sidebarLimit);
  useEffect(() => {
    localStorage.setItem("kronos.sidebarWidth", String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    const resized = () =>
      setSidebarLimit(Math.max(220, Math.min(480, window.innerWidth - 360)));
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  const changeSidebarWidth = (width: number) =>
    setSidebarWidth(Math.max(220, Math.min(sidebarLimit, width)));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = settingsDialog.current;
    if (settingsOpen && !dialog?.open) dialog?.showModal();
    if (!settingsOpen && dialog?.open) dialog.close();
  }, [settingsOpen]);
  const fileDialog = useRef<HTMLDialogElement>(null);
  const fileDialogTrigger = useRef<HTMLElement | null>(null);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const openFileDialog = useCallback(
    (
      modal: FileModal,
      name: string,
      trigger = document.activeElement as HTMLElement | null,
    ) => {
      fileDialogTrigger.current = trigger;
      setName(name);
      setModal(modal);
    },
    [],
  );
  useEffect(() => {
    const dialog = fileDialog.current;
    if (modal && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    }
    if (!modal) {
      if (dialog?.open) dialog.close();
      if (fileDialogTrigger.current?.isConnected)
        fileDialogTrigger.current.focus();
      else recoveryButton.current?.focus();
    }
  }, [modal]);
  const [palette, setPalette] = useState(() =>
    localStorage.getItem("kronos.palette") === "atom-one"
      ? "atom-one"
      : "blues",
  );
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem("kronos.palette", palette);
  }, [palette]);
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem("kronos.fontSize"));
    return Number.isInteger(saved) && saved >= 12 && saved <= 20 ? saved : 15;
  });
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${fontSize}px`,
    );
    localStorage.setItem("kronos.fontSize", String(fontSize));
  }, [fontSize]);
  const [writing, setWriting] = useState(false);
  const pointerPosition = useRef<{ x: number; y: number } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealControls = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    setWriting(false);
  }, []);
  const beginWriting = () => {
    if (!focusMode || settingsOpen || !state.doc || state.error || modal)
      return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setWriting(true);
    idleTimer.current = setTimeout(revealControls, 2000);
  };
  useEffect(() => {
    revealControls();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [
    focusMode,
    doc.path,
    source,
    modal,
    state.error,
    settingsOpen,
    revealControls,
  ]);
  const startRename = useCallback(
    (entry: Entry) => {
      openFileDialog({ kind: "rename", entry }, entry.name);
    },
    [openFileDialog],
  );
  const scroll = useRef<HTMLElement>(null);
  const update = workspace.edit;
  useEffect(() => {
    void workspace.initialize();
    const connected = workspace.connect();
    return () => {
      void connected.then((disconnect) => disconnect());
    };
  }, []);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Markdown,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Begin anywhere…" }),
    ],
    content: "",
    contentType: "markdown",
    editorProps: {
      attributes: { class: "writing", "aria-label": "Markdown editor" },
    },
    onUpdate: ({ editor }) => update(editor.getMarkdown()),
  });
  useEffect(() => {
    if (editor) loadDocument(editor, plainText ? "" : doc.markdown);
    setSource(false);
    scroll.current?.scrollTo(0, 0);
  }, [doc.path, state.revision, editor]);
  useEffect(() => {
    editor?.setEditable(!!state.doc && !state.busy && !plainText, false);
  }, [editor, state.doc?.path, state.busy, plainText]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = `/icons/anubis-${dark ? "dark" : "light"}.png`;
    localStorage.setItem("typclone.dark", String(dark));
  }, [dark]);
  useEffect(() => {
    const area = scroll.current;
    if (
      !editor ||
      !focusMode ||
      settingsOpen ||
      source ||
      plainText ||
      !state.doc ||
      !area
    )
      return;
    let frame = 0;
    const centerCursor = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const pos = editor.view.coordsAtPos(editor.state.selection.head);
        const focusLine =
          area.getBoundingClientRect().top + area.clientHeight * 0.4;
        area.scrollBy({
          top: (pos.top + pos.bottom) / 2 - focusLine,
          behavior: "instant",
        });
      });
    };
    const resize = new ResizeObserver(() => {
      area.style.setProperty("--focus-space", `${area.clientHeight * 0.6}px`);
      centerCursor();
    });
    resize.observe(area);
    editor.on("transaction", centerCursor);
    editor.on("focus", centerCursor);
    centerCursor();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      editor.off("transaction", centerCursor);
      editor.off("focus", centerCursor);
      area.style.removeProperty("--focus-space");
    };
  }, [editor, focusMode, source, plainText, doc.path, settingsOpen]);
  const create = (trigger = document.activeElement as HTMLElement | null) => {
    if (!state.workspace) {
      void workspace.choose();
      return;
    }
    openFileDialog({ kind: "new-file" }, "Untitled.md", trigger);
  };
  const toggleSource = () => {
    if (!state.doc || plainText) return;
    if (source)
      editor?.commands.setContent(doc.markdown, {
        contentType: "markdown",
        emitUpdate: false,
      });
    setSource(!source);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (settingsOpen || modal) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        void workspace.save();
      }
      if (e.key === "o") {
        e.preventDefault();
        void workspace.choose();
      }
      if (e.key === "n") {
        e.preventDefault();
        create();
      }
      if (e.key === "/") {
        e.preventDefault();
        toggleSource();
      }
      if (e.key === "\\") {
        e.preventDefault();
        setSidebar((s) => !s);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const errorMessage = state.error && (
    <div className="action-error" role="alert">
      <span>{state.error}</span>
      {state.conflict ? (
        <>
          <button type="button" onClick={() => void workspace.reload()}>
            Reload from disk
          </button>
          <button
            ref={recoveryButton}
            type="button"
            onClick={(event) =>
              openFileDialog(
                { kind: "copy" },
                doc.name.replace(/(\.[^.]+)$/, " copy$1"),
                event.currentTarget,
              )
            }
          >
            Save a copy
          </button>
        </>
      ) : (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={workspace.dismissError}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
  return (
    <div
      style={
        { "--sidebar-width": `${visibleSidebarWidth}px` } as React.CSSProperties
      }
      onPointerMove={(event) => {
        const previous = pointerPosition.current;
        pointerPosition.current = { x: event.clientX, y: event.clientY };
        if (
          previous &&
          (previous.x !== event.clientX || previous.y !== event.clientY)
        ) {
          revealControls();
        }
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" || event.key === "Tab") revealControls();
      }}
      className={`app ${resizing ? "resizing-sidebar" : ""} ${writing ? "focus-writing" : ""} ${navigator.platform.startsWith("Mac") ? "mac-window" : ""} ${sidebar ? "" : "no-sidebar"} ${focusMode && !source && !plainText && state.doc ? "focus-mode" : ""}`}
    >
      <aside id="sidebar" className="sidebar" inert={!sidebar || writing}>
        <div className="brand" data-tauri-drag-region>
          <img
            className="brand-icon"
            data-tauri-drag-region
            src={`/icons/anubis-${dark ? "dark" : "light"}.png`}
            width={32}
            height={32}
            alt=""
          />
          <span data-tauri-drag-region>Anubis</span>
        </div>
        {state.workspace && (
          <div className="workspace-bar">
            <button
              className="workspace-name"
              title={`Choose folder — ${state.workspace.root}`}
              aria-label="Choose folder"
              disabled={state.busy}
              onClick={() => void workspace.choose()}
            >
              <FolderOpen size={15} />
              <span>{state.workspace.name}</span>
              <ChevronDown size={13} />
            </button>
            <button
              title={`New file in ${state.folder || state.workspace.name}`}
              aria-label="New document"
              disabled={state.busy}
              onClick={(event) => create(event.currentTarget)}
            >
              <FilePlus size={15} />
            </button>
            <button
              title={`New folder in ${state.folder || state.workspace.name}`}
              aria-label="New folder"
              disabled={state.busy}
              onClick={(event) =>
                openFileDialog({ kind: "new-folder" }, "", event.currentTarget)
              }
            >
              <FolderPlus size={15} />
            </button>
          </div>
        )}
        {state.workspace && (
          <label className="search">
            <Search size={14} />
            <input
              aria-label="Search files"
              name="search"
              autoComplete="off"
              placeholder="Find files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        )}
        <nav
          className="files"
          aria-label="Workspace files"
          onClick={() => setSettingsOpen(false)}
          inert={state.busy}
        >
          {state.workspace && (
            <MemoFileTree
              key={state.workspace.root}
              entries={state.workspace.entries}
              active={doc.path}
              selectedFolder={state.folder}
              search={search}
              onRename={startRename}
            />
          )}
          {state.workspace && !state.workspace.entries.length && (
            <p className="empty">
              This folder is empty. Create a document to start writing.
            </p>
          )}
        </nav>
        {!!state.workspace?.warnings.length && (
          <details className="workspace-warnings">
            <summary>Some items could not be loaded</summary>
            {state.workspace.warnings.map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
          </details>
        )}
        <div className="sidebar-controls">
          <button
            ref={settingsButton}
            aria-label="Settings"
            title="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => {
              revealControls();
              setSettingsOpen(true);
            }}
          >
            <Settings size={17} />
          </button>
          <button
            aria-label="Toggle theme"
            title={dark ? "Light appearance" : "Dark appearance"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={sidebarLimit}
          aria-valuenow={visibleSidebarWidth}
          tabIndex={0}
          title="Drag to resize sidebar"
          onDoubleClick={() => setSidebarWidth(258)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            resizeStart.current = {
              x: event.clientX,
              width: visibleSidebarWidth,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
          onPointerMove={(event) => {
            if (resizeStart.current)
              changeSidebarWidth(
                resizeStart.current.width +
                  event.clientX -
                  resizeStart.current.x,
              );
          }}
          onPointerUp={(event) => {
            resizeStart.current = null;
            setResizing(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            resizeStart.current = null;
            setResizing(false);
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            changeSidebarWidth(
              event.key === "Home"
                ? 220
                : event.key === "End"
                  ? sidebarLimit
                  : visibleSidebarWidth +
                    (event.key === "ArrowRight" ? 10 : -10),
            );
          }}
        />
      </aside>
      {sidebar && (
        <button
          className="sidebar-dismiss"
          aria-label="Close sidebar"
          onClick={() => setSidebar(false)}
        />
      )}
      <section className="main">
        <header data-tauri-drag-region inert={writing}>
          <div className="breadcrumbs">
            <button
              aria-label="Toggle sidebar"
              aria-expanded={sidebar}
              aria-controls="sidebar"
              title="Toggle sidebar (⌘\\)"
              onClick={() => setSidebar(!sidebar)}
            >
              <PanelLeft size={17} />
            </button>
          </div>
          <div className="header-actions">
            <span
              className={`saved ${state.conflict ? "danger" : ""}`}
              role="status"
            >
              {state.doc
                ? state.conflict
                  ? "Not saved"
                  : state.saving
                    ? "Saving…"
                    : state.dirty
                      ? "Unsaved changes"
                      : "Saved"
                : ""}
            </span>
            <div
              className="editor-controls"
              role="group"
              aria-label="Editor controls"
              inert={state.busy || !state.doc}
            >
              <button
                aria-label="Toggle source mode"
                aria-pressed={source || plainText}
                disabled={plainText}
                title="Source mode (⌘/)"
                className={source ? "enabled" : ""}
                onClick={toggleSource}
              >
                <Code2 size={16} />
              </button>
              <button
                aria-label={
                  focusMode ? "Disable focus mode" : "Enable focus mode"
                }
                title={
                  plainText
                    ? "Focus mode is available for Markdown"
                    : "Focus mode"
                }
                disabled={settingsOpen || plainText || !state.doc}
                aria-pressed={focusMode}
                className={focusMode ? "enabled" : ""}
                onClick={() => {
                  if (!focusMode && source) toggleSource();
                  setFocusMode(!focusMode);
                  if (window.innerWidth <= 600) setSidebar(false);
                  if (state.doc)
                    editor?.commands.focus(editor.state.selection.head, {
                      scrollIntoView: false,
                    });
                }}
              >
                <AlignVerticalSpaceAround size={17} />
              </button>
              {!source && !plainText && (
                <span className="divider" aria-hidden="true" />
              )}
              {!source && !plainText && (
                <div className="formatting">
                  <button
                    title="Bold (⌘B)"
                    aria-label="Bold"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    title="Italic (⌘I)"
                    aria-label="Italic"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    title="Heading"
                    aria-label="Heading"
                    onClick={() =>
                      editor?.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                  >
                    <Heading2 size={16} />
                  </button>
                  <button
                    title="Bullet list"
                    aria-label="Bullet list"
                    onClick={() =>
                      editor?.chain().focus().toggleBulletList().run()
                    }
                  >
                    <List size={16} />
                  </button>
                  <button
                    title="Quote"
                    aria-label="Quote"
                    onClick={() =>
                      editor?.chain().focus().toggleBlockquote().run()
                    }
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
              )}
            </div>
          </div>
        </header>
        <dialog
          ref={settingsDialog}
          className="settings-dialog"
          aria-labelledby="settings-title"
          onClose={() => {
            setSettingsOpen(false);
            settingsButton.current?.focus();
          }}
        >
          <div className="settings-heading">
            <h1 id="settings-title">Settings</h1>
            <button
              aria-label="Close settings"
              title="Close settings"
              onClick={() => setSettingsOpen(false)}
              autoFocus
            >
              <X size={18} />
            </button>
          </div>
          <fieldset>
            <legend>Theme</legend>
            <p>Choose the colors for your writing space.</p>
            <div className="theme-choices">
              {[
                { id: "blues", name: "The Blues" },
                { id: "atom-one", name: "Atom One" },
              ].map((theme) => (
                <label key={theme.id} className="theme-choice">
                  <input
                    type="radio"
                    name="palette"
                    value={theme.id}
                    checked={palette === theme.id}
                    onChange={() => setPalette(theme.id)}
                  />
                  <span>{theme.name}</span>
                  <span
                    className={`theme-swatch ${theme.id}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Appearance</legend>
            <div className="appearance-choices">
              <label>
                <input
                  type="radio"
                  name="appearance"
                  checked={!dark}
                  onChange={() => setDark(false)}
                />
                Light
              </label>
              <label>
                <input
                  type="radio"
                  name="appearance"
                  checked={dark}
                  onChange={() => setDark(true)}
                />
                Dark
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Writing</legend>
            <div className="font-size-setting">
              <label htmlFor="font-size">Default font size</label>
              <output htmlFor="font-size">{fontSize}</output>
            </div>
            <input
              className="font-size-slider"
              id="font-size"
              type="range"
              min={12}
              max={20}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
            <div className="font-size-range" aria-hidden="true">
              <span>12</span>
              <span>20</span>
            </div>
          </fieldset>
        </dialog>
        <main
          ref={scroll}
          className="page-scroll"
          onInputCapture={beginWriting}
        >
          {!state.doc ? (
            <div className="workspace-empty">
              <FolderOpen size={32} />
              <h1>
                {state.workspace
                  ? "Choose a file to begin"
                  : "Your writing, in your folder"}
              </h1>
              <p>
                {state.workspace
                  ? "Open a document from the sidebar, or create a new one."
                  : "Open a local folder to browse Markdown and text files, including subfolders."}
              </p>
              <button
                className="primary"
                disabled={state.busy || !state.ready}
                onClick={(event) =>
                  state.workspace
                    ? create(event.currentTarget)
                    : void workspace.choose()
                }
              >
                {state.workspace ? "New document" : "Choose folder"}
              </button>
            </div>
          ) : source || plainText ? (
            <textarea
              className="source writing"
              aria-label={plainText ? "Text editor" : "Markdown source"}
              disabled={state.busy}
              spellCheck={false}
              value={doc.markdown}
              onChange={(e) => update(e.target.value)}
            />
          ) : null}
          <div hidden={!state.doc || source || plainText}>
            <EditorContent editor={editor} />
          </div>
        </main>
      </section>
      {!modal && errorMessage}
      <dialog
        ref={fileDialog}
        className="file-dialog"
        aria-labelledby="file-dialog-title"
        onClose={(event) => {
          if (!event.currentTarget.open) setModal(null);
        }}
      >
        {modal && (
          <form
            className="modal"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok =
                modal.kind === "rename"
                  ? await workspace.rename(modal.entry!, name)
                  : modal.kind === "copy"
                    ? await workspace.saveCopy(name)
                    : await workspace.create(name, modal.kind === "new-folder");
              if (ok) setModal(null);
            }}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Cancel"
              onClick={() => setModal(null)}
            >
              <X size={18} />
            </button>
            <h2 id="file-dialog-title">
              {modal.kind === "rename"
                ? "Rename document"
                : modal.kind === "new-folder"
                  ? "New folder"
                  : modal.kind === "copy"
                    ? "Save a copy"
                    : "New document"}
            </h2>
            {modal.kind.startsWith("new") && (
              <p className="modal-location">
                In {state.folder || state.workspace?.name}
              </p>
            )}
            <label>
              {modal.kind === "new-folder" ? "Folder name" : "File name"}
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              className="primary"
              type="submit"
              disabled={state.busy || !name.trim()}
            >
              {modal.kind === "rename" ? "Save name" : "Create"}
            </button>
          </form>
        )}
        {modal && errorMessage}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  isTauri() ? (
    <App />
  ) : (
    <div className="workspace-empty">
      <h1>Open Anubis on your desktop</h1>
      <p>Local folders are available in the desktop app.</p>
    </div>
  ),
);
