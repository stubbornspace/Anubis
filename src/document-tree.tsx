import { memo, useEffect, useId, useRef, useState } from "react";
import {
  CloudDownload,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { workspace, type Entry } from "./workspace";
import { interfaceScale } from "./platform";
import { SidebarTree, type SidebarTreeNode } from "./sidebar-tree";

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
  const placeMenu = () => {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const menu = popup.current;
    const width = menu.offsetWidth || parseFloat(getComputedStyle(menu).width);
    const height = menu.offsetHeight || 100 * interfaceScale();
    const viewport = window.visualViewport;
    setPosition({
      top: Math.max(
        8,
        Math.min(
          rect.bottom + 4,
          (viewport?.height ?? innerHeight) - height - 8,
        ),
      ),
      left: Math.max(
        8,
        Math.min(
          rect.right - width,
          (viewport?.width ?? innerWidth) - width - 8,
        ),
      ),
    });
  };
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
        onClick={placeMenu}
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
          if (isOpen) {
            placeMenu();
            popup.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }
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

function DocumentTree({
  entries,
  active,
  selectedFolder,
  onRename,
  onOpen,
}: {
  entries: Entry[];
  active: string;
  selectedFolder: string;
  onRename: (entry: Entry) => void;
  onOpen: (path: string) => void;
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
  const nodes = (items: Entry[]): SidebarTreeNode[] =>
    items.map((entry) => {
      if (entry.directory) {
        const open = expanded.has(entry.path);
        return {
          kind: "branch",
          id: entry.path,
          label: entry.name,
          accessibleLabel: `Folder ${entry.name}`,
          disclosureLabel: entry.name,
          groupLabel: entry.name,
          title: `Create inside ${entry.path}`,
          icon: open ? <FolderOpen size={15} /> : <Folder size={15} />,
          selected: selectedFolder === entry.path,
          expanded: open,
          children: open ? nodes(entry.children) : [],
          emptyLabel: "Empty folder",
          onActivate: () =>
            workspace.selectFolder(
              selectedFolder === entry.path ? "" : entry.path,
            ),
          onToggle: (expanded) =>
            setExpanded((current) => {
              const next = new Set(current);
              if (expanded) next.add(entry.path);
              else next.delete(entry.path);
              return next;
            }),
        };
      }
      return {
        kind: "item",
        id: entry.path,
        label: entry.name,
        selected: active === entry.path,
        title: `${entry.path}${entry.cloud && !entry.cloud.downloaded ? " — Download from iCloud" : ""}`,
        icon:
          entry.cloud && !entry.cloud.downloaded ? (
            <CloudDownload size={16} />
          ) : (
            <FileText size={16} />
          ),
        onActivate: () => onOpen(entry.path),
        actions: (
          <FileActions
            document={entry}
            onRename={() => onRename(entry)}
            onDelete={() => void workspace.remove(entry)}
          />
        ),
      };
    });
  return <SidebarTree nodes={nodes(entries)} />;
}
export const MemoDocumentTree = memo(DocumentTree);
