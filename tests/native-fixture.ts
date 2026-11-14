import { test as base, expect, type Page } from "@playwright/test";

// Browser engines exercise the desktop UI through a mocked IPC boundary.
// Real filesystem behavior is tested separately against temporary directories in Rust.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const w = window as any;
      w.isTauri = true;
      let id = 0;
      const callbacks = new Map<number, (value: any) => void>();
      const listeners = new Map<string, number[]>();
      const read = () =>
        JSON.parse(
          localStorage.getItem("test.native") ||
            JSON.stringify({
              chosen: false,
              files: {
                "Welcome.md": "# Welcome\n\nA local note.",
                "Notes/Nested/Thought.md": "# Thought\n\nNested note.",
                "Notes/plain.txt": "literal **text**\n",
                "Second.md": "# Second",
              },
              folders: ["Notes", "Notes/Nested", "Empty"],
            }),
        );
      const store = (data: any) =>
        localStorage.setItem("test.native", JSON.stringify(data));
      const snapshot = (path: string) => {
        const data = read();
        if (!(path in data.files)) throw new Error("File not found");
        return {
          path,
          name: path.split("/").pop(),
          markdown: data.files[path],
          version: data.files[path],
          cloud: data.cloud?.[path] || null,
        };
      };
      const listing = () => {
        const data = read();
        const children = (parent: string): any[] => {
          const parentOf = (path: string) =>
            path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
          return [
            ...data.folders
              .filter((p: string) => parentOf(p) === parent)
              .map((p: string) => ({
                path: p,
                name: p.split("/").pop(),
                directory: true,
                children: children(p),
              })),
            ...Object.keys(data.files)
              .filter((p) => parentOf(p) === parent)
              .map((p) => ({
                path: p,
                name: p.split("/").pop(),
                directory: false,
                children: [],
                cloud: data.cloud?.[p] || null,
              })),
          ];
        };
        return {
          root: "/test/Workspace",
          name: "Workspace",
          entries: children(""),
          warnings: [],
        };
      };
      const emit = (event: string, payload?: any) =>
        listeners
          .get(event)
          ?.forEach((handler) =>
            callbacks.get(handler)?.({ event, payload, id: handler }),
          );
      w.__nativeTest = {
        confirm: true,
        failSave: false,
        exited: false,
        calls: [] as string[],
        change: (path: string, content: string) => {
          const data = read();
          data.files[path] = content;
          store(data);
          emit("workspace-changed");
        },
        emit,
        read,
      };
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      w.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: "main" },
        },
        transformCallback: (callback: (value: any) => void) => {
          callbacks.set(++id, callback);
          return id;
        },
        invoke: async (command: string, args: any = {}) => {
          w.__nativeTest.calls.push(command);
          const data = read();
          switch (command) {
            case "plugin:event|listen":
              listeners.set(args.event, [
                ...(listeners.get(args.event) || []),
                args.handler,
              ]);
              return ++id;
            case "plugin:event|unlisten":
              return;
            case "frontend_ready":
            case "finish_background_save":
            case "set_mobile_appearance":
              return;
            case "finish_exit":
              w.__nativeTest.exited = true;
              return;
            case "plugin:dialog|message":
              return w.__nativeTest.confirm
                ? args.buttons?.OkCancelCustom?.[0] || "Ok"
                : "Cancel";
            case "restore_workspace":
              if (data.restoreFailure)
                throw new Error("The folder is unavailable");
              return data.chosen ? listing() : null;
            case "choose_workspace":
              data.chosen = true;
              data.restoreFailure = false;
              store(data);
              return listing();
            case "list_workspace":
              return listing();
            case "store_recovery_draft":
              data.recovery = {
                root: args.root,
                document: {
                  path: args.path,
                  name: args.name,
                  markdown: args.markdown,
                  version: args.version,
                },
              };
              store(data);
              return;
            case "load_recovery_draft":
              return data.recovery || null;
            case "clear_recovery_draft":
              delete data.recovery;
              store(data);
              return;
            case "document_cloud_status":
              return data.cloud?.[args.path] || null;
            case "keep_document_versions": {
              if (w.__nativeTest.failKeep)
                throw new Error("Cloud versions are unavailable offline");
              const versions = data.conflictVersions?.[args.path] || [];
              versions.forEach((text: string, i: number) => {
                const name = args.path.replace(
                  /(\.[^.]+)$/,
                  ` (conflict ${i + 1})$1`,
                );
                if (name in data.files) throw new Error("Conflict copy exists");
                data.files[name] = text;
              });
              data.cloud[args.path].conflicts = 0;
              data.conflictVersions = {};
              store(data);
              return;
            }
            case "read_document":
              if (w.__nativeTest.failRead === args.path)
                throw new Error(
                  "Download unavailable offline. Try again when connected.",
                );
              if (w.__nativeTest.delayRead === args.path)
                await new Promise((resolve) => setTimeout(resolve, 1000));
              if (data.cloud?.[args.path]) {
                data.cloud[args.path].downloaded = true;
                store(data);
              }
              return snapshot(args.path);
            case "save_document":
              if (data.cloud?.[args.path]?.conflicts)
                throw new Error("iCloud has competing versions of this file.");
              if (w.__nativeTest.failSave) throw new Error("File is read-only");
              if (snapshot(args.path).version !== args.version)
                throw new Error("This file changed outside Anubis.");
              data.files[args.path] = args.markdown;
              if (data.cloud?.[args.path])
                data.cloud[args.path].uploaded = false;
              store(data);
              return snapshot(args.path);
            case "create_document": {
              const path = args.parent
                ? `${args.parent}/${args.name}`
                : args.name;
              if (path in data.files) throw new Error("File already exists");
              data.files[path] = args.markdown;
              store(data);
              return snapshot(path);
            }
            case "create_folder": {
              const path = args.parent
                ? `${args.parent}/${args.name}`
                : args.name;
              if (data.folders.includes(path))
                throw new Error("Folder already exists");
              data.folders.push(path);
              store(data);
              return;
            }
            case "rename_document": {
              const path = args.path.includes("/")
                ? args.path.slice(0, args.path.lastIndexOf("/") + 1) + args.name
                : args.name;
              if (path in data.files) throw new Error("File already exists");
              data.files[path] = data.files[args.path];
              delete data.files[args.path];
              store(data);
              return snapshot(path);
            }
            case "delete_document":
              delete data.files[args.path];
              store(data);
              return;
            default:
              throw new Error(`Unexpected desktop command: ${command}`);
          }
        },
      };
    });
    await use(page);
  },
});
export { expect };
export async function openWorkspace(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await page.getByRole("button", { name: "Welcome.md", exact: true }).click();
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
}
