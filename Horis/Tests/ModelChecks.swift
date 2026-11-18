import Foundation

@main
struct ModelChecks {
    @MainActor static func main() {
        let library = MockLibrary()
        let roots = library.branches
        precondition(roots.map(\.title) == ["Cooking", "Ideas", "Travel", "Weeknight"])
        let cooking = roots.first { $0.id == "Cooking" }!
        precondition(cooking.children.map(\.id) == ["Cooking/Baking", "Cooking/Fish"])
        precondition(library.notes(in: "Cooking").map(\.title) == ["A small kitchen"])

        library.search = "miso"
        precondition(library.searchResults.count == 1, "Multi-tag notes must occur once in search")
        library.search = "japan"
        precondition(library.searchResults.map(\.title) == ["Kyoto in the rain"])
        library.search = "nonexistent phrase"
        precondition(library.searchResults.isEmpty)

        let original = library.selectedNote!
        original.body = "An edit retained while changing selection"
        library.addNote()
        let added = library.selectedNote!
        precondition(added.displayTitle == "Untitled note")
        precondition(library.search.isEmpty)
        added.tags = ["Ideas/New", "Cooking/Fish"]
        precondition(library.notes(in: "Ideas/New").contains { $0.id == added.id })
        library[expanded: "Ideas"] = false
        precondition(!library[expanded: "Ideas"])
        library[expanded: "Ideas"] = true
        precondition(library[expanded: "Ideas"])

        added.tags.removeAll()
        precondition(library.notes(in: nil).contains { $0.id == added.id })
        library.delete(added)
        precondition(library.selectedNote != nil)
        library.selection = original.id
        precondition(library.selectedNote?.body == "An edit retained while changing selection")
        for note in library.notes { library.delete(note) }
        precondition(library.selection == nil && library.notes.isEmpty)
        library.addNote()
        precondition(library.selectedNote != nil)
        print("Passed: nested tags, direct membership, deduplicated search, edits, expansion, deletion, and empty-library recovery.")
    }
}
