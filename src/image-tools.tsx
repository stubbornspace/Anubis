import { NodeSelection } from "@tiptap/pm/state";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Crop as CropIcon } from "lucide-react";
import {
  cropSides,
  imageGeometry,
  resolveImage,
  type Crop,
} from "./image-geometry";

export function ImageTools({ editor }: { editor: Editor }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const target = useRef<{ pos: number; src: string } | null>(null);
  const [url, setUrl] = useState("");
  const [width, setWidth] = useState(640);
  const [crop, setCrop] = useState<Crop>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const [ratio, setRatio] = useState(1);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const open = async () => {
    const node =
      editor.state.selection instanceof NodeSelection
        ? editor.state.selection.node
        : null;
    if (!node || node.type.name !== "image") return;
    target.current = { pos: editor.state.selection.from, src: node.attrs.src };
    const geometry = imageGeometry(node.attrs);
    setWidth(geometry.width);
    setCrop(geometry.crop);
    setUrl("");
    setError("");
    setLoaded(false);
    dialog.current?.showModal();
    try {
      setUrl(await resolveImage(node.attrs.src));
    } catch (e) {
      setError(String(e));
    }
  };
  const x = (100 - crop.left - crop.right) / 100;
  const y = (100 - crop.top - crop.bottom) / 100;
  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="imageTools"
        updateDelay={0}
        options={{ placement: "top", offset: 8 }}
        shouldShow={({ editor: active, state }) =>
          active.isEditable &&
          state.selection instanceof NodeSelection &&
          state.selection.node.type.name === "image"
        }
        className="selection-toolbar-anchor"
      >
        <div className="selection-toolbar">
          <button
            ref={trigger}
            aria-label="Crop and resize image"
            title="Crop and resize image"
            onClick={() => void open()}
          >
            <CropIcon size={16} /> Crop &amp; resize
          </button>
        </div>
      </BubbleMenu>
      {createPortal(
        <dialog
          ref={dialog}
          className="settings-dialog image-edit-dialog"
          aria-label="Crop and resize image"
          onClose={() => {
            const selected = target.current;
            target.current = null;
            requestAnimationFrame(() => {
              if (editor.isDestroyed) return;
              if (
                selected &&
                editor.state.doc.nodeAt(selected.pos)?.attrs.src ===
                  selected.src
              ) {
                editor.commands.setNodeSelection(selected.pos);
                editor.view.dispatch(
                  editor.state.tr.setMeta("imageTools", "show"),
                );
                trigger.current?.focus();
              } else editor.commands.focus();
            });
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const selected = target.current;
              if (
                !selected ||
                !editor.isEditable ||
                editor.state.doc.nodeAt(selected.pos)?.attrs.src !==
                  selected.src
              ) {
                setError(
                  "The image changed. Close this dialog and select it again.",
                );
                return;
              }
              editor
                .chain()
                .setNodeSelection(selected.pos)
                .updateAttributes("image", {
                  width,
                  height: null,
                  ...Object.fromEntries(
                    cropSides.map((side) => ["crop" + side, crop[side]]),
                  ),
                })
                .run();
              dialog.current?.close();
            }}
          >
            <h2>Crop &amp; resize image</h2>
            <p>
              The original image is preserved. Crop each edge and set its
              display width.
            </p>
            {url && (
              <div
                className="image-edit-preview image-crop-viewport"
                style={{
                  aspectRatio: (ratio * x) / y,
                  width: `min(100%, ${(20 * ratio * x) / y}rem)`,
                }}
              >
                <img
                  src={url}
                  alt="Crop preview"
                  style={{
                    width: 100 / x + "%",
                    left: -crop.left / x + "%",
                    top: -crop.top / y + "%",
                  }}
                  onLoad={(event) => {
                    setRatio(
                      event.currentTarget.naturalWidth /
                        event.currentTarget.naturalHeight,
                    );
                    setLoaded(true);
                  }}
                  onError={() => setError("This image could not be decoded.")}
                />
              </div>
            )}
            <label>
              Display width (px)
              <input
                autoFocus
                type="number"
                min={32}
                max={4096}
                required
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            {cropSides.map((side) => (
              <label key={side}>
                Crop {side} ({crop[side]}%)
                <input
                  aria-label={"Crop " + side}
                  type="range"
                  min={0}
                  max={45}
                  step={1}
                  value={crop[side]}
                  onChange={(event) =>
                    setCrop({ ...crop, [side]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
            {error && <p role="alert">{error}</p>}
            <div className="library-dialog-actions">
              <button
                type="button"
                onClick={() =>
                  setCrop({ top: 0, right: 0, bottom: 0, left: 0 })
                }
              >
                Reset crop
              </button>
              <button type="button" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
              <button type="submit" disabled={!loaded || !!error}>
                Apply
              </button>
            </div>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  );
}
