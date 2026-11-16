import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Settings,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  PanelLeft,
  FilePlus,
  Code2,
  AlignVerticalSpaceAround,
  X,
  Trash2,
  NotebookPen,
  ImagePlus,
} from "lucide-react";
import { MemoDocumentTree } from "./document-tree";
import { workspace, type Entry } from "./workspace";
import { LibraryTools, NoteActions } from "./library-tools";
import { NoteTags } from "./tag-extension";
import { ImageTools } from "./image-tools";
import { SelectionToolbar } from "./selection-toolbar";
import { NoteImage } from "./note-image";
import { library } from "./library";
import { NoteList, type LibraryView } from "./library-ui";
import { NoteTagPicker } from "./note-tags";
import {
  loadDocument,
  editMarkdown,
  editorMarkdown,
  setDocumentContent,
} from "./editor";
import { isIOS, compactNavigation, interfaceScale } from "./platform";
import "./ocean.css";
import "./atom-one.css";
import "./style.css";

type FileModal = {
  kind: "new-file" | "new-folder" | "rename" | "copy";
  entry?: Entry;
};

function App() {
  const documentState = useSyncExternalStore(
    workspace.subscribe,
    workspace.snapshot,
  );
  const noteState = useSyncExternalStore(library.subscribe, library.snapshot);
  const [mode, setMode] = useState<"documents" | "notes">(() =>
    localStorage.getItem("kronos.mode") === "notes" ? "notes" : "documents",
  );
  const notesMode = mode === "notes";
  const [libraryView, setLibraryView] = useState<LibraryView>(() => {
    const saved = localStorage.getItem("kronos.libraryView");
    return saved?.startsWith("tag:") ? (saved as LibraryView) : "all";
  });
  const [syncEnabled, setSyncEnabled] = useState(
    () => localStorage.getItem("kronos.notesSync") === "true",
  );
  const [switchingMode, setSwitchingMode] = useState(false);
  const switchingRef = useRef(false);
  const note = noteState.note;
  const state = notesMode
    ? {
        ...documentState,
        ...noteState,
        recoveredFrom: null,
        opening: "",
        revision: noteState.generation,
        busy: noteState.busy || switchingMode,
        doc: note
          ? {
              path: `note:${note.id}`,
              name:
                note.markdown
                  .split("\n")
                  .find((line) => line.trim())
                  ?.replace(/^#+\s*/, "")
                  .slice(0, 200) || "Untitled note",
              markdown: note.markdown,
              version: String(note.revision),
              cloud: undefined,
            }
          : null,
      }
    : { ...documentState, busy: documentState.busy || switchingMode };
  const switchMode = async (next: "documents" | "notes") => {
    if (next === mode || switchingRef.current) return;
    switchingRef.current = true;
    setSwitchingMode(true);
    try {
      if (!(await (notesMode ? library.save() : workspace.save()))) return;
      if (next === "notes" && !(await library.initialize())) {
        setMode("notes");
        return;
      }
      setMode(next);
      localStorage.setItem("kronos.mode", next);
      if (next === "notes") {
        setSidebar(true);
      }
    } finally {
      switchingRef.current = false;
      setSwitchingMode(false);
    }
  };
  useEffect(() => {
    if (!syncEnabled) return;
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        library.state.ready &&
        !library.state.busy &&
        !library.state.dirty &&
        !library.state.conflict
      )
        void library.sync();
    }, 60000);
    return () => clearInterval(timer);
  }, [syncEnabled]);
  const selectLibraryView = async (view: LibraryView) => {
    if (!(await library.save())) return;
    setLibraryView(view);
    localStorage.setItem("kronos.libraryView", view);
  };
  const openNote = async (id: string) => {
    if (await library.select(id)) {
      if (compactNavigation()) setSidebar(false);
    }
  };
  const createNote = async () => {
    const selectedTag = libraryView.startsWith("tag:")
      ? libraryView.slice(4)
      : undefined;
    const availableTag =
      selectedTag &&
      library.state.notes.some((note) =>
        note.tags.some(
          (tag) => tag === selectedTag || tag.startsWith(`${selectedTag}/`),
        ),
      )
        ? selectedTag
        : undefined;
    if (await library.create(availableTag)) {
      if (compactNavigation()) setSidebar(false);
    }
  };
  const doc = state.doc || { path: "", name: "", markdown: "", version: "" };
  const plainText = !notesMode && /\.txt$/i.test(doc.name);
  const [appZoom, setAppZoom] = useState(() => {
    const saved = Number(localStorage.getItem("kronos.appZoom"));
    if (
      Number.isInteger(saved) &&
      saved >= 75 &&
      saved <= 150 &&
      saved % 5 === 0
    )
      return saved;
    // Migrate the old writing size to an equivalent app scale once. Keep the
    // legacy key intact so older installations retain their writing preference.
    const legacy = Number(localStorage.getItem("kronos.fontSize"));
    return Number.isInteger(legacy) && legacy >= 12 && legacy <= 20
      ? Math.max(
          75,
          Math.min(150, Math.round((legacy / (isIOS ? 16 : 15)) * 20) * 5),
        )
      : 100;
  });
  const [committedZoom, setCommittedZoom] = useState(appZoom);
  const [zoomSaveError, setZoomSaveError] = useState("");
  const draggingZoom = useRef(false);
  const changeZoom = (value: number) => {
    setAppZoom(value);
    if (!draggingZoom.current) setCommittedZoom(value);
  };
  const finishZoomDrag = (event: React.PointerEvent<HTMLInputElement>) => {
    draggingZoom.current = false;
    setCommittedZoom(Number(event.currentTarget.value));
  };
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--app-zoom",
      String(committedZoom / 100),
    );
    try {
      localStorage.setItem("kronos.appZoom", String(committedZoom));
      setZoomSaveError("");
    } catch {
      setZoomSaveError(
        "App zoom changed, but could not be saved on this device.",
      );
    }
    // Container queries and pointer coordinates must share the same scale.
    window.dispatchEvent(new Event("resize"));
  }, [committedZoom]);
  const [sidebar, setSidebar] = useState(
      () => !compactNavigation(appZoom / 100),
    ),
    [source, setSource] = useState(false),
    [focusMode, setFocusMode] = useState(false),
    [dark, setDark] = useState(
      () => localStorage.getItem("typclone.dark") === "true",
    ),
    [modal, setModal] = useState<FileModal | null>(null),
    [name, setName] = useState("");
  const toggleSidebar = () => setSidebar((value) => !value);
  const [documentSidebarWidth, setDocumentSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem("kronos.sidebarWidth"));
    return Number.isFinite(saved) && saved >= 220 && saved <= 480 ? saved : 258;
  });
  const [notesSidebarWidth, setNotesSidebarWidth] = useState(() => {
    const value = Number(localStorage.getItem("kronos.notesSidebarWidth"));
    return value >= 220 && value <= 480 ? value : 240;
  });
  const sidebarWidth = notesMode ? notesSidebarWidth : documentSidebarWidth;
  const setSidebarWidth = (value: number) =>
    notesMode ? setNotesSidebarWidth(value) : setDocumentSidebarWidth(value);
  const [sidebarLimit, setSidebarLimit] = useState(() =>
    Math.max(220, Math.min(480, window.innerWidth / (appZoom / 100) - 360)),
  );
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const visibleSidebarWidth = Math.min(sidebarWidth, sidebarLimit);
  useEffect(() => {
    localStorage.setItem(
      notesMode ? "kronos.notesSidebarWidth" : "kronos.sidebarWidth",
      String(sidebarWidth),
    );
  }, [sidebarWidth, notesMode]);
  useEffect(() => {
    const resized = () =>
      setSidebarLimit(
        Math.max(
          220,
          Math.min(480, window.innerWidth / interfaceScale() - 360),
        ),
      );
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
  const openDocument = useCallback(async (path: string) => {
    if (await workspace.select(path)) {
      if (compactNavigation()) setSidebar(false);
    }
  }, []);
  useEffect(() => {
    if (!isIOS) return;
    const viewport = window.visualViewport;
    const resize = () => {
      document.documentElement.style.setProperty(
        "--app-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--app-height");
    };
  }, []);
  const update = notesMode ? library.edit : workspace.edit;
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    void workspace.initialize();
    if (localStorage.getItem("kronos.mode") === "notes")
      void library.initialize();
    const connected = workspace.connect();
    return () => {
      void connected.then((disconnect) => disconnect());
    };
  }, []);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageHandler = useRef<(files: File[]) => Promise<void>>(async () => {});
  const notesModeRef = useRef(notesMode);
  notesModeRef.current = notesMode;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Markdown,
      NoteImage.configure({ allowBase64: true }),
      NoteTags,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Begin anywhere…" }),
    ],
    content: "",
    contentType: "markdown",
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files || [])];
        if (!notesModeRef.current || !files.length) return false;
        event.preventDefault();
        void imageHandler.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files || [])];
        if (!notesModeRef.current || !files.length) return false;
        event.preventDefault();
        void imageHandler.current(files);
        return true;
      },
      attributes: { class: "writing", "aria-label": "Markdown editor" },
    },
    onUpdate: ({ editor }) =>
      updateRef.current(editorMarkdown(editor, notesModeRef.current)),
  });
  const [imageError, setImageError] = useState("");
  imageHandler.current = async (files) => {
    const insertingNote = notesModeRef.current;
    const selected = insertingNote
      ? library.state.note?.id
      : workspace.state.doc?.path;
    const root = workspace.state.workspace?.root;
    if (!selected || state.busy || plainText || source) return;
    for (const file of files) {
      try {
        if (file.size > 20 * 1024 * 1024)
          throw new Error("Images must be smaller than 20 MB.");
        if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type))
          throw new Error("Choose a PNG, JPEG, GIF, or WebP image.");
        const src = insertingNote
          ? await invoke<string>("library_call", {
              request: {
                op: "putAsset",
                bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
              },
            })
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () =>
                reject(new Error("Could not read the image."));
              reader.readAsDataURL(file);
            });
        if (
          notesModeRef.current !== insertingNote ||
          (insertingNote
            ? library.state.note?.id !== selected
            : workspace.state.doc?.path !== selected ||
              workspace.state.workspace?.root !== root)
        )
          throw new Error(
            "The document changed while the image was importing. Select the original item and insert it again.",
          );
        if (
          !insertingNote &&
          new TextEncoder().encode(
            (editor?.getMarkdown() || "") + src + file.name,
          ).length >
            10 * 1024 * 1024 - 128
        )
          throw new Error(
            "This image would exceed the document’s 10 MB editing limit.",
          );
        editor
          ?.chain()
          .focus()
          .setImage({ src, alt: file.name.replace(/\.[^.]+$/, "") })
          .run();
        setImageError("");
      } catch (e) {
        setImageError(String(e));
        break;
      }
    }
  };
  useEffect(() => {
    if (editor) loadDocument(editor, plainText ? "" : doc.markdown, notesMode);
    setSource(false);
    scroll.current?.scrollTo(
      0,
      Number(sessionStorage.getItem(`kronos.editorScroll:${doc.path}`)) || 0,
    );
  }, [doc.path, state.revision, editor]);
  useEffect(() => {
    editor?.setEditable(!!state.doc && !state.busy && !plainText, false);
  }, [editor, state.doc?.path, state.busy, plainText, notesMode]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = `/icons/anubis-${dark ? "dark" : "light"}.png`;
    localStorage.setItem("typclone.dark", String(dark));
    if (isIOS) void invoke("set_mobile_appearance", { dark });
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
    if (notesMode) {
      void createNote();
      return;
    }
    if (!state.workspace) {
      void workspace.choose();
      return;
    }
    openFileDialog({ kind: "new-file" }, "Untitled.md", trigger);
  };
  const toggleSource = () => {
    if (!state.doc || plainText) return;
    if (source && editor) setDocumentContent(editor, doc.markdown, notesMode);
    setSource(!source);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (settingsOpen || modal) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        void (notesMode ? library.save() : workspace.save());
      }
      if (e.key === "o" && !notesMode) {
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
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const cloud = state.doc?.cloud;
  const cloudConflict = !!cloud?.conflicts;
  const quietSaveStatus =
    !state.opening &&
    !state.conflict &&
    !state.error &&
    !state.saving &&
    !state.dirty &&
    !cloudConflict &&
    !cloud?.error &&
    (!cloud || cloud.uploaded) &&
    !(
      notesMode &&
      syncEnabled &&
      ["pending", "syncing", "error"].includes(noteState.sync)
    );
  const errorMessage = (state.error || cloudConflict || cloud?.error) && (
    <div className="action-error" role="alert">
      <span>
        {state.error ||
          (cloudConflict
            ? "iCloud has competing versions of this document. Keep both to preserve each version as a separate file."
            : cloud?.error)}
      </span>
      {cloudConflict && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => void workspace.keepBoth()}
        >
          Keep both versions
        </button>
      )}
      {notesMode && state.conflict ? (
        <>
          <button onClick={() => void library.recover()}>
            Save recovery copy
          </button>
          <button onClick={() => void library.discard()}>Discard edits</button>
        </>
      ) : state.conflict ? (
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
      ) : !cloudConflict && !cloud?.error ? (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={notesMode ? library.dismissError : workspace.dismissError}
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
  return (
    <div
      style={
        {
          "--sidebar-width": `${visibleSidebarWidth / 16}rem`,
        } as React.CSSProperties
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
      onPointerDownCapture={revealControls}
      className={`app ${notesMode ? "notes-mode" : "documents-mode"} ${resizing ? "resizing-sidebar" : ""} ${writing ? "focus-writing" : ""} ${isIOS ? "ios-window" : navigator.platform.startsWith("Mac") ? "mac-window" : ""} ${sidebar ? "" : "no-sidebar"} ${focusMode && !source && !plainText && state.doc ? "focus-mode" : ""}`}
    >
      <aside id="sidebar" className="sidebar" inert={!sidebar || writing}>
        <div
          className="brand"
          data-tauri-drag-region={isIOS ? undefined : true}
        >
          <img
            className="brand-icon"
            data-tauri-drag-region={isIOS ? undefined : true}
            src={`/icons/anubis-${dark ? "dark" : "light"}.png`}
            width={32}
            height={32}
            alt=""
          />
          <span data-tauri-drag-region={isIOS ? undefined : true}>Anubis</span>
          {isIOS && (
            <button
              className="mobile-sidebar-close"
              aria-label="Close files"
              title="Close files"
              onClick={() => setSidebar(false)}
            >
              <X size={20} />
            </button>
          )}
        </div>
        {notesMode ? (
          <NoteList
            state={noteState}
            view={libraryView}
            select={(view) => void selectLibraryView(view)}
            onOpen={(id) => void openNote(id)}
            onCreate={() => void createNote()}
          />
        ) : (
          <>
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
                    openFileDialog(
                      { kind: "new-folder" },
                      "",
                      event.currentTarget,
                    )
                  }
                >
                  <FolderPlus size={15} />
                </button>
              </div>
            )}
            <nav
              className="files"
              aria-label="Workspace files"
              onClick={() => setSettingsOpen(false)}
              inert={state.busy}
            >
              {state.workspace && (
                <MemoDocumentTree
                  key={state.workspace.root}
                  entries={state.workspace.entries}
                  active={doc.path}
                  selectedFolder={state.folder}
                  onRename={startRename}
                  onOpen={openDocument}
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
          </>
        )}
        <div className="sidebar-controls">
          <div className="mode-switch" role="group" aria-label="Writing mode">
            <button
              title="Documents"
              aria-label="Documents"
              aria-pressed={!notesMode}
              disabled={state.busy}
              onClick={() => void switchMode("documents")}
            >
              <FolderOpen size={17} />
            </button>
            <button
              title="Notes"
              aria-label="Notes"
              aria-pressed={notesMode}
              disabled={state.busy}
              onClick={() => void switchMode("notes")}
            >
              <NotebookPen size={17} />
            </button>
          </div>
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
                  (event.clientX - resizeStart.current.x) / interfaceScale(),
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
      {editor &&
        !source &&
        !plainText &&
        state.doc &&
        !state.busy &&
        !settingsOpen &&
        !modal && (
          <React.Fragment key={doc.path}>
            <SelectionToolbar editor={editor} />
            <ImageTools editor={editor} />
          </React.Fragment>
        )}
      <section className="main">
        <header
          data-tauri-drag-region={isIOS ? undefined : true}
          inert={writing}
        >
          <div className="breadcrumbs">
            <button
              aria-label="Toggle sidebar"
              aria-expanded={sidebar}
              aria-controls="sidebar"
              title="Toggle sidebar (⌘\\)"
              onClick={toggleSidebar}
            >
              <PanelLeft size={17} />
            </button>
            {isIOS && (
              <span className="mobile-title">{doc.name || "Anubis"}</span>
            )}
          </div>
          <div className="header-actions">
            <span
              data-quiet={quietSaveStatus || undefined}
              className={`saved ${state.conflict || cloudConflict || cloud?.error ? "danger" : ""}`}
              role="status"
            >
              {state.opening ||
                (state.doc
                  ? state.conflict
                    ? "Not saved"
                    : state.saving
                      ? "Saving…"
                      : state.dirty
                        ? "Unsaved changes"
                        : cloudConflict
                          ? "iCloud conflict"
                          : cloud?.error
                            ? "Saved locally · iCloud error"
                            : cloud
                              ? cloud.uploaded
                                ? "Uploaded to iCloud"
                                : "Saved locally · Upload pending"
                              : notesMode
                                ? noteState.sync === "synced"
                                  ? "Synced"
                                  : syncEnabled && noteState.sync === "syncing"
                                    ? "Syncing…"
                                    : syncEnabled && noteState.sync === "error"
                                      ? "Saved locally · iCloud error"
                                      : syncEnabled &&
                                          noteState.sync === "pending"
                                        ? "Saved locally · Upload pending"
                                        : "Saved locally"
                                : "Saved"
                  : "")}
            </span>
            <div
              className="editor-controls"
              role="group"
              aria-label="Editor controls"
              inert={state.busy || !state.doc}
            >
              {isIOS && (
                <button
                  aria-label="Hide keyboard"
                  title="Hide keyboard"
                  onClick={() =>
                    (document.activeElement as HTMLElement | null)?.blur()
                  }
                >
                  <ChevronDown size={20} />
                </button>
              )}
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
              <span className="divider" aria-hidden="true" />
              {!source && !plainText && (
                <div className="formatting">
                  <input
                    ref={imageInput}
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    multiple
                    onChange={(e) => {
                      void imageHandler.current([...(e.target.files || [])]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    aria-label="Insert image"
                    title="Insert image"
                    disabled={state.busy || !state.doc || source || plainText}
                    onClick={() => imageInput.current?.click()}
                  >
                    <ImagePlus size={16} />
                  </button>
                </div>
              )}
              {notesMode && note ? (
                <React.Fragment key={note.id}>
                  <NoteTagPicker
                    note={note}
                    busy={state.busy}
                    suggestions={noteState.notes.flatMap((note) => note.tags)}
                    onChange={(markdown) => {
                      if (source) library.edit(markdown);
                      else if (editor) editMarkdown(editor, markdown, true);
                    }}
                  />
                  <NoteActions note={note} busy={state.busy} />
                </React.Fragment>
              ) : !notesMode && state.doc ? (
                <button
                  aria-label="Delete document"
                  title="Delete document"
                  disabled={state.busy}
                  onClick={() => {
                    if (!state.doc) return;
                    void workspace
                      .remove({ ...state.doc, directory: false, children: [] })
                      .then(() => {
                        if (!workspace.state.doc)
                          document
                            .querySelector<HTMLButtonElement>(
                              'button[aria-label="Toggle sidebar"]',
                            )
                            ?.focus();
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
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
          {notesMode && (
            <>
              <LibraryTools busy={state.busy} />
              <fieldset>
                <legend>iCloud note sync</legend>
                <p>
                  Sync your library between your Mac, iPhone, and iPad. Local
                  saving works offline.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={syncEnabled}
                    onChange={(e) => {
                      setSyncEnabled(e.target.checked);
                      localStorage.setItem(
                        "kronos.notesSync",
                        String(e.target.checked),
                      );
                      if (e.target.checked) void library.sync();
                    }}
                  />
                  Enable iCloud sync
                </label>
                <button
                  disabled={state.busy || !syncEnabled}
                  onClick={() => void library.sync()}
                >
                  Sync now
                </button>
                {noteState.syncError && (
                  <p role="alert">{noteState.syncError}</p>
                )}
              </fieldset>
            </>
          )}
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
            <legend>Size</legend>
            <div className="app-zoom-setting">
              <label htmlFor="app-zoom">App zoom</label>
              <output htmlFor="app-zoom">{appZoom}%</output>
            </div>
            <p id="app-zoom-description">
              Scale text, icons, and controls throughout the app.
            </p>
            <input
              className="app-zoom-slider"
              id="app-zoom"
              type="range"
              min={75}
              max={150}
              step={5}
              value={appZoom}
              aria-valuetext={`${appZoom}%`}
              aria-describedby="app-zoom-description"
              onPointerDown={() => {
                draggingZoom.current = true;
              }}
              onPointerUp={finishZoomDrag}
              onPointerCancel={finishZoomDrag}
              onBlur={(event) => {
                draggingZoom.current = false;
                setCommittedZoom(Number(event.currentTarget.value));
              }}
              onChange={(event) => changeZoom(Number(event.target.value))}
            />
            <div className="app-zoom-range">
              <span>75%</span>
              <button
                type="button"
                disabled={appZoom === 100}
                onClick={() => changeZoom(100)}
              >
                Reset to 100%
              </button>
              <span>150%</span>
            </div>
            {zoomSaveError && <p role="alert">{zoomSaveError}</p>}
          </fieldset>
        </dialog>
        <main
          ref={scroll}
          className="page-scroll"
          onScroll={(e) => {
            if (doc.path)
              sessionStorage.setItem(
                `kronos.editorScroll:${doc.path}`,
                String(e.currentTarget.scrollTop),
              );
          }}
          onInputCapture={beginWriting}
        >
          {!state.doc ? (
            <div className="workspace-empty">
              <FolderOpen size={32} />
              <h1>
                {notesMode
                  ? "Your note library"
                  : state.workspace
                    ? "Choose a file to begin"
                    : "Your writing, in your folder"}
              </h1>
              <p>
                {notesMode
                  ? "Create a note to start writing. Notes are saved privately in Anubis."
                  : state.workspace
                    ? "Open a document from the sidebar, or create a new one."
                    : "Open a local folder to browse Markdown and text files, including subfolders."}
              </p>
              <button
                className="primary"
                disabled={state.busy || !state.ready}
                onClick={(event) =>
                  notesMode || state.workspace
                    ? create(event.currentTarget)
                    : void workspace.choose()
                }
              >
                {notesMode
                  ? "New note"
                  : state.workspace
                    ? "New document"
                    : "Choose folder"}
              </button>
            </div>
          ) : source || plainText ? (
            <textarea
              className="source writing"
              aria-label={plainText ? "Text editor" : "Markdown source"}
              disabled={state.busy}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={doc.markdown}
              onChange={(e) => update(e.target.value)}
            />
          ) : null}
          <div hidden={!state.doc || source || plainText}>
            <EditorContent editor={editor} />
          </div>
        </main>
      </section>
      {notesMode &&
        noteState.syncError &&
        !settingsOpen &&
        !state.error &&
        !imageError && (
          <div className="action-error" role="alert">
            <span>{noteState.syncError}</span>
            <button disabled={state.busy} onClick={() => void library.sync()}>
              Retry sync
            </button>
          </div>
        )}
      {imageError && (
        <div role="alert" className="action-error">
          <span>{imageError}</span>
          <button
            aria-label="Dismiss image error"
            onClick={() => setImageError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
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
              if (ok) {
                setModal(null);
                if (
                  compactNavigation() &&
                  (modal.kind === "new-file" || modal.kind === "copy")
                )
                  setSidebar(false);
              }
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
            {(modal.kind.startsWith("new") || modal.kind === "copy") && (
              <p className="modal-location">
                In{" "}
                {(modal.kind === "copy" && state.recoveredFrom
                  ? ""
                  : state.folder) || state.workspace?.name}
              </p>
            )}
            <label>
              {modal.kind === "new-folder" ? "Folder name" : "File name"}
              <input
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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
      <h1>Open the Anubis app</h1>
      <p>Local folders are available in the desktop and iOS apps.</p>
    </div>
  ),
);
