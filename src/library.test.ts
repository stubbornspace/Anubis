// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LibraryController, type Note } from "./library";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const initial = (id: string): Note => ({
  id,
  markdown: id,
  revision: 1,
  created: 1,
  updated: 1,
  pinned: false,
  archived: false,
  trashed: false,
  tags: [],
});
let controller: LibraryController;
let notes: Map<string, Note>;
let network: ReturnType<
  typeof deferred<{ pending: boolean; conflicts: number }>
>;
let readGate: ReturnType<typeof deferred<Note>> | undefined;
let drafts: Note[];
beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  notes = new Map([
    ["first", initial("first")],
    ["second", initial("second")],
  ]);
  drafts = [];
  network = deferred();
  readGate = undefined;
  vi.mocked(invoke)
    .mockReset()
    .mockImplementation(async (cmd, args) => {
      if (cmd === "sync_library") return network.promise;
      const r = (args as { request: any }).request;
      if (r.op === "load") return { notes: [...notes.values()], drafts };
      if (r.op === "getSetting") return null;
      if (r.op === "read")
        return readGate ? readGate.promise : { ...notes.get(r.id)! };
      if (r.op === "draft") {
        drafts.push({ ...r.note });
        return;
      }
      if (r.op === "save") {
        const old = notes.get(r.note.id)!;
        if (old.revision !== r.note.revision) {
          drafts.push({ ...r.note });
          throw new Error("Note changed; draft preserved");
        }
        const saved = { ...r.note, revision: old.revision + 1 };
        notes.set(saved.id, saved);
        return saved;
      }
      throw new Error(`Unexpected ${r.op}`);
    });
  controller = new LibraryController();
  await controller.initialize();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function start() {
  const task = controller.sync();
  // Flush queued preparation without advancing the autosave timer.
  await vi.waitFor(() => expect(controller.state.sync).toBe("syncing"));
  return { task };
}
it("coalesces sync and allows autosave, navigation and close flush during a stalled request", async () => {
  const { task } = await start();
  expect(controller.sync()).toBe(task);
  expect(controller.state.busy).toBe(false);
  controller.edit("edited while offline");
  await vi.advanceTimersByTimeAsync(500);
  expect(notes.get("first")?.markdown).toBe("edited while offline");
  expect(await controller.select("second")).toBe(true);
  controller.edit("second edited");
  expect(await controller.save()).toBe(true);
  network.resolve({ pending: false, conflicts: 0 });
  await task;
  expect(controller.state.note?.id).toBe("second");
  expect(controller.state.note?.markdown).toBe("second edited");
  expect(controller.state.sync).toBe("pending");
  expect(
    vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "sync_library"),
  ).toHaveLength(1);
});
it("does not replace unsaved edits with an incoming remote revision; stale save preserves recovery", async () => {
  const { task } = await start();
  controller.edit("unsaved local text");
  notes.set("first", {
    ...initial("first"),
    markdown: "remote text",
    revision: 2,
  });
  network.resolve({ pending: false, conflicts: 0 });
  await task;
  expect(controller.state.note?.markdown).toBe("unsaved local text");
  expect(controller.state.dirty).toBe(true);
  expect(await controller.save()).toBe(false);
  expect(controller.state.conflict).toBe(true);
  expect(drafts[0].markdown).toBe("unsaved local text");
  expect(notes.get("first")?.markdown).toBe("remote text");
});
it("preserves typing that happens while the final note read is in flight", async () => {
  const { task } = await start();
  readGate = deferred();
  const calls = vi.mocked(invoke).mock.calls.length;
  network.resolve({ pending: false, conflicts: 0 });
  await vi.waitFor(() =>
    expect(
      vi
        .mocked(invoke)
        .mock.calls.slice(calls)
        .some(([, args]) => (args as any)?.request?.op === "read"),
    ).toBe(true),
  );
  controller.edit("typed during read");
  readGate.resolve({ ...initial("first"), markdown: "remote", revision: 2 });
  await task;
  expect(controller.state.note?.markdown).toBe("typed during read");
  expect(controller.state.note?.revision).toBe(1);
  expect(controller.state.dirty).toBe(true);
});
it("reconciles clean remote content even when the later upload fails", async () => {
  const { task } = await start();
  notes.set("first", {
    ...initial("first"),
    markdown: "downloaded text",
    revision: 2,
  });
  network.reject(new Error("upload offline"));
  expect(await task).toBe(false);
  expect(controller.state.note?.markdown).toBe("downloaded text");
  expect(controller.state.syncError).toBe("upload offline");
  expect(controller.state.busy).toBe(false);
  controller.edit("continue locally");
  expect(await controller.save()).toBe(true);
});
it("metadata-only refresh retains editor generation and updates remote flags", async () => {
  const generation = controller.state.generation;
  const { task } = await start();
  notes.set("first", { ...initial("first"), pinned: true, revision: 2 });
  network.resolve({ pending: false, conflicts: 0 });
  await task;
  expect(controller.state.generation).toBe(generation);
  expect(controller.state.note?.pinned).toBe(true);
  expect(controller.state.sync).toBe("synced");
});
it("does not begin sync if local save fails", async () => {
  controller.edit("local draft");
  notes.set("first", { ...initial("first"), revision: 2 });
  expect(await controller.sync()).toBe(false);
  expect(controller.state.conflict).toBe(true);
  expect(
    vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "sync_library"),
  ).toBe(false);
});
