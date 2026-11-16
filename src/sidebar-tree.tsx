import { type KeyboardEvent, type ReactNode } from "react";
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
  const byId = new Map<string, SidebarTreeNode>();
  const index = (items: SidebarTreeNode[]) =>
    items.forEach((node) => {
      byId.set(node.id, node);
      if (node.kind === "branch") index(node.children);
    });
  index(nodes);
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      disabled ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !target.matches("[data-tree-node]")
    )
      return;
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-tree-node]:not(:disabled)",
      ),
    ];
    const position = buttons.indexOf(target as HTMLButtonElement);
    const node = byId.get(target.dataset.treeNode!);
    if (!node || position < 0) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      buttons[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : Math.max(
                0,
                Math.min(
                  buttons.length - 1,
                  position + (event.key === "ArrowDown" ? 1 : -1),
                ),
              )
      ]?.focus();
    } else if (event.key === "ArrowRight" && node.kind === "branch") {
      event.preventDefault();
      if (!node.expanded) node.onToggle(true);
      else if (buttons[position + 1]?.dataset.treeParent === node.id)
        buttons[position + 1].focus();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.kind === "branch" && node.expanded) node.onToggle(false);
      else
        buttons
          .find(
            (button) => button.dataset.treeNode === target.dataset.treeParent,
          )
          ?.focus();
    }
  };
  const render = (
    items: SidebarTreeNode[],
    depth = 0,
    parent = "",
  ): ReactNode =>
    items.map((node) => {
      const unavailable = disabled || node.disabled;
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
                onClick={() => node.onToggle(!node.expanded)}
              >
                {node.expanded ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
              <button
                className="folder-select"
                data-tree-node={node.id}
                data-tree-parent={parent}
                aria-label={node.accessibleLabel}
                aria-expanded={node.expanded}
                aria-pressed={!!node.selected}
                title={node.title}
                disabled={unavailable}
                onClick={node.onActivate}
              >
                {node.icon}
                <span>{node.label}</span>
              </button>
            </div>
            {node.expanded && (
              <div role="group" aria-label={node.groupLabel}>
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
          <button
            className="file-open"
            data-tree-node={node.id}
            data-tree-parent={parent}
            aria-label={node.accessibleLabel}
            aria-current={node.selected ? "page" : undefined}
            title={node.title}
            disabled={unavailable}
            onClick={node.onActivate}
          >
            {node.icon}
            <span>{node.label}</span>
          </button>
          {node.actions}
        </div>
      );
    });
  return (
    <div className="sidebar-tree" onKeyDown={handleKeys}>
      {render(nodes)}
    </div>
  );
}
