import Image from "@tiptap/extension-image";
import { ResizableNodeView } from "@tiptap/core";
import { cropSides, imageGeometry, resolveImage } from "./image-geometry";
const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...Object.fromEntries(
        cropSides.map((side) => [
          "crop" + side,
          {
            default: 0,
            parseHTML: (element: HTMLElement) =>
              Math.max(
                0,
                Math.min(
                  45,
                  Number(element.getAttribute("data-crop-" + side)) || 0,
                ),
              ),
            renderHTML: (attrs: Record<string, unknown>) => ({
              ["data-crop-" + side]: attrs["crop" + side],
            }),
          },
        ]),
      ),
    };
  },
  renderMarkdown(node, helpers, context) {
    const attrs = node.attrs || {};
    if (
      !attrs.width &&
      !attrs.height &&
      !cropSides.some((side) => attrs["crop" + side])
    )
      return this.parent?.(node, helpers, context) || "";
    return (
      '<img src="' +
      escape(attrs.src) +
      '" alt="' +
      escape(attrs.alt) +
      '"' +
      (attrs.title ? ' title="' + escape(attrs.title) + '"' : "") +
      (attrs.width ? ' width="' + imageGeometry(attrs).width + '"' : "") +
      cropSides
        .map(
          (side) =>
            " data-crop-" + side + '="' + imageGeometry(attrs).crop[side] + '"',
        )
        .join("") +
      ">"
    );
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      let alive = true;
      const frame = document.createElement("span");
      frame.className = "note-image";
      const viewport = document.createElement("span");
      viewport.className = "image-crop-viewport";
      const img = document.createElement("img");
      img.draggable = false;
      viewport.append(img);
      frame.append(viewport);
      const paint = () => {
        const { width, crop } = imageGeometry(current.attrs);
        frame.style.width = current.attrs.width
          ? width + "px"
          : Math.min(img.naturalWidth || 640, 640) + "px";
        frame.style.height = "auto";
        const x = (100 - crop.left - crop.right) / 100;
        const y = (100 - crop.top - crop.bottom) / 100;
        viewport.style.aspectRatio = String(
          ((img.naturalWidth || 1) * x) / ((img.naturalHeight || 1) * y),
        );
        img.style.width = 100 / x + "%";
        img.style.left = -crop.left / x + "%";
        img.style.top = -crop.top / y + "%";
        img.alt = current.attrs.alt || "";
      };
      img.onload = paint;
      const view = new ResizableNodeView({
        element: frame,
        editor,
        node,
        getPos,
        onResize: (width) => {
          frame.style.width = width + "px";
          frame.style.height = "auto";
        },
        onCommit: (width) => {
          const pos = getPos();
          if (pos === undefined || !editor.isEditable) return;
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes("image", {
              width: Math.round(width),
              height: null,
            })
            .run();
        },
        onUpdate: (updated) => {
          if (
            updated.type !== current.type ||
            updated.attrs.src !== current.attrs.src
          )
            return false;
          current = updated;
          paint();
          return true;
        },
        options: {
          directions: ["bottom-right", "bottom-left"],
          min: { width: 32, height: 32 },
          preserveAspectRatio: true,
        },
      });
      view.dom.classList.add("image-node");
      paint();
      void resolveImage(String(node.attrs.src || ""))
        .then((src) => {
          if (alive) img.src = src;
        })
        .catch(() => {
          if (alive)
            frame.textContent =
              "Image unavailable" + (img.alt ? ": " + img.alt : "");
        });
      const destroy = view.destroy.bind(view);
      view.destroy = () => {
        alive = false;
        img.onload = null;
        destroy();
      };
      frame.addEventListener("click", () => {
        const pos = getPos();
        if (pos !== undefined && editor.isEditable)
          editor.commands.setNodeSelection(pos);
      });
      return {
        dom: view.dom,
        update: view.update.bind(view),
        ignoreMutation: (mutation) => mutation.type !== "selection",
        destroy: view.destroy.bind(view),
      };
    };
  },
});
