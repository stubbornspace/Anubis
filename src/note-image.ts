import Image from "@tiptap/extension-image";
import { invoke } from "@tauri-apps/api/core";
export const NoteImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "note-image";
      const img = document.createElement("img");
      img.alt = node.attrs.alt || "";
      if (node.attrs.title) img.title = node.attrs.title;
      dom.append(img);
      let alive = true;
      const src = String(node.attrs.src || "");
      if (/^anubis-asset:[0-9a-f]{64}$/.test(src)) {
        dom.setAttribute("aria-busy", "true");
        void invoke<string>("library_call", {
          request: { op: "getAsset", id: src.slice(13) },
        })
          .then((url) => {
            if (alive) {
              img.src = url;
              dom.removeAttribute("aria-busy");
            }
          })
          .catch(() => {
            if (alive) {
              dom.textContent = `Image unavailable${img.alt ? `: ${img.alt}` : ""}`;
              dom.removeAttribute("aria-busy");
            }
          });
      } else {
        dom.textContent = `Image: ${img.alt || "external attachment"}`;
      }
      return {
        dom,
        destroy: () => {
          alive = false;
        },
      };
    };
  },
});
