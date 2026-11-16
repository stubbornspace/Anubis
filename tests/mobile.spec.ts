import { type Page } from "@playwright/test";
import { test, expect } from "./native-fixture";

const compact = (page: Page) => page.viewportSize()!.width <= 900;

async function showFiles(page: Page) {
  if (
    await page
      .locator(".sidebar")
      .evaluate((sidebar) => sidebar.hasAttribute("inert"))
  )
    await page.getByLabel("Toggle sidebar").tap();
}

async function openMobileWorkspace(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose folder", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await showFiles(page);
  await page.getByRole("button", { name: "Welcome.md", exact: true }).tap();
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
}

test("app zoom is saved per device and preserves editor and settings interaction", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await showFiles(page);
  await page.getByRole("button", { name: "Settings", exact: true }).tap();
  const zoom = page.getByLabel("App zoom", { exact: true });
  await expect(zoom).toHaveValue("100");
  await zoom.focus();
  await zoom.press("End");
  await expect(page.locator("html")).toHaveCSS("font-size", "24px");
  await expect(zoom).toHaveAttribute("aria-valuetext", "150%");
  await page.getByLabel("Close settings").tap();
  if (await page.getByLabel("Close files").isVisible())
    await page.getByLabel("Close files").tap();
  await page.getByLabel("Markdown editor").tap();
  await page.getByLabel("Markdown editor").fill("Still editable with app zoom");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.locator("html")).toHaveCSS("font-size", "24px");
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Still editable with app zoom",
  );
});

test("legacy iOS writing size migrates to app zoom using the iOS default", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("kronos.appZoom");
    localStorage.setItem("kronos.fontSize", "20");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveCSS("font-size", "20px");
  expect(
    await page.evaluate(() => localStorage.getItem("kronos.fontSize")),
  ).toBe("20");
});

test("touch navigation saves before switching and leaves room to write", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await expect(page.locator(".app")).toHaveClass(/ios-window/);
  await expect(page.locator(".app")).not.toHaveClass(/mac-window/);
  await expect(page.locator(".mobile-title")).toHaveText("Welcome.md");
  await page.getByLabel("Markdown editor").fill("A draft from iOS");
  await showFiles(page);
  await expect(page.getByLabel("Options for Welcome.md")).toHaveCSS(
    "min-height",
    "44px",
  );
  await page.getByRole("button", { name: "Second.md", exact: true }).tap();
  await expect(page.locator(".writing h1")).toHaveText("Second");
  if (compact(page)) await expect(page.locator(".sidebar")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Welcome.md"],
    ),
  ).toContain("A draft from iOS");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await page.locator(".page-scroll").boundingBox();
  expect(bounds!.height).toBeGreaterThan(200);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
});

test("native backgrounding flushes edits and keeps failed drafts available for recovery", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await page.getByLabel("Markdown editor").fill("Save before suspension");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__nativeTest.calls.includes("finish_background_save"),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Welcome.md"],
    ),
  ).toContain("Save before suspension");
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page.getByLabel("Markdown editor").fill("Keep this unsaved draft");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect(page.getByRole("alert")).toContainText("read-only");
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Keep this unsaved draft",
  );
  await page.getByRole("button", { name: "Save a copy", exact: true }).tap();
  await page.getByLabel("File name").fill("Recovered.md");
  await page.getByRole("button", { name: "Create", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().files["Recovered.md"],
    ),
  ).toContain("Keep this unsaved draft");
});

test("keyboard viewport changes preserve access to the editor and toolbar", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await page.getByLabel("Toggle source mode").tap();
  await page
    .getByLabel("Markdown source")
    .fill("# Written with the keyboard\n");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 360,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".app")).toHaveCSS("height", "360px");
  const bounds = await page.locator(".page-scroll").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(361);
  await page.getByLabel("Hide keyboard").tap();
  await expect(page.getByLabel("Markdown source")).not.toBeFocused();
  await page.getByLabel("Toggle source mode").tap();
  await expect(page.locator(".writing h1")).toHaveText(
    "Written with the keyboard",
  );
});

test("failed iOS saves survive relaunch and further edits can be recovered as a copy", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  const original = await page.evaluate(
    () => (window as any).__nativeTest.read().files["Welcome.md"],
  );
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page.getByLabel("Markdown editor").fill("Recover this after relaunch");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect(page.getByRole("alert")).toContainText("read-only");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Recovered unsaved edits",
  );
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Recover this after relaunch",
  );
  await page.getByLabel("Markdown editor").fill("Newer recovered edits");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__nativeTest.read().recovery.document.markdown,
      ),
    )
    .toContain("Newer recovered edits");
  await page.reload();
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Newer recovered edits",
  );
  await page.getByRole("button", { name: "Save a copy", exact: true }).tap();
  await page.getByLabel("File name").fill("Recovered.md");
  await page.getByRole("button", { name: "Create", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Saved");
  const data = await page.evaluate(() => (window as any).__nativeTest.read());
  expect(data.files["Welcome.md"]).toBe(original);
  expect(data.files["Recovered.md"]).toContain("Newer recovered edits");
  expect(data.recovery).toBeUndefined();
});

test("discarding a recovered iOS draft requires confirmation before clearing recovery", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page.getByLabel("Markdown editor").fill("A recoverable draft");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect(page.getByRole("alert")).toContainText("read-only");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Recovered unsaved edits",
  );
  await page.evaluate(() => {
    (window as any).__nativeTest.confirm = false;
  });
  await page.getByRole("button", { name: "Reload from disk" }).tap();
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "A recoverable draft",
  );
  expect(
    await page.evaluate(() => !!(window as any).__nativeTest.read().recovery),
  ).toBe(true);
  await page.evaluate(() => {
    (window as any).__nativeTest.confirm = true;
  });
  await page.getByRole("button", { name: "Reload from disk" }).tap();
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
  expect(
    await page.evaluate(() => (window as any).__nativeTest.read().recovery),
  ).toBeUndefined();
});

test("choosing a folder after failed restoration retains the pending iOS recovery draft", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page
    .getByLabel("Markdown editor")
    .fill("Keep this through folder recovery");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect(page.getByRole("alert")).toContainText("read-only");
  await page.evaluate(() => {
    const data = (window as any).__nativeTest.read();
    data.restoreFailure = true;
    localStorage.setItem("test.native", JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("folder is unavailable");
  await page.getByRole("button", { name: "Choose folder", exact: true }).tap();
  await expect(page.getByRole("alert")).toContainText(
    "Recovered unsaved edits",
  );
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Keep this through folder recovery",
  );
});

test("note library navigation and background saves work on touch devices", async ({
  page,
}) => {
  await openMobileWorkspace(page);
  await showFiles(page);
  await page.getByRole("button", { name: "Notes", exact: true }).tap();
  await page
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .tap();
  await page.getByLabel("Markdown editor").fill("Mobile library note");
  await page.getByRole("button", { name: "Tags", exact: true }).tap();
  const picker = page.getByRole("dialog", { name: "Tags", exact: true });
  await picker.getByLabel("Add tag", { exact: true }).fill("personal");
  await picker.getByRole("button", { name: "Add", exact: true }).tap();
  await picker.getByRole("button", { name: "Close tags" }).tap();
  await expect(page.getByLabel("Markdown editor")).not.toContainText(
    "#personal",
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("anubis-background")),
  );
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  const sidebarToggle = page.getByLabel("Toggle sidebar");
  if ((await sidebarToggle.getAttribute("aria-expanded")) === "true")
    await sidebarToggle.tap();
  await sidebarToggle.tap();
  await expect(page.locator(".note-list-container")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "All Notes", exact: true }),
  ).toHaveCount(0);
  const personal = page.getByRole("button", {
    name: "Tag personal",
    exact: true,
  });
  await personal.tap();
  if ((await personal.getAttribute("aria-expanded")) === "false")
    await page
      .getByRole("button", { name: "Expand tag personal", exact: true })
      .tap();
  await expect(page.locator(".note-row")).toContainText("Mobile library note");
  await page.locator(".note-row").tap();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "Mobile library note",
  );
  const checkToolbar = async () => {
    const wasCollapsed =
      (await sidebarToggle.getAttribute("aria-expanded")) === "false";
    if (wasCollapsed) await sidebarToggle.tap();
    const footer = (await page.locator(".sidebar-controls").boundingBox())!;
    const settings = (await page
      .locator('.sidebar-controls button[aria-label="Settings"]')
      .boundingBox())!;
    expect(
      Math.abs(settings.x + settings.width - footer.x - footer.width),
    ).toBeLessThan(1);
    await expect(
      page.getByRole("button", { name: "Toggle theme" }),
    ).toHaveCount(0);

    if (wasCollapsed)
      await page.getByLabel("Close files", { exact: true }).tap();
    const buttons = page
      .getByRole("group", { name: "Editor controls" })
      .getByRole("button");
    const bounds = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    for (const [index, rect] of bounds.entries()) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (index) {
        const previous = bounds[index - 1];
        expect(
          rect.x >= previous.right - 1 || rect.y >= previous.bottom - 1,
        ).toBe(true);
      }
    }
  };
  await checkToolbar();
  await page.getByRole("button", { name: "Tags", exact: true }).tap();
  const tags = page.getByRole("dialog", { name: "Tags", exact: true });
  await tags.getByLabel("Add tag", { exact: true }).fill("mobile/project");
  await tags.getByRole("button", { name: "Add", exact: true }).tap();
  const bounds = (await tags.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const remove = tags.getByRole("button", {
    name: "Remove tag mobile/project",
  });
  const target = (await remove.boundingBox())!;
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await remove.tap();
  await tags.getByRole("button", { name: "Close tags" }).tap();
  await expect(tags).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tags", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Saved locally");

  await showFiles(page);
  await page.getByRole("button", { name: "Documents", exact: true }).tap();
  if (compact(page))
    await page.getByLabel("Close files", { exact: true }).tap();
  await expect(page.getByLabel("Markdown editor")).toContainText("Welcome");
  await checkToolbar();
});

test("selection formatting is available on touch layouts", async ({ page }) => {
  await openMobileWorkspace(page);
  const editor = page.getByLabel("Markdown editor");
  await editor.fill("Touch formatting");
  await editor.press("ControlOrMeta+a");
  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Bold", exact: true }).tap();
  await expect(editor.locator("strong")).toHaveText("Touch formatting");
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("image crop and size controls work on touch layouts", async ({ page }) => {
  await openMobileWorkspace(page);
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZyQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.locator(".note-image img").tap({ force: true });
  await page
    .getByRole("button", { name: "Crop and resize image", exact: true })
    .tap();
  const dialog = page.getByRole("dialog", { name: "Crop and resize image" });
  await dialog.getByLabel("Display width (px)").fill("160");
  await dialog.getByLabel("Crop top", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Apply", exact: true }).tap();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".note-image")).toHaveCSS("width", "160px");
});
