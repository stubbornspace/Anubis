import XCTest

final class WorkspaceSmokeTests: XCTestCase {
    func testFolderAccessEditingRelaunchAndTrash() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchEnvironment["OS_ACTIVITY_MODE"] = "disable"
        app.launch()
        XCTAssertTrue(app.buttons["Toggle sidebar"].waitForExistence(timeout: 15))
        let choose = app.buttons["Choose folder"].firstMatch
        if !choose.exists { app.buttons["Toggle sidebar"].tap() }
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
