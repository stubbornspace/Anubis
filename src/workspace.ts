import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { isIOS } from "./platform";

export type Entry = {
  path: string;
  name: string;
  directory: boolean;
  children: Entry[];
};
export type Document = {
  path: string;
  name: string;
  markdown: string;
  version: string;
};
export type Workspace = {
  root: string;
  name: string;
  entries: Entry[];
  warnings: string[];
};
export type State = {
  workspace: Workspace | null;
  doc: Document | null;
  folder: string;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  error: string;
  conflict: boolean;
  revision: number;
  ready: boolean;
  recoveredFrom: string | null;
};
export const parentOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const flatten = (entries: Entry[]): Entry[] =>
  entries.flatMap((e) => (e.directory ? flatten(e.children) : [e]));
export const supportedName = (name: string) =>
  /\.(md|markdown|mdown|txt)$/i.test(name)
    ? name.trim()
    : `${name.trim() || "Untitled"}.md`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class WorkspaceController {
  state: State = {
    workspace: null,
    doc: null,
    folder: "",
    dirty: false,
    saving: false,
    busy: false,
    error: "",
    conflict: false,
    revision: 0,
    ready: false,
    recoveredFrom: null,
  };
  private subscribers = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private initializing?: Promise<void>;
  subscribe = (fn: () => void) => {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  };
  snapshot = () => this.state;
  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach((fn) => fn());
  }
  private root() {
    if (!this.state.workspace) throw new Error("Choose a folder first.");
    return this.state.workspace.root;
  }
  private async serial(
    action: () => Promise<void>,
    busy = true,
  ): Promise<boolean> {
    const task = this.queue.then(async () => {
      if (busy) this.set({ busy: true });
      try {
        await action();
        return true;
      } catch (e) {
        this.set({ error: message(e) });
        return false;
      } finally {
        if (busy) this.set({ busy: false });
      }
    });
    this.queue = task;
    return task;
  }
  private activate(doc: Document | null) {
    this.set({
      doc,
      dirty: false,
      conflict: false,
      error: "",
      revision: this.state.revision + 1,
      folder: doc ? parentOf(doc.path) : "",
      recoveredFrom: null,
    });
    if (doc) localStorage.setItem(`kronos.active:${this.root()}`, doc.path);
  }
  private async accept(workspace: Workspace) {
    this.set({ workspace, folder: "" });
    this.activate(null);
    if (isIOS) {
      const recovery = await invoke<{
        root: string;
        document: Document;
      } | null>("load_recovery_draft");
      if (recovery) {
        this.activate(recovery.document);
        this.set({
          dirty: true,
          conflict: true,
          recoveredFrom: recovery.root,
          error: `Recovered unsaved edits for ${recovery.document.name} from your last session. Save a copy to keep them, or reload from disk to discard them.`,
        });
        return;
      }
    }
    const remembered = localStorage.getItem(`kronos.active:${workspace.root}`);
    const files = flatten(workspace.entries);
    const first = files.find((e) => e.path === remembered) || files[0];
    if (first)
      this.activate(
        await invoke<Document>("read_document", {
          root: workspace.root,
          path: first.path,
        }),
      );
  }
  initialize = () => {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      if (!isTauri()) {
        this.set({
          ready: true,
          error: "Open Anubis as an app to choose a local folder.",
        });
        return;
      }
      await this.serial(async () => {
        const workspace = await invoke<Workspace | null>("restore_workspace");
        if (workspace) await this.accept(workspace);
      });
      this.set({ ready: true });
    })();
    return this.initializing;
  };
  edit = (markdown: string) => {
    if (!this.state.doc || this.state.busy) return;
    this.set({ doc: { ...this.state.doc, markdown }, dirty: true });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.state.conflict) void this.save();
    }, 500);
  };
  private async flush() {
    clearTimeout(this.timer);
    let savedAny = false;
    while (this.state.dirty && this.state.doc) {
      const doc = this.state.doc;
      this.set({ saving: true });
      try {
        // iOS may terminate a suspended app even when a save fails. Keep a durable
        // draft before attempting the write, including edits to a recovered draft.
        if (isIOS)
          await invoke("store_recovery_draft", { root: this.root(), ...doc });
        if (this.state.conflict)
          throw new Error(
            "Resolve the file conflict before leaving this document.",
          );
        const saved = await invoke<Document>("save_document", {
          root: this.root(),
          ...doc,
        });
        savedAny = true;
        const current = this.state.doc!;
        this.set({
          doc: { ...current, version: saved.version },
          dirty: current.markdown !== doc.markdown,
          error: "",
        });
      } catch (e) {
        // Stop automatic retries; the user's unsaved text remains available for recovery.
        this.set({ conflict: true });
        throw e;
      } finally {
        this.set({ saving: false });
      }
    }
    if (isIOS && savedAny) await invoke("clear_recovery_draft");
  }
  save = () => this.serial(() => this.flush(), false);
  choose = () =>
    this.serial(async () => {
      await this.flush();
      const workspace = await invoke<Workspace | null>("choose_workspace");
      if (workspace) await this.accept(workspace);
    });
  select = (path: string) =>
    this.serial(async () => {
      if (path === this.state.doc?.path) {
        this.selectFolder(parentOf(path));
        return;
      }
      await this.flush();
      this.activate(
        await invoke<Document>("read_document", { root: this.root(), path }),
      );
    });
  selectFolder = (folder: string) => this.set({ folder });
  refresh = () =>
    this.serial(async () => {
      if (!this.state.workspace) return;
      const root = this.root();
      const workspace = await invoke<Workspace>("list_workspace", { root });
      this.set({ workspace });
      const doc = this.state.doc;
      if (!doc) return;
      // Never replace unsaved editor text with watcher events (including our own writes).
      if (this.state.dirty || this.state.conflict) return;
      if (!flatten(workspace.entries).some((e) => e.path === doc.path)) {
        this.set({
          conflict: true,
          error:
            "This file was moved or deleted outside Anubis. Save a copy to keep it, or reload to close it.",
        });
        return;
      }
      const disk = await invoke<Document>("read_document", {
        root,
        path: doc.path,
      });
      if (!this.state.dirty && disk.version !== this.state.doc?.version)
        this.activate(disk);
    }, false);
  reload = () =>
    this.serial(async () => {
      if (!this.state.doc) return;
      if (
        this.state.dirty &&
        !(await confirm("Discard your unsaved edits and reload from disk?", {
          title: "Reload document",
          kind: "warning",
        }))
      )
        return;
      const root = this.root();
      const workspace = await invoke<Workspace>("list_workspace", { root });
      this.set({ workspace });
      const differentFolder =
        this.state.recoveredFrom !== null && this.state.recoveredFrom !== root;
      const disk =
        !differentFolder &&
        flatten(workspace.entries).some((e) => e.path === this.state.doc!.path)
          ? await invoke<Document>("read_document", {
              root,
              path: this.state.doc.path,
            })
          : null;
      if (isIOS) await invoke("clear_recovery_draft");
      this.activate(disk);
    });
  create = (name: string, directory = false) =>
    this.serial(async () => {
      await this.flush();
      const root = this.root();
      const parent = this.state.folder;
      if (directory) {
        await invoke("create_folder", { root, parent, name: name.trim() });
        this.set({ folder: parent ? `${parent}/${name.trim()}` : name.trim() });
      } else
        this.activate(
          await invoke<Document>("create_document", {
            root,
            parent,
            name: supportedName(name),
            markdown: "",
          }),
        );
      this.set({
        workspace: await invoke<Workspace>("list_workspace", { root }),
      });
    });
  saveCopy = (name: string) =>
    this.serial(async () => {
      if (!this.state.doc) return;
      const root = this.root();
      const copy = await invoke<Document>("create_document", {
        root,
        parent: this.state.recoveredFrom ? "" : parentOf(this.state.doc.path),
        name: supportedName(name),
        markdown: this.state.doc.markdown,
      });
      if (isIOS) await invoke("clear_recovery_draft");
      this.activate(copy);
      this.set({
        workspace: await invoke<Workspace>("list_workspace", { root }),
      });
    });
  rename = (entry: Entry, name: string) =>
    this.serial(async () => {
      await this.flush();
      const root = this.root();
      const doc = await invoke<Document>("read_document", {
        root,
        path: entry.path,
      });
      const renamed = await invoke<Document>("rename_document", {
        root,
        path: doc.path,
        version: doc.version,
        name: supportedName(name),
      });
      if (entry.path === this.state.doc?.path) this.activate(renamed);
      this.set({
        workspace: await invoke<Workspace>("list_workspace", { root }),
      });
    });
  remove = (entry: Entry) =>
    this.serial(async () => {
      await this.flush();
      const root = this.root();
      const doc = await invoke<Document>("read_document", {
        root,
        path: entry.path,
      });
      if (
        !(await confirm(`Move ${entry.name} to Trash?`, {
          title: "Delete document",
          kind: "warning",
          okLabel: "Move to Trash",
          cancelLabel: "Cancel",
        }))
      )
        return;
      await invoke("delete_document", {
        root,
        path: doc.path,
        version: doc.version,
      });
      if (entry.path === this.state.doc?.path) this.activate(null);
      this.set({
        workspace: await invoke<Workspace>("list_workspace", { root }),
      });
    });
  dismissError = () => {
    if (!this.state.conflict) this.set({ error: "" });
  };
  async connect() {
    if (!isTauri()) return () => {};
    let timer: ReturnType<typeof setTimeout>;
    const unwatch = await listen("workspace-changed", () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.refresh(), 300);
    });
    const watchError = await listen<string>("workspace-watch-error", (e) =>
      this.set({
        error: `Folder updates stopped: ${e.payload}. Use Refresh folder.`,
      }),
    );
    const appWindow = getCurrentWindow();
    const unfocus = await appWindow.onFocusChanged(({ payload }) => {
      if (payload) void this.refresh();
    });
    const unclose = await listen("workspace-before-exit", async () => {
      if (await this.save()) await invoke("finish_exit");
    });
    const visibility = () => {
      if (document.visibilityState === "hidden") void this.save();
      else void this.refresh();
    };
    const background = () => {
      void this.save().finally(() => {
        if (isIOS) void invoke("finish_background_save");
      });
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("anubis-background", background);
    await invoke("frontend_ready");
    return () => {
      clearTimeout(timer);
      unwatch();
      watchError();
      unfocus();
      unclose();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("anubis-background", background);
    };
  }
}
export const workspace = new WorkspaceController();
