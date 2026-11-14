import XCTest

final class WorkspaceSmokeTests: XCTestCase {
    func testAppZoomScalesSettingsAndToolbar() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchEnvironment["OS_ACTIVITY_MODE"] = "disable"
        app.launch()
        // WebKit exposes aria-haspopup="dialog" as an AX Other on iPadOS.
        let settings = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Settings'")).firstMatch
        if !settings.waitForExistence(timeout: 5) { app.buttons["Toggle sidebar"].tap() }
        XCTAssertTrue(settings.waitForExistence(timeout: 10), app.debugDescription)
        settings.tap()
        let zoom = app.sliders["App zoom"]
        XCTAssertTrue(zoom.waitForExistence(timeout: 10), app.debugDescription)
        let close = app.buttons["Close settings"]
        let reset = app.buttons["Reset to 100%"]
        if reset.isEnabled { reset.tap() }
        let normal = close.frame.height
        XCTAssertGreaterThan(normal, 0, app.debugDescription)
        print("Zoom baseline: slider=\(zoom.frame), close=\(close.frame), value=\(String(describing: zoom.value))")
        // WebKit range inputs lack the native UISlider attributes required by
        // adjust(toNormalizedSliderPosition:). Drag the actual thumb instead.
        zoom.coordinate(withNormalizedOffset: CGVector(dx: 1.0 / 3.0, dy: 0.5)).press(forDuration: 0.1,
            thenDragTo: zoom.coordinate(withNormalizedOffset: CGVector(dx: 0.99, dy: 0.5)))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.lifetime = .keepAlways
        add(screenshot)
        print("After zoom drag: close=\(close.frame), value=\(String(describing: zoom.value))")
        let enlarged = NSPredicate { _, _ in close.frame.height > normal * 1.4 }
        XCTAssertEqual(XCTWaiter.wait(for: [expectation(for: enlarged, evaluatedWith: close)], timeout: 10), .completed, "Before: \(normal), after: \(close.frame), slider: \(String(describing: zoom.value))\n\(app.debugDescription)")
        XCTAssertLessThanOrEqual(close.frame.maxX, app.frame.maxX)
        close.tap()
        let closeFiles = app.buttons["Close files"]
        if closeFiles.exists { closeFiles.tap() }
        let toggle = app.buttons["Toggle sidebar"]
        XCTAssertGreaterThan(toggle.frame.height, 60)
        XCTAssertLessThanOrEqual(toggle.frame.maxY, app.frame.maxY)
        if !settings.exists { toggle.tap() }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        XCTAssertTrue(zoom.waitForExistence(timeout: 5))
        zoom.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).press(forDuration: 0.1,
            thenDragTo: zoom.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5)))
        let minimumTouchSize = NSPredicate { _, _ in close.frame.height >= 43 && close.frame.height < normal * 1.1 }
        XCTAssertEqual(XCTWaiter.wait(for: [expectation(for: minimumTouchSize, evaluatedWith: close)], timeout: 10), .completed)
        app.buttons["Reset to 100%"].tap()
        close.tap()
        app.terminate()
    }

    func testFolderAccessEditingRelaunchAndTrash() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchEnvironment["OS_ACTIVITY_MODE"] = "disable"
        app.launch()
        XCTAssertTrue(app.buttons["Toggle sidebar"].waitForExistence(timeout: 15))
        let choose = app.buttons["Choose folder"].firstMatch
        if !choose.exists { app.buttons["Toggle sidebar"].tap() }
        // Restoring an empty workspace replaces the initial central Choose
        // folder button with the sidebar button. Re-query after that transition.
        if !choose.waitForExistence(timeout: 3) { app.buttons["Toggle sidebar"].tap() }
        XCTAssertTrue(choose.waitForExistence(timeout: 15))
        choose.tap()
        let cancel = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Cancel' OR label == 'Close'")).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 15), app.debugDescription)
        cancel.tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 10))
        choose.tap()
        let notes = app.staticTexts["Notes"].firstMatch
        if !notes.exists {
            let container = app.cells["Anubis, Container"]
            XCTAssertTrue(container.waitForExistence(timeout: 10), app.debugDescription)
            container.tap()
        }
        XCTAssertTrue(notes.waitForExistence(timeout: 10), app.debugDescription)
        notes.tap()
        let open = app.buttons["Open"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 10), app.debugDescription)
        open.tap()

        let newFolder = app.buttons["New folder"]
        if !newFolder.exists { app.buttons["Toggle sidebar"].tap() }
        XCTAssertTrue(newFolder.waitForExistence(timeout: 10), app.debugDescription)
        newFolder.tap()
        let folderName = app.textFields["Folder name"]
        XCTAssertTrue(folderName.waitForExistence(timeout: 5))
        folderName.typeText("UITest-\(UUID().uuidString)")
        app.buttons["Create"].tap()
        app.buttons["New document"].firstMatch.tap()
        let fileName = "iOS-\(UUID().uuidString).md"
        let fileNameField = app.textFields["File name"]
        XCTAssertTrue(fileNameField.waitForExistence(timeout: 5))
        fileNameField.tap()
        fileNameField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 11) + fileName)
        app.buttons["Create"].tap()
        let toggleSource = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Toggle source mode'")).firstMatch
        XCTAssertTrue(toggleSource.waitForExistence(timeout: 10), app.debugDescription)
        toggleSource.tap()
        let source = app.textViews["Markdown source"]
        XCTAssertTrue(source.waitForExistence(timeout: 5), app.debugDescription)
        source.tap()
        source.typeText("# Native iOS save\n\nA local document.")
        XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 10))
        XCUIDevice.shared.press(.home)
        app.activate()
        app.terminate()
        app.launch()
        let restored = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Native iOS save' OR value CONTAINS 'Native iOS save'")).firstMatch
        XCTAssertTrue(restored.waitForExistence(timeout: 15), app.debugDescription)

        let options = app.buttons["Options for \(fileName)"]
        if !options.exists { app.buttons["Toggle sidebar"].tap() }
        XCTAssertTrue(options.waitForExistence(timeout: 5))
        options.tap()
        app.buttons["Delete \(fileName)"].tap()
        let trash = app.buttons["Move to Trash"]
        XCTAssertTrue(trash.waitForExistence(timeout: 5), app.debugDescription)
        trash.tap()
        XCTAssertTrue(options.waitForNonExistence(timeout: 10), app.debugDescription)
    }
}
