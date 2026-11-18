import Foundation
import Observation

@MainActor @Observable
final class MockLibrary {
    var notes = SampleNotes.make()
    var selection: UUID?
    var search = ""
    var collapsedTags: Set<String> = []

    init() {
        selection = notes.first?.id
    }

    var selectedNote: MockNote? { notes.first { $0.id == selection } }
    var allTags: [String] { Array(Set(notes.flatMap(\.tags))).sorted() }
    var branches: [TagBranch] { TagBranch.roots(from: allTags) }
    var isSearching: Bool { !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    var searchResults: [MockNote] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return sorted(notes.filter {
            $0.displayTitle.localizedStandardContains(query)
                || $0.body.localizedStandardContains(query)
                || $0.tags.contains { $0.localizedStandardContains(query) }
        })
    }

    func notes(in tag: String?) -> [MockNote] {
        sorted(notes.filter { note in
            if let tag { return note.tags.contains(tag) }
            return note.tags.isEmpty
        })
    }

    subscript(expanded tag: String) -> Bool {
        get { !collapsedTags.contains(tag) }
        set {
            if newValue { collapsedTags.remove(tag) } else { collapsedTags.insert(tag) }
        }
    }

    func addNote() {
        let note = MockNote(title: "", body: "")
        notes.append(note)
        search = ""
        selection = note.id
    }

    func delete(_ note: MockNote) {
        notes.removeAll { $0.id == note.id }
        if selection == note.id { selection = sorted(notes).first?.id }
    }

    private func sorted(_ notes: [MockNote]) -> [MockNote] {
        notes.sorted { $0.displayTitle.localizedStandardCompare($1.displayTitle) == .orderedAscending }
    }
}
