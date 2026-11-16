import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { tagsOf, tagText, replaceTag } from "./tags";
export type Note = {
  id: string;
  markdown: string;
  revision: number;
  created: number;
  updated: number;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  tags: string[];
};
export type NoteSummary = Omit<Note, "markdown"> & {
  title: string;
  excerpt: string;
  todo: boolean;
  thumbnail?: string | null;
};
export type LibraryState = {
  notes: NoteSummary[];
  note: Note | null;
  ready: boolean;
  busy: boolean;
  dirty: boolean;
  saving: boolean;
  error: string;
  conflict: boolean;
  generation: number;
  drafts: Note[];
  pinnedTags: string[];
  sync: "local" | "pending" | "syncing" | "synced" | "error";
  syncError: string;
};
const call = <T>(request: object) => invoke<T>("library_call", { request });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export class LibraryController {
  state: LibraryState = {
    notes: [],
    note: null,
    ready: false,
    busy: false,
    dirty: false,
    saving: false,
    error: "",
    conflict: false,
    generation: 0,
    drafts: [],
    pinnedTags: [],
    sync: "local",
    syncError: "",
  };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private initialization?: Promise<boolean>;
  private syncTask?: Promise<boolean>;
  private changes = 0;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private set(patch: Partial<LibraryState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private serial = (
    action: () => Promise<void>,
    busy = true,
  ): Promise<boolean> => {
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
  };
  private changed() {
    this.changes += 1;
    if (this.state.sync !== "syncing") this.set({ sync: "pending" });
  }
  private activate(note: Note | null) {
    this.set({
      note,
      dirty: false,
      conflict: false,
      error: "",
      generation: this.state.generation + 1,
    });
    if (note) localStorage.setItem("kronos.activeNote", note.id);
  }
  private refresh = async () => {
    const data = await call<{ notes: NoteSummary[]; drafts: Note[] }>({
      op: "load",
    });
    this.set(data);
  };
  initialize = () =>
    (this.initialization ??= this.serial(async () => {
      await this.refresh();
      const pinned = await call<string | null>({
        op: "getSetting",
        key: "pinnedTags",
      });
      this.set({ pinnedTags: pinned ? JSON.parse(pinned) : [], ready: true });
      const draft = this.state.drafts[0];
      if (draft) {
        this.activate(draft);
        this.set({
          dirty: true,
          conflict: true,
          error:
            "Recovered unsaved note. Save a recovery copy, or discard these edits.",
        });
        return;
      }
      const id = localStorage.getItem("kronos.activeNote");
      const first =
        this.state.notes.find((n) => n.id === id && !n.trashed) ??
        this.state.notes.find((n) => !n.trashed && !n.archived);
      if (first) this.activate(await call<Note>({ op: "read", id: first.id }));
    }).then((ok) => {
      if (!ok) this.initialization = undefined;
      return ok;
    }));
  edit = (markdown: string) => {
    if (!this.state.note || this.state.busy || this.state.note.trashed) return;
    this.set({
      note: { ...this.state.note, markdown, tags: tagsOf(markdown) },
      dirty: true,
    });
    this.changed();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.state.conflict)
        void this.serial(async () => {
          if (this.state.note)
            await call({ op: "draft", note: this.state.note });
        }, false);
      else void this.save();
    }, 500);
  };
  private flush = async () => {
    clearTimeout(this.timer);
    while (this.state.note && this.state.dirty) {
      const note = this.state.note;
      this.set({ saving: true });
      try {
        if (this.state.conflict) {
          await call({ op: "draft", note });
          throw new Error(
            "Save a recovery copy or discard the recovered edits before leaving this note.",
          );
        }
        const saved = await call<Note>({ op: "save", note });
        this.set({
          note: {
            ...this.state.note!,
            revision: saved.revision,
            updated: saved.updated,
          },
          dirty: this.state.note!.markdown !== note.markdown,
          error: "",
        });
      } catch (e) {
        this.set({ conflict: true });
        throw e;
      } finally {
        this.set({ saving: false });
      }
    }
    if (this.state.ready) await this.refresh();
  };
  save = () => this.serial(this.flush, false);
  select = (id: string) =>
    this.serial(async () => {
      if (id === this.state.note?.id) return;
      await this.flush();
      const draft = this.state.drafts.find((d) => d.id === id);
      this.activate(draft ?? (await call<Note>({ op: "read", id })));
      if (draft)
        this.set({
          dirty: true,
          conflict: true,
          error:
            "Recovered unsaved note. Save a recovery copy, or discard these edits.",
        });
    });
  create = (tag?: string, markdown?: string) =>
    this.serial(async () => {
      await this.flush();
      this.changed();
      const body =
        markdown ?? (tag ? `# Untitled note\n\n${tagText(tag)}\n` : "");
      this.activate(
        await call<Note>({ op: "create", markdown: body, tags: tagsOf(body) }),
      );
      await this.refresh();
    });
  change = (patch: Partial<Pick<Note, "pinned" | "archived" | "trashed">>) =>
    this.serial(async () => {
      await this.flush();
      if (!this.state.note) return;
      if (
        patch.trashed &&
        !(await confirm(
          "Move this note to library Trash? You can restore it later.",
          { title: "Trash note", kind: "warning" },
        ))
      )
        return;
      this.changed();
      this.set({
        note: await call<Note>({
          op: "save",
          note: { ...this.state.note, ...patch },
        }),
      });
      await this.refresh();
    });
  recover = () =>
    this.serial(async () => {
      const note = this.state.note;
      if (!note) return;
      this.changed();
      const copy = await call<Note>({
        op: "create",
        markdown: note.markdown,
        tags: tagsOf(note.markdown),
      });
      await call({ op: "clearDraft", id: note.id });
      this.activate(copy);
      await this.refresh();
    });
  discard = () =>
    this.serial(async () => {
      if (
        !this.state.note ||
        !(await confirm("Discard the unsaved edits to this note?", {
          title: "Discard note edits",
          kind: "warning",
        }))
      )
        return;
      const saved = await call<Note>({ op: "read", id: this.state.note.id });
      await call({ op: "clearDraft", id: saved.id });
      this.activate(saved);
      await this.refresh();
    });
  pinTag = (tag: string) =>
    this.serial(async () => {
      const tags = this.state.pinnedTags.includes(tag)
        ? this.state.pinnedTags.filter((t) => t !== tag)
        : [...this.state.pinnedTags, tag];
      await call({
        op: "setSetting",
        key: "pinnedTags",
        value: JSON.stringify(tags),
      });
      this.set({ pinnedTags: tags });
    });
  renameTag = (before: string, after: string | null) =>
    this.serial(async () => {
      await this.flush();
      if (
        after !== null &&
        (tagsOf(tagText(after)).length !== 1 ||
          tagsOf(tagText(after))[0] !== after)
      )
        throw new Error("Enter a valid tag name, such as work/project.");
      this.changed();
      // Every write is version checked and retains the previous revision. A failure
      // stops the batch; already updated notes remain visible and recoverable.
      try {
        for (const summary of this.state.notes) {
          if (
            !summary.tags.some(
              (t) => t === before || t.startsWith(`${before}/`),
            )
          )
            continue;
          const note = await call<Note>({ op: "read", id: summary.id });
          note.markdown = replaceTag(note.markdown, before, after);
          note.tags = tagsOf(note.markdown);
          const saved = await call<Note>({ op: "save", note });
          if (this.state.note?.id === saved.id) this.activate(saved);
        }
      } finally {
        await this.refresh();
      }
    });
  sync = (): Promise<boolean> => {
    // Only local preparation/reconciliation use the save queue. Network waits
    // must never hold up editing, autosave, switching notes, or close/background.
    return (this.syncTask ??= this.runSync().finally(() => {
      this.syncTask = undefined;
    }));
  };
  private runSync = async (): Promise<boolean> => {
    if (!(await this.save())) return false;
    const changes = this.changes;
    this.set({ sync: "syncing", syncError: "" });
    let result: { pending: boolean; conflicts: number } | undefined;
    let failure = "";
    try {
      result = await invoke("sync_library");
    } catch (e) {
      failure = message(e);
    }
    // A failed upload may still have applied incoming changes. Reconcile in both
    // cases, but never replace a draft or a note edited while the read awaited IPC.
    const reconciled = await this.serial(async () => {
      await this.refresh();
      const note = this.state.note;
      if (note && !this.state.dirty && !this.state.conflict) {
        const saved = await call<Note>({ op: "read", id: note.id });
        if (
          this.state.note === note &&
          !this.state.dirty &&
          !this.state.conflict
        ) {
          if (saved.markdown !== note.markdown) this.activate(saved);
          else this.set({ note: saved });
        }
      }
    }, false);
    if (!reconciled && !failure) failure = this.state.error;
    this.set({
      sync: failure
        ? "error"
        : result?.pending || this.changes !== changes || this.state.dirty
          ? "pending"
          : "synced",
      syncError:
        failure ||
        (result?.conflicts
          ? `${result.conflicts} conflicting note(s) were preserved as separate conflict copies. Review them in All Notes.`
          : ""),
    });
    return !failure;
  };
  export = (noteId?: string) =>
    this.serial(async () => {
      await this.flush();
      await invoke("export_library", { noteId: noteId ?? null });
    });
  importBackup = (json: string) =>
    this.serial(async () => {
      await this.flush();
      this.changed();
      await call({ op: "restore", json });
      await this.refresh();
      const pinned = await call<string | null>({
        op: "getSetting",
        key: "pinnedTags",
      });
      this.set({ pinnedTags: pinned ? JSON.parse(pinned) : [] });
    });
  restoreRevision = (markdown: string) =>
    this.serial(async () => {
      await this.flush();
      if (!this.state.note) return;
      this.changed();
      const note = { ...this.state.note, markdown, tags: tagsOf(markdown) };
      this.activate(await call<Note>({ op: "save", note }));
      await this.refresh();
    });
  dismissError = () => {
    if (!this.state.conflict) this.set({ error: "" });
  };
}
export const library = new LibraryController();
