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
