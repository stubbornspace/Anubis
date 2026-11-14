import Foundation
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

private struct PathArgs: Decodable {
    let path: String
}

private struct AppearanceArgs: Decodable {
    let dark: Bool
}

// Keep both scopes alive until Rust has validated the new folder and committed it.
// Canceling a picker or encountering an unreadable folder must retain the old workspace.
private final class FolderScope {
    let url: URL
    private let accessed: Bool

    init(_ url: URL) throws {
        self.url = url
        accessed = url.startAccessingSecurityScopedResource()
        do {
            guard try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true,
                  FileManager.default.isReadableFile(atPath: url.path) else {
                throw CocoaError(.fileReadNoPermission)
            }
        } catch {
            if accessed { url.stopAccessingSecurityScopedResource() }
            throw error
        }
    }

    deinit {
        if accessed { url.stopAccessingSecurityScopedResource() }
    }
}

final class WorkspacePlugin: Plugin, UIDocumentPickerDelegate {
    private var pickerInvoke: Invoke?
    private var pending: FolderScope?
    private var active: FolderScope?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var backgroundObserver: NSObjectProtocol?

    private func bookmarkURL() throws -> URL {
        let folder = try FileManager.default.url(for: .applicationSupportDirectory,
            in: .userDomainMask, appropriateFor: nil, create: true)
        return folder.appendingPathComponent("anubis-workspace.bookmark")
    }

    override func load(webview: WKWebView) {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { [weak self, weak webview] _ in
            guard let self, self.backgroundTask == .invalid else { return }
            self.backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Save writing") { [weak self] in
                self?.endBackgroundTask()
            }
            webview?.evaluateJavaScript("window.dispatchEvent(new Event('anubis-background'))", completionHandler: nil)
        }
    }

    deinit {
        if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
    }

    @objc func chooseFolder(_ invoke: Invoke) {
        DispatchQueue.main.async {
            guard self.pickerInvoke == nil else {
                invoke.reject("A folder picker is already open.")
                return
            }
            self.pending = nil
            self.pickerInvoke = invoke
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
            picker.allowsMultipleSelection = false
            picker.delegate = self
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            do {
                try FileManager.default.createDirectory(at: documents.appendingPathComponent("Notes"),
                    withIntermediateDirectories: true)
            } catch {
                self.pickerInvoke = nil
                invoke.reject("Could not prepare the local Notes folder: \(error.localizedDescription)")
                return
            }
            picker.directoryURL = self.active?.url ?? documents
            guard var presenter = self.manager.viewController else {
                self.pickerInvoke = nil
                invoke.reject("The editor is not ready to show a folder picker.")
                return
            }
            while let presented = presenter.presentedViewController { presenter = presented }
            presenter.present(picker, animated: true)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickerInvoke?.resolve(["path": NSNull()])
        pickerInvoke = nil
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        defer { pickerInvoke = nil }
        do {
            guard let url = urls.first else {
                pickerInvoke?.resolve(["path": NSNull()])
                return
            }
            pending = try FolderScope(url)
            pickerInvoke?.resolve(["path": url.path])
        } catch {
            pickerInvoke?.reject("Cannot open this folder: \(error.localizedDescription)")
        }
    }

    @objc func restoreFolder(_ invoke: Invoke) {
        DispatchQueue.main.async {
            do {
                let bookmark = try self.bookmarkURL()
                guard FileManager.default.fileExists(atPath: bookmark.path) else {
                    invoke.resolve(["path": NSNull()])
                    return
                }
                var stale = false
                let url = try URL(resolvingBookmarkData: Data(contentsOf: bookmark),
                    options: [.withoutUI, .withoutImplicitStartAccessing], relativeTo: nil,
                    bookmarkDataIsStale: &stale)
                self.pending = try FolderScope(url)
                // commitFolder refreshes stale bookmarks after Rust validates the listing.
                invoke.resolve(["path": url.path])
            } catch {
                invoke.reject("Folder access could not be restored. Choose the folder again. \(error.localizedDescription)")
            }
        }
    }

    @objc func commitFolder(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(PathArgs.self)
        DispatchQueue.main.async {
            do {
                guard let folder = self.pending,
                      folder.url.resolvingSymlinksInPath().path == args.path else {
                    invoke.reject("The chosen folder changed. Please choose it again.")
                    return
                }
                let data = try folder.url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
                try data.write(to: self.bookmarkURL(), options: .atomic)
                self.active = folder
                self.pending = nil
                invoke.resolve()
            } catch {
                invoke.reject("Could not remember this folder: \(error.localizedDescription)")
            }
        }
    }

    @objc func cancelFolder(_ invoke: Invoke) {
        DispatchQueue.main.async {
            self.pending = nil
            invoke.resolve()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    @objc func finishBackgroundSave(_ invoke: Invoke) {
        DispatchQueue.main.async {
            self.endBackgroundTask()
            invoke.resolve()
        }
    }

    @objc func setAppearance(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(AppearanceArgs.self)
        DispatchQueue.main.async {
            self.manager.viewController?.view.window?.overrideUserInterfaceStyle = args.dark ? .dark : .light
            self.manager.viewController?.setNeedsStatusBarAppearanceUpdate()
            invoke.resolve()
        }
    }
}

@_cdecl("init_plugin_ios_workspace")
public func initPlugin() -> Plugin { WorkspacePlugin() }
