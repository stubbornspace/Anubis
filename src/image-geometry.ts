import { invoke } from "@tauri-apps/api/core";
export const cropSides = ["top", "right", "bottom", "left"] as const;
export type Crop = Record<(typeof cropSides)[number], number>;
export function imageGeometry(attrs: Record<string, unknown>) {
  const crop = Object.fromEntries(
    cropSides.map((side) => [
      side,
      Math.max(0, Math.min(45, Number(attrs["crop" + side]) || 0)),
    ]),
  ) as Crop;
  const width = Math.max(32, Math.min(4096, Number(attrs.width) || 640));
  return { crop, width };
}
export async function resolveImage(src: string): Promise<string> {
  if (/^anubis-asset:[0-9a-f]{64}$/.test(src)) {
    return invoke<string>("library_call", {
      request: { op: "getAsset", id: src.slice(13) },
    });
  }
  if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src))
    return src;
  throw new Error("Editing is available for images inserted into Anubis.");
}
