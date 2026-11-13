import { test, expect, openWorkspace } from "./native-fixture";

test("file menus dismiss and focus preserves window sizing", async ({
  page,
}) => {
  await openWorkspace(page);
  const row = page.locator(".file-row").filter({
    has: page.getByRole("button", { name: "Welcome.md", exact: true }),
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
  await page.getByRole("button", { name: "Folder Notes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Folder Notes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Collapse Notes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand Notes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Folder Notes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Expand Notes", exact: true }).click();
  await page.getByRole("button", { name: "Folder Notes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Folder Notes", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("New document", { exact: true }).click();
  await page.getByLabel("File name").fill("At root.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "At root.md", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys((window as any).__nativeTest.read().files),
    ),
  ).toContain("At root.md");
});
