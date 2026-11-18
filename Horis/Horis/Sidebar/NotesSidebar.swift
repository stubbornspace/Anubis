import SwiftUI

struct NotesSidebar: View {
    @Bindable var library: MockLibrary
    @Binding var showingSettings: Bool

    var body: some View {
        List(selection: $library.selection) {
            if library.isSearching {
                ForEach(library.searchResults) { note in
                    NoteRow(note: note)
                }
            } else {
                ForEach(library.branches) { branch in
                    TagBranchRow(branch: branch, library: library)
                }
                ForEach(library.notes(in: nil)) { note in
                    NoteRow(note: note)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Horus")
        .searchable(text: $library.search, prompt: "Search notes")
        .overlay {
            if library.isSearching && library.searchResults.isEmpty {
                ContentUnavailableView.search(text: library.search)
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Add note", systemImage: "square.and.pencil", action: library.addNote)
                    .help("Add note")
                    .keyboardShortcut("n", modifiers: .command)
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Spacer()
                Button("Settings", systemImage: "gearshape") { showingSettings = true }
                    .labelStyle(.iconOnly)
                    .frame(minWidth: 44, minHeight: 44)
                    .help("Settings")
            }
            .padding(.horizontal)
            .background(.bar)
        }
    }
}
