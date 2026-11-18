import { type Page } from "@playwright/test";
import { test, expect } from "./native-fixture";

async function setup(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const data = (window as any).__nativeTest.read();
    data.chosen = true;
    data.cloud = {
      "Welcome.md": {
        downloaded: true,
        uploaded: true,
        downloading: false,
        conflicts: 0,
        error: "",
      },
      "Second.md": {
        downloaded: false,
        uploaded: true,
        downloading: false,
        conflicts: 0,
        error: "",
      },
    };
    localStorage.setItem("test.native", JSON.stringify(data));
    localStorage.setItem("kronos.active:/test/Workspace", "Welcome.md");
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Uploaded to iCloud");
}
async function files(page: Page) {
  if (await page.locator(".sidebar").evaluate((el) => el.hasAttribute("inert")))
    await page.getByLabel("Toggle sidebar").click();
}
async function conflict(page: Page) {
  await page.evaluate(() => {
    const data = (window as any).__nativeTest.read();
    data.cloud["Welcome.md"].conflicts = 1;
    data.conflictVersions = { "Welcome.md": ["# Offline iPad version"] };
    localStorage.setItem("test.native", JSON.stringify(data));
    (window as any).__nativeTest.emit("workspace-changed");
  });
  await expect(
    page.getByRole("button", { name: "Keep both versions" }),
  ).toBeVisible();
}

test("cloud saves distinguish local persistence from confirmed upload", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Markdown editor").fill("An offline edit");
  await expect(page.getByRole("status")).toHaveText(
    "Saved locally · Upload pending",
  );
  await page.evaluate(() => {
    const data = (window as any).__nativeTest.read();
    data.cloud["Welcome.md"].uploaded = true;
    localStorage.setItem("test.native", JSON.stringify(data));
    (window as any).__nativeTest.emit("workspace-changed");
  });
  await expect(page.getByRole("status")).toHaveText("Uploaded to iCloud");
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "An offline edit",
  );
});

test("a failed cloud download leaves the current document available", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failRead = "Second.md";
  });
  await files(page);
  await page.getByRole("treeitem", { name: "Second.md", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Download unavailable offline",
  );
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
  await page.evaluate(() => {
    (window as any).__nativeTest.failRead = null;
    (window as any).__nativeTest.delayRead = "Second.md";
  });
  await page.getByRole("treeitem", { name: "Second.md", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Downloading Second.md…");
  await expect(page.locator(".writing h1")).toHaveText("Second");
});

test("keep both preserves cloud versions and unsaved editor text", async ({
  page,
}) => {
  await setup(page);
  await conflict(page);
  await page.getByLabel("Markdown editor").fill("My unfinished edits");
  await expect(page.getByRole("status")).toHaveText("Not saved");
  await page.getByRole("button", { name: "Keep both versions" }).click();
  await expect(
    page.getByRole("button", { name: "Keep both versions" }),
  ).toHaveCount(0);
  const data = await page.evaluate(() => (window as any).__nativeTest.read());
  expect(data.files["Welcome.md"]).toContain("# Welcome");
  expect(data.files["Welcome (conflict 1).md"]).toBe("# Offline iPad version");
  expect(
    Object.entries(data.files).some(
      ([path, text]) =>
        path.includes("(local edits ") &&
        String(text).includes("My unfinished edits"),
    ),
  ).toBe(true);
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "My unfinished edits",
  );
});

test("failed conflict preservation retains every cloud version", async ({
  page,
}) => {
  await setup(page);
  await conflict(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failKeep = true;
  });
  await page.getByRole("button", { name: "Keep both versions" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cloud versions are unavailable offline",
  );
  const data = await page.evaluate(() => (window as any).__nativeTest.read());
  expect(data.conflictVersions["Welcome.md"]).toEqual([
    "# Offline iPad version",
  ]);
  expect(data.cloud["Welcome.md"].conflicts).toBe(1);
  await expect(page.locator(".writing h1")).toHaveText("Welcome");
});

test("a failed cloud save restores the private draft after relaunch", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page
    .getByLabel("Markdown editor")
    .fill("Keep my offline draft across relaunch");
  await expect(page.getByRole("status")).toHaveText("Not saved");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Recovered unsaved edits",
  );
  await expect(page.getByLabel("Markdown editor")).toHaveText(
    "Keep my offline draft across relaunch",
  );
  const data = await page.evaluate(() => (window as any).__nativeTest.read());
  expect(data.files["Welcome.md"]).toContain("# Welcome");
  expect(data.recovery.root).toBe("/test/Workspace");
});

test("local folders remain available independently of iCloud", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const data = (window as any).__nativeTest.read();
    delete data.cloud;
    localStorage.setItem("test.native", JSON.stringify(data));
    (window as any).__nativeTest.emit("workspace-changed");
  });
  await expect(page.getByRole("status")).toHaveText("Saved");
  await files(page);
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
