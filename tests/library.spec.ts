import { test, expect, openWorkspace } from "./native-fixture";
async function openLibrary(page: import("@playwright/test").Page) {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .click();
}
test("notes persist privately and switching modes flushes both editors", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByLabel("Markdown editor").fill("# File edit");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Markdown editor")
    .fill("# Library entry\n\nPrivate text #work/project");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toContainText("File edit");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "Library entry",
  );
  await page.reload();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "Library entry",
  );
  const data = await page.evaluate(() => (window as any).__nativeTest.read());
  expect(Object.keys(data.files)).toHaveLength(4);
  expect(data.library.notes[0].markdown).toContain("Private text");
  expect(data.library.notes[0].tags).toEqual(["work/project"]);
});
test("failed library saves block switching and recover after relaunch", async ({
  page,
}) => {
  await openLibrary(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.failSave = true;
  });
  await page.getByLabel("Markdown editor").fill("# Keep this draft");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toContainText("Note save failed");
  await page.reload();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "Keep this draft",
  );
  await page
    .getByRole("button", { name: "Save recovery copy", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved locally");
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().library.notes.length,
    ),
  ).toBe(2);
});
test("nested tags, archive, trash and restore preserve note content", async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByLabel("Markdown editor").fill("# Tagged\n\n#work/project");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Expand tag work", exact: true })
    .click();
  await page.getByRole("button", { name: "project", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("button", { name: "Archive note", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Note library" })
    .getByRole("button", { name: /Archive/ })
    .click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("button", { name: "Trash note", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("button", { name: "Restore note", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toContainText("Tagged");
});
test("search includes text beyond the preview and native close saves notes", async ({
  page,
}) => {
  await openLibrary(page);
  await page
    .getByLabel("Markdown editor")
    .fill("# Searchable\n\n" + "Long body ".repeat(50) + "needle");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByLabel("Search notes", { exact: true }).fill("needle");
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByLabel("Markdown editor").fill("# Before quit");
  await page.evaluate(() =>
    (window as any).__nativeTest.emit("workspace-before-exit"),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeTest.exited))
    .toBe(true);
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().library.notes[0].markdown,
    ),
  ).toContain("Before quit");
});
test("images keep stable attachment references after reopening", async ({
  page,
}) => {
  await openLibrary(page);
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZyQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator(".note-image img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.reload();
  await expect(page.locator(".note-image img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  expect(
    await page.evaluate(
      () => (window as any).__nativeTest.read().library.notes[0].markdown,
    ),
  ).toContain("anubis-asset:");
});

test("tag autocomplete and renaming keep Markdown and filters consistent", async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByLabel("Markdown editor").fill("# Seed\n\n#work/project");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Markdown editor").pressSequentially("#wo");
  await expect(
    page.getByRole("listbox", { name: "Tag suggestions" }),
  ).toBeVisible();
  await page.getByLabel("Markdown editor").press("Enter");
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "#work/project",
  );
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Edit tag work", exact: true })
    .click();
  await page.getByLabel("Tag name", { exact: true }).fill("office");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "#office/project",
  );
  expect(
    await page.evaluate(() =>
      (window as any).__nativeTest
        .read()
        .library.notes.every((n: any) => n.tags.includes("office/project")),
    ),
  ).toBe(true);
});
test("note history restores a version while keeping the newer revision", async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByLabel("Markdown editor").fill("# First version");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByLabel("Markdown editor").fill("# Second version");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Note history" });
  await dialog.locator("summary").first().click();
  await dialog
    .getByRole("button", { name: "Restore version 2", exact: true })
    .click();
  await expect(page.getByLabel("Markdown editor")).toContainText(
    "First version",
  );
  expect(
    await page.evaluate(() =>
      Object.values((window as any).__nativeTest.read().library.history)
        .flat()
        .some((n: any) => n.markdown.includes("Second version")),
    ),
  ).toBe(true);
});
test("sync failure never reports synced or prevents local saving", async ({
  page,
}) => {
  await openLibrary(page);
  await page.evaluate(() => {
    (window as any).__nativeTest.syncFailure = true;
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Enable iCloud sync", { exact: true }).check();
  await expect(
    page.getByRole("dialog", { name: "Settings" }).getByRole("alert"),
  ).toContainText("iCloud unavailable");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByLabel("Markdown editor").fill("# Saved offline");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
});

test("sync without remote edits preserves editor undo history", async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByLabel("Markdown editor").fill("# Keep undo history");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Enable iCloud sync", { exact: true }).check();
  await expect(page.locator(".saved[role=status]")).toHaveText("Synced");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByLabel("Markdown editor").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByLabel("Markdown editor")).not.toContainText(
    "Keep undo history",
  );
});

test("editor sidebar toggle collapses both Notes columns", async ({ page }) => {
  await openLibrary(page);
  const toggle = page.getByRole("button", {
    name: "Toggle sidebar",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "Show library", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle note list", exact: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
  await expect(page.locator(".note-list-container")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".note-list-container")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("Notes toolbar shares the Documents header alignment with columns open and closed", async ({
  page,
}) => {
  await openWorkspace(page);
  const center = async (selector: string) => {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    return box!.y + box!.height / 2;
  };
  const documentY = await center('button[aria-label="Toggle sidebar"]');
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  for (const collapsed of [false, true]) {
    if (collapsed)
      await page.getByLabel("Toggle sidebar", { exact: true }).click();
    expect(
      Math.abs(
        (await center('button[aria-label="Toggle sidebar"]')) - documentY,
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        (await center('button[aria-label="Toggle source mode"]')) - documentY,
      ),
    ).toBeLessThan(1);
  }
});

test("Documents insert portable images from the shared editing toolbar", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(
    page
      .locator(".formatting")
      .getByRole("button", { name: "Insert image", exact: true }),
  ).toBeEnabled();
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZyQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator(".note-image img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.locator(".note-image img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await page.getByLabel("Toggle source mode").click();
  await expect(page.locator("textarea.source")).toHaveValue(
    /data:image\/png;base64,/,
  );
});

test("Note actions menu supports keyboard dismissal and restores focus after history", async ({
  page,
}) => {
  await openLibrary(page);
  const trigger = page.getByRole("button", {
    name: "Note actions",
    exact: true,
  });
  await expect(
    page
      .locator(".editor-controls")
      .getByRole("button", { name: "Note actions" }),
  ).toBeVisible();
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "History", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Note history" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

for (const mode of ["Documents", "Notes"]) {
  test(`selection formatting works in ${mode} and leaves image insertion in the header`, async ({
    page,
  }) => {
    if (mode === "Notes") await openLibrary(page);
    else await openWorkspace(page);
    await expect(
      page.locator("header").getByRole("button", { name: "Bold", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator("header")
        .getByRole("button", { name: "Insert image", exact: true }),
    ).toBeVisible();
    const editor = page.getByLabel("Markdown editor");
    await editor.fill("Selected words");
    const menu = page.getByRole("toolbar", { name: "Text formatting" });
    await expect(menu).not.toBeVisible();
    await editor.press("ControlOrMeta+a");
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(editor.locator("strong")).toHaveText("Selected words");
    await editor.press("Tab");
    await expect(
      menu.getByRole("button", { name: "Bold", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(
      menu.getByRole("button", { name: "Italic", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editor.locator("em")).toHaveText("Selected words");
    await editor.press("Escape");
    await expect(menu).not.toBeVisible();
    await page.getByLabel("Toggle source mode").click();
    await expect(menu).not.toBeVisible();
  });
}

for (const mode of ["Documents", "Notes"]) {
  test(`crop and resize persist in ${mode} while preserving the original image`, async ({
    page,
  }) => {
    if (mode === "Notes") await openLibrary(page);
    else await openWorkspace(page);
    await page.locator('input[type="file"][accept^="image/"]').setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZyQAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    const image = page.locator(".note-image img");
    await expect(image).toHaveAttribute("src", /^data:image/);
    const src = await image.getAttribute("src");
    await image.click({ force: true });
    await page
      .getByRole("button", { name: "Crop and resize image", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Crop and resize image" });
    await dialog.getByLabel("Display width (px)").fill("320");
    await dialog.getByLabel("Crop left", { exact: true }).fill("20");
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".note-image")).toHaveCSS("width", "320px");
    await expect(image).toHaveAttribute("src", src!);
    await expect(page.getByRole("status")).toHaveText(
      mode === "Notes" ? "Saved locally" : "Saved",
    );
    await page.reload();
    await expect(page.locator(".note-image")).toHaveCSS("width", "320px");
    await image.click();
    await page
      .getByRole("button", { name: "Crop and resize image", exact: true })
      .click();
    await expect(dialog.getByLabel("Crop left", { exact: true })).toHaveValue(
      "20",
    );
    await dialog
      .getByRole("button", { name: "Reset crop", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Crop and resize image", exact: true })
      .click();
    await expect(dialog.getByLabel("Crop left", { exact: true })).toHaveValue(
      "20",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    const handle = page.locator(
      '.image-node [data-resize-handle="bottom-right"]',
    );
    const box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 65, box!.y + 65, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(
        async () => (await page.locator(".note-image").boundingBox())!.width,
      )
      .toBeGreaterThan(340);
  });
}

for (const fails of [false, true]) {
  test(`slow sync allows editing, saving and switching modes (${fails ? "offline" : "success"})`, async ({
    page,
  }) => {
    await openLibrary(page);
    await page.evaluate((fails) => {
      const native = (window as any).__nativeTest;
      native.syncFailure = fails;
      native.syncGate = new Promise<void>((resolve) => {
        native.finishSync = resolve;
      });
    }, fails);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Enable iCloud sync", { exact: true }).check();
    await expect(page.locator(".saved[role=status]")).toHaveText("Syncing…");
    await page
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    const editor = page.getByLabel("Markdown editor");
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await editor.fill("# Written during sync");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__nativeTest
            .read()
            .library.notes.some((n: any) =>
              n.markdown.includes("Written during sync"),
            ),
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(editor).toContainText("Written during sync");
    await page.evaluate(() => (window as any).__nativeTest.finishSync());
    await expect(page.locator(".saved[role=status]")).toHaveText(
      "Saved locally",
    );
    await expect(editor).toContainText("Written during sync");
    await page.reload();
    await expect(page.getByLabel("Markdown editor")).toContainText(
      "Written during sync",
    );
  });
}
