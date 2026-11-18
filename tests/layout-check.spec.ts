import { test, expect, openWorkspace } from "./native-fixture";

for (const kind of ["document", "folder"] as const) {
  test(`new ${kind} dialog isolates keyboard input and restores focus`, async ({
    page,
  }) => {
    await openWorkspace(page);
    const trigger = page.getByRole("button", {
      name: kind === "document" ? "New document" : "New folder",
      exact: true,
    });
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: kind === "document" ? "New document" : "New folder",
    });
    const name = dialog.getByLabel(
      kind === "document" ? "File name" : "Folder name",
    );
    await expect(name).toBeFocused();
    await trigger.evaluate((button: HTMLButtonElement) => button.focus());
    await expect(name).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => {
          const active = document.activeElement;
          return active === document.body || !!active?.closest(".file-dialog");
        }),
      ).toBe(true);
    }
    await name.focus();
    await page.keyboard.press("ControlOrMeta+o");
    await page.keyboard.press("ControlOrMeta+n");
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as any).__nativeTest.calls.filter(
            (c: string) => c === "choose_workspace",
          ).length,
      ),
    ).toBe(1);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test("rename and recovery dialogs dismiss with Escape and restore their triggers", async ({
  page,
}) => {
  await openWorkspace(page);
  const options = page.getByLabel("Options for Welcome.md");
  await options.click();
  await page.getByLabel("Rename Welcome.md").click();
  const rename = page.getByRole("dialog", { name: "Rename document" });
  await expect(rename.getByLabel("File name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(rename).not.toBeVisible();
  await expect(options).toBeFocused();

  await page.getByLabel("Markdown editor").fill("My draft");
  await page.evaluate(() =>
    (window as any).__nativeTest.change("Welcome.md", "External edit"),
  );
  const recovery = page.getByRole("button", {
    name: "Save a copy",
    exact: true,
  });
  await expect(recovery).toBeVisible();
  await recovery.focus();
  await recovery.click();
  const copy = page.getByRole("dialog", { name: "Save a copy" });
  await expect(copy.getByLabel("File name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(copy).not.toBeVisible();
  await expect(recovery).toBeFocused();
  await expect(page.getByLabel("Markdown editor")).toHaveText("My draft");
});

test("file menus dismiss and focus preserves window sizing", async ({
  page,
}) => {
  await openWorkspace(page);
  const row = page.locator(".file-row").filter({
    has: page.getByRole("treeitem", { name: "Welcome.md", exact: true }),
  });
  await row.hover();
  const trigger = row.getByRole("button", { name: "Options for Welcome.md" });
  await trigger.click();
  await expect(
    row.getByRole("button", { name: "Rename Welcome.md" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Enable focus mode" }).click();
  for (const size of [
    { width: 1200, height: 800 },
    { width: 640, height: 480 },
  ]) {
    await page.setViewportSize(size);
    const bounds = await page.evaluate(() => ({
      bottom: document.querySelector(".sidebar")!.getBoundingClientRect()
        .bottom,
      editor: document.querySelector(".page-scroll")!.getBoundingClientRect()
        .bottom,
      height: innerHeight,
      scroll: scrollY,
    }));
    expect(bounds.bottom).toBe(bounds.height);
    expect(bounds.editor).toBeLessThanOrEqual(bounds.height);
    expect(bounds.scroll).toBe(0);
  }
});

test("sidebar resizes by dragging and keyboard, remembers width, and still collapses", async ({
  page,
}) => {
  await openWorkspace(page);
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const box = (await handle.boundingBox())!;
  const sidebar = page.locator(".sidebar");
  const original = (await sidebar.boundingBox())!.width;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 100);
  await page.mouse.up();
  await expect(sidebar).toHaveCSS("width", `${original + 80}px`);
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(sidebar).toHaveCSS("width", `${original + 70}px`);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", `${original + 70}px`);
  await page.getByLabel("Toggle sidebar").click();
  await expect(page.locator(".app")).toHaveClass(/no-sidebar/);
  await page.getByLabel("Toggle sidebar").click();
  await expect(sidebar).toHaveCSS("width", `${original + 70}px`);
  await page.setViewportSize({ width: 640, height: 480 });
  await expect(sidebar).toHaveCSS("width", "280px");
});

test("folder disclosure keeps the creation destination, and root selection creates at the root", async ({
  page,
}) => {
  await openWorkspace(page);
  await page
    .getByRole("treeitem", { name: "Folder Notes", exact: true })
    .click();
  await expect(
    page.getByRole("treeitem", { name: "Folder Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Collapse Notes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand Notes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: "Folder Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Expand Notes", exact: true }).click();
  await page
    .getByRole("treeitem", { name: "Folder Notes", exact: true })
    .click();
  await expect(
    page.getByRole("treeitem", { name: "Folder Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "false");
  await page.getByLabel("New document", { exact: true }).click();
  await page.getByLabel("File name").fill("At root.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "At root.md", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys((window as any).__nativeTest.read().files),
    ),
  ).toContain("At root.md");
});

test("shared tree keyboard navigation opens documents through the save controller", async ({
  page,
}) => {
  await openWorkspace(page);
  const notes = page.getByRole("treeitem", {
    name: "Folder Notes",
    exact: true,
  });
  const nested = page.getByRole("treeitem", {
    name: "Folder Nested",
    exact: true,
  });
  await notes.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(notes).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(notes).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(nested).toBeFocused();
  await page.keyboard.press("ArrowRight");
  if (
    (await nested.getAttribute("aria-expanded")) === "true" &&
    (await nested.evaluate((el) => el === document.activeElement))
  )
    await page.keyboard.press("ArrowRight");
  const thought = page.getByRole("treeitem", {
    name: "Thought.md",
    exact: true,
  });
  await expect(thought).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(nested).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(nested).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowLeft");
  await expect(notes).toBeFocused();
  const empty = page.getByRole("treeitem", {
    name: "Folder Empty",
    exact: true,
  });
  await empty.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Empty folder", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(empty).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("treeitem", { name: "Second.md", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(notes).toBeFocused();
  await page
    .getByLabel("Markdown editor")
    .fill("Pending text before tree navigation");
  const second = page.getByRole("treeitem", { name: "Second.md", exact: true });
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Markdown editor")).toContainText("Second");
  expect(
    await page.evaluate(() => window.__nativeTest.read().files["Welcome.md"]),
  ).toContain("Pending text before tree navigation");
});
