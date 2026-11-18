import type { ComponentProps, ReactNode } from "react";
import type { ItemInstance, TreeInstance } from "@headless-tree/core";

// ReUI Basic Tree pattern (https://reui.io/components/tree), adapted to Anubis's
// CSS tokens and separate disclosure/actions. Headless Tree owns ARIA and focus.
export function Tree<T>({
  tree,
  children,
  label,
}: {
  tree: TreeInstance<T>;
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      {...tree.getContainerProps(label)}
      data-slot="tree"
      className="sidebar-tree"
    >
      {children}
    </div>
  );
}

export function TreeItem<T>({
  item,
  children,
  ...props
}: {
  item: ItemInstance<T>;
} & ComponentProps<"button">) {
  return (
    <button {...item.getProps()} data-slot="tree-item" {...props}>
      {children}
    </button>
  );
}

export function TreeItemLabel({ children }: { children: ReactNode }) {
  return <span data-slot="tree-item-label">{children}</span>;
}
