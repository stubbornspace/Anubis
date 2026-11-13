import { test, expect, openWorkspace } from "./native-fixture";

test("opens a native workspace, expands subfolders, filters files and edits plain text", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Folder Notes", exact: true }).click();
  await page.getByRole("button", { name: "plain.txt", exact: true }).click();
  await expect(page.getByLabel("Text editor")).toHaveValue(
    "literal **text**\n",
  );
  await page.getByLabel("Text editor").fill("Keep **literal** characters");
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Notes/plain.txt"],
    ),
  ).toBe("Keep **literal** characters");
  await page.getByLabel("Search files").fill("Thought");
  await page.getByRole("button", { name: "Thought.md", exact: true }).click();
  await expect(page.locator(".writing h1")).toHaveText("Thought");
});

test("flushes pending edits before switching files and restores the workspace", async ({
  page,
}) => {
  await openWorkspace(page);
  await page
    .getByLabel("Markdown editor")
    .fill("Saved immediately on navigation");
  await page.getByRole("button", { name: "Second.md", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Welcome.md"],
    ),
  ).toContain("Saved immediately on navigation");
  await page.reload();
  await expect(page.locator(".writing h1")).toHaveText("Second");
  await page.getByRole("button", { name: "Welcome.md", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "Saved immediately on navigation",
  );
});

test("undo and redo stay within the active document", async ({ page }) => {
  await openWorkspace(page);
  const editor = page.getByLabel("Markdown editor");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
  await editor.fill("First file draft");
  await page.getByRole("button", { name: "Second.md", exact: true }).click();
  const firstSaved = await page.evaluate(
    () => (window as any).__nativeTest.read().files["Welcome.md"],
  );
  await editor.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".writing h1")).toHaveText("Second");
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.locator(".writing h1").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect(page.locator(".writing h1")).toHaveText("Second edited");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".writing h1")).toHaveText("Second");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".writing h1")).toHaveText("Second edited");

  await page.getByRole("button", { name: "Welcome.md", exact: true }).click();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toHaveText("First file draft");
  const files = await page.evaluate(
    () => (window as any).__nativeTest.read().files,
  );
  expect(files["Welcome.md"]).toBe(firstSaved);
  expect(files["Second.md"].trim()).toBe("# Second edited");
});

test("external document refresh starts a fresh undo history", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByLabel("Markdown editor").fill("Saved local edit");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.evaluate(() =>
    (window as any).__nativeTest.change("Welcome.md", "# External version"),
  );
  await expect(page.locator(".writing h1")).toHaveText("External version");
  await page.getByLabel("Markdown editor").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".writing h1")).toHaveText("External version");
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Welcome.md"],
    ),
  ).toBe("# External version");
});

test("creates folders and documents in the selected subfolder, renames, and trashes the targeted file", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Folder Notes", exact: true }).click();
  await page.getByLabel("New folder", { exact: true }).click();
  await page.getByLabel("Folder name").fill("Ideas");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("New document", { exact: true }).click();
  await page.getByLabel("File name").fill("Idea.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Markdown editor").fill("New nested idea");
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Notes/Ideas/Idea.md"],
    ),
  ).toContain("New nested idea");
  const row = page.locator(".file-row").filter({
    has: page.getByRole("button", { name: "Idea.md", exact: true }),
  });
  await row.hover();
  await page.getByLabel("Options for Idea.md").click();
  await page.getByLabel("Rename Idea.md").click();
  await page.getByLabel("File name").fill("Renamed.md");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByRole("button", { name: "Welcome.md", exact: true }).click();
  const renamed = page.locator(".file-row").filter({
    has: page.getByRole("button", { name: "Renamed.md", exact: true }),
  });
  await renamed.hover();
  await page.getByLabel("Options for Renamed.md").click();
  await page.getByLabel("Delete Renamed.md").click();
  await expect(renamed).toHaveCount(0);
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
});

test("keeps edits on a conflicting save, blocks switching and allows a recovery copy", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByLabel("Markdown editor").fill("My unsaved draft");
  await page.evaluate(() =>
    (window as any).__nativeTest.change("Welcome.md", "External edit"),
  );
  await expect(page.getByRole("alert")).toContainText("changed outside Anubis");
  await page.getByRole("button", { name: "Second.md", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "My unsaved draft",
  );
  await page.getByRole("button", { name: "Save a copy", exact: true }).click();
  await page.getByLabel("File name").fill("Recovered.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  const files = await page.evaluate(
    () => (window as any).__nativeTest.read().files,
  );
  expect(files["Welcome.md"]).toBe("External edit");
  expect(files["Recovered.md"]).toContain("My unsaved draft");
});

test("refreshes external edits and flushes before native close", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.evaluate(() =>
    (window as any).__nativeTest.change("Welcome.md", "# Changed externally"),
  );
  await expect(page.locator(".writing h1")).toHaveText("Changed externally");
  await page.getByLabel("Markdown editor").fill("Last edit before closing");
  await page.evaluate(() =>
    (window as any).__nativeTest.emit("workspace-before-exit"),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeTest.exited))
    .toBe(true);
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Welcome.md"],
    ),
  ).toContain("Last edit before closing");
});

test("does not close on failed saves", async ({ page }) => {
  await openWorkspace(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page.getByLabel("Markdown editor").fill("Keep this draft");
  await page.evaluate(() =>
    (window as any).__nativeTest.emit("workspace-before-exit"),
  );
  await expect(page.getByRole("alert")).toContainText("read-only");
  expect(await page.evaluate(() => (window as any).__nativeTest.exited)).toBe(
    false,
  );
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Keep this draft",
  );
});

test("theme, source and focus remain functional", async ({ page }) => {
  await openWorkspace(page);
  await page.getByLabel("Toggle theme").click();
  await expect(page.locator(".brand-icon")).toHaveAttribute(
    "src",
    "/icons/anubis-dark.png",
  );
  await page.getByLabel("Toggle source mode").click();
  await page
    .getByLabel("Markdown source")
    .fill("# Source heading\n\nA paragraph");
  await page.getByLabel("Toggle source mode").click();
  await expect(page.locator(".writing h1")).toHaveText("Source heading");
  await page.getByLabel("Markdown editor").click();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "Enable focus mode" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rect = getSelection()!.getRangeAt(0).getBoundingClientRect();
        const area = document
          .querySelector(".page-scroll")!
          .getBoundingClientRect();
        return Math.abs(
          (rect.top + rect.bottom) / 2 - (area.top + area.height * 0.4),
        );
      }),
    )
    .toBeLessThan(5);
});

test("browsing existing files never writes them, and source edits stay exact", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Second.md", exact: true }).click();
  await page.getByRole("button", { name: "Welcome.md", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(
    await page.evaluate(() =>
      (window as any).__nativeTest.calls.filter(
        (c: string) => c === "save_document",
      ),
    ),
  ).toEqual([]);
  await page.getByLabel("Toggle source mode").click();
  const original = "#   Spacing\n\n<!-- keep this -->\n\nSome text\n";
  await page.getByLabel("Markdown source").fill(original);
  await page.getByRole("button", { name: "Second.md", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Welcome.md"],
    ),
  ).toBe(original);
});

test("duplicate names preserve both files and canceled trash leaves the document", async ({
  page,
}) => {
  await openWorkspace(page);
  const row = page.locator(".file-row").filter({
    has: page.getByRole("button", { name: "Welcome.md", exact: true }),
  });
  await row.hover();
  await page.getByLabel("Options for Welcome.md").click();
  await page.getByLabel("Rename Welcome.md").click();
  await page.getByLabel("File name").fill("Second.md");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await page.getByLabel("Dismiss error").click();
  await page.getByLabel("Cancel", { exact: true }).click();
  await page.evaluate(() => {
    (window as any).__nativeTest.confirm = false;
  });
  await row.hover();
  await page.getByLabel("Options for Welcome.md").click();
  await page.getByLabel("Delete Welcome.md").click();
  await expect(row).toBeVisible();
  const files = await page.evaluate(
    () => (window as any).__nativeTest.read().files,
  );
  expect(files["Welcome.md"]).toContain("# Welcome");
  expect(files["Second.md"]).toBe("# Second");
});

test("Focus fades controls during input and restores them after idle or pointer movement", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Enable focus mode" }).click();
  const editor = page.getByLabel("Markdown editor");
  const before = await editor.boundingBox();
  await page.keyboard.type("Writing in focus");
  await expect(page.locator(".app")).toHaveClass(/focus-writing/);
  await expect(page.locator(".sidebar")).toHaveCSS("opacity", "0");
  expect((await editor.boundingBox())!.x).toBe(before!.x);
  await expect(page.locator(".app")).not.toHaveClass(/focus-writing/, {
    timeout: 3500,
  });
  await expect(page.locator(".sidebar")).toHaveCSS("opacity", "1");
  await page.keyboard.type(" again");
  await expect(page.locator(".app")).toHaveClass(/focus-writing/);
  await page.mouse.move(100, 100);
  await expect(page.locator(".app")).not.toHaveClass(/focus-writing/);
  await page.getByRole("button", { name: "Disable focus mode" }).click();
  await page.keyboard.type(" normal writing");
  await expect(page.locator(".app")).not.toHaveClass(/focus-writing/);
});

test("settings switches and remembers both theme palettes without losing the document", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByLabel("Markdown editor").fill("Draft stays here");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Blues" })).toBeChecked();
  await page.getByRole("radio", { name: "Atom One" }).check();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "atom-one",
  );
  await expect(page.locator(".main")).toHaveCSS(
    "background-color",
    "rgb(40, 44, 52)",
  );
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Draft stays here",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "atom-one",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await expect(page.locator(".main")).toHaveCSS(
    "background-color",
    "rgb(250, 250, 250)",
  );
  await page.getByRole("radio", { name: "The Blues" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "blues");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Settings" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
});

test("writing size defaults to 15 and remembers choices from 12 through 20", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const size = page.getByLabel("Default font size");
  await expect(size).toHaveValue("15");
  await expect(size).toHaveAttribute("min", "12");
  await expect(size).toHaveAttribute("max", "20");
  await size.focus();
  await size.press("Home");
  await expect(page.getByLabel("Markdown editor")).toHaveCSS(
    "font-size",
    "12px",
  );
  await size.press("End");
  await page.getByLabel("Close settings").click();
  await expect(page.getByLabel("Markdown editor")).toHaveCSS(
    "font-size",
    "20px",
  );
  await page.reload();
  await expect(page.getByLabel("Markdown editor")).toHaveCSS(
    "font-size",
    "20px",
  );
  await page.getByLabel("Toggle source mode").click();
  await expect(page.getByLabel("Markdown source")).toHaveCSS(
    "font-size",
    "20px",
  );
});
