import { useId, useLayoutEffect, useMemo, type ReactNode } from "react";
import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { Tree, TreeItem, TreeItemLabel } from "./components/tree";
import { ChevronDown, ChevronRight } from "lucide-react";

type TreeRow = {
  id: string;
  label: string;
  accessibleLabel?: string;
  title?: string;
  icon?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  onActivate: () => void;
};
export type SidebarTreeNode = TreeRow &
  (
    | {
        kind: "branch";
        expanded: boolean;
        disclosureLabel: string;
        groupLabel: string;
        children: SidebarTreeNode[];
        emptyLabel?: string;
        onToggle: (expanded: boolean) => void;
      }
    | { kind: "item"; actions?: ReactNode }
  );

// Both navigation modes use the same rows and recursive hierarchy. Controllers
// own expansion and activation so navigation still passes through their saves.
export function SidebarTree({
  nodes,
  disabled = false,
}: {
  nodes: SidebarTreeNode[];
  disabled?: boolean;
}) {
  const treeId = useId();
  const rootId = `${treeId}-root`;
  const byId = useMemo(() => {
    const map = new Map<string, SidebarTreeNode>();
    const index = (items: SidebarTreeNode[]) =>
      items.forEach((node) => {
        map.set(node.id, node);
        if (node.kind === "branch") index(node.children);
      });
    index(nodes);
    return map;
  }, [nodes]);
  const expandedItems = useMemo(
    () =>
      [...byId.values()]
        .filter((node) => node.kind === "branch" && node.expanded)
        .map((node) => node.id),
    [byId],
  );
  const canNavigate = () =>
    !disabled &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement.matches('[data-slot="tree-item"]:not(:disabled)');
  const tree = useTree<SidebarTreeNode>({
    rootItemId: rootId,
    state: { expandedItems },
    getItemName: (item) => item.getItemData().label,
    isItemFolder: (item) => item.getItemData().kind === "branch",
    dataLoader: {
      getItem: (id) => {
        // Headless Tree never displays the root, but the loader still provides
        // valid data for callers inspecting it.
        if (id === rootId)
          return {
            kind: "item",
            id,
            label: "Navigation",
            onActivate: () => {},
          };
        const node = byId.get(id);
        if (!node) throw new Error(`Unknown sidebar item: ${id}`);
        return node;
      },
      getChildren: (id) => {
        if (id === rootId) return nodes.map((node) => node.id);
        const node = byId.get(id);
        return node?.kind === "branch"
          ? node.children.map((child) => child.id)
          : [];
      },
    },
    setExpandedItems: (update) => {
      if (disabled) return;
      const next = new Set(
        typeof update === "function" ? update(expandedItems) : update,
      );
      for (const node of byId.values()) {
        if (
          node.kind === "branch" &&
          !node.disabled &&
          next.has(node.id) !== node.expanded
        )
          node.onToggle(next.has(node.id));
      }
    },
    onPrimaryAction: (item) => {
      const node = item.getItemData();
      if (!disabled && !node.disabled) node.onActivate();
    },
    hotkeys: {
      focusNextItem: {
        hotkey: "ArrowDown",
        isEnabled: canNavigate,
        preventDefault: true,
      },
      focusPreviousItem: {
        hotkey: "ArrowUp",
        isEnabled: canNavigate,
        preventDefault: true,
      },
      focusFirstItem: {
        hotkey: "Home",
        isEnabled: canNavigate,
        preventDefault: true,
      },
      focusLastItem: {
        hotkey: "End",
        isEnabled: canNavigate,
        preventDefault: true,
      },
      collapseOrUp: {
        hotkey: "ArrowLeft",
        isEnabled: canNavigate,
        preventDefault: true,
      },
      expandOrDown: {
        hotkey: "ArrowRight",
        isEnabled: canNavigate,
        preventDefault: true,
        handler: (_event, current) => {
          const item = current.getFocusedItem();
          if (!item.isFolder()) return;
          if (!item.isExpanded()) item.expand();
          else if (item.getChildren().length) {
            item.getChildren()[0].setFocused();
            current.updateDomFocus();
          }
        },
      },
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });
  useLayoutEffect(() => {
    tree.rebuildTree();
    const visible = tree.getItems();
    const focused = tree.getState().focusedItem;
    if (focused && !visible.some((item) => item.getId() === focused)) {
      const active = document.activeElement;
      const restore =
        active instanceof HTMLElement &&
        active.matches('[data-slot="tree-item"]');
      visible[0]?.setFocused();
      if (restore) tree.updateDomFocus();
    }
  }, [tree, byId]);
  const visibleIds = new Set(tree.getItems().map((item) => item.getId()));
  const render = (
    items: SidebarTreeNode[],
    depth = 0,
    parent = "",
  ): ReactNode =>
    items
      .filter((node) => visibleIds.has(node.id))
      .map((node) => {
        const unavailable = disabled || node.disabled;
        const item = tree.getItemInstance(node.id);
        const activate = () => {
          item.setFocused();
          item.primaryAction();
        };
        if (node.kind === "branch")
          return (
            <div key={node.id}>
              <div
                className={`folder-row ${node.className ?? ""} ${node.selected ? "selected-folder" : ""}`}
                style={{ paddingLeft: `${(4 + depth * 14) / 16}rem` }}
              >
                <button
                  className="folder-disclosure"
                  aria-label={`${node.expanded ? "Collapse" : "Expand"} ${node.disclosureLabel}`}
                  title={`${node.expanded ? "Collapse" : "Expand"} ${node.disclosureLabel}`}
                  aria-expanded={node.expanded}
                  disabled={unavailable}
                  onClick={() => {
                    item.setFocused();
                    node.expanded ? item.collapse() : item.expand();
                  }}
                >
                  {node.expanded ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                </button>
                <TreeItem
                  item={item}
                  className="folder-select"
                  data-tree-node={node.id}
                  data-tree-parent={parent}
                  aria-label={node.accessibleLabel}
                  aria-expanded={node.expanded}
                  aria-selected={!!node.selected}
                  aria-owns={
                    node.expanded
                      ? `${treeId}-${encodeURIComponent(node.id)}`
                      : undefined
                  }
                  title={node.title}
                  disabled={unavailable}
                  onFocus={() => item.setFocused()}
                  onClick={activate}
                >
                  {node.icon}
                  <TreeItemLabel>{node.label}</TreeItemLabel>
                </TreeItem>
              </div>
              {node.expanded && (
                <div
                  id={`${treeId}-${encodeURIComponent(node.id)}`}
                  role="group"
                  aria-label={node.groupLabel}
                >
                  {render(node.children, depth + 1, node.id)}
                  {!node.children.length && node.emptyLabel && (
                    <p
                      className="folder-empty"
                      style={{ paddingLeft: `${(38 + depth * 14) / 16}rem` }}
                    >
                      {node.emptyLabel}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        return (
          <div
            key={node.id}
            className={`file-row ${node.className ?? ""} ${node.selected ? "active" : ""}`}
            style={{ marginLeft: `${(depth * 14) / 16}rem` }}
          >
            <TreeItem
              item={item}
              className="file-open"
              data-tree-node={node.id}
              data-tree-parent={parent}
              aria-label={node.accessibleLabel}
              aria-current={node.selected ? "page" : undefined}
              title={node.title}
              disabled={unavailable}
              aria-selected={!!node.selected}
              onFocus={() => item.setFocused()}
              onClick={activate}
            >
              {node.icon}
              <TreeItemLabel>{node.label}</TreeItemLabel>
            </TreeItem>
            {node.actions}
          </div>
        );
      });
  return (
    <Tree tree={tree} label="Navigation">
      {render(nodes)}
    </Tree>
  );
}
