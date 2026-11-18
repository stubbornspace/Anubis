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
        let closeFiles = app.buttons["Close notes"]
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

    func testNotesEditingBackgroundAndRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchEnvironment["OS_ACTIVITY_MODE"] = "disable"
        app.launch()
        XCTAssertTrue(app.buttons["Toggle sidebar"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Choose folder"].exists)
        XCTAssertFalse(app.buttons["Documents"].exists)
        let newNote = app.buttons["New note"].firstMatch
        if !newNote.exists { app.buttons["Toggle sidebar"].tap() }
        XCTAssertTrue(newNote.waitForExistence(timeout: 10), app.debugDescription)
        newNote.tap()
        let toggleSource = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Toggle source mode'")).firstMatch
        XCTAssertTrue(toggleSource.waitForExistence(timeout: 10), app.debugDescription)
        toggleSource.tap()
        let source = app.textViews["Markdown source"]
        XCTAssertTrue(source.waitForExistence(timeout: 5), app.debugDescription)
        source.tap()
        let title = "Native note \(UUID().uuidString)"
        source.typeText("# \(title)\n\nA private iOS note.")
        XCUIDevice.shared.press(.home)
        app.activate()
        app.terminate()
        app.launch()
        let restored = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR value CONTAINS %@", title, title)).firstMatch
        XCTAssertTrue(restored.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertFalse(app.buttons["Choose folder"].exists)
        XCTAssertFalse(app.buttons["Documents"].exists)
        app.terminate()
    }
}
