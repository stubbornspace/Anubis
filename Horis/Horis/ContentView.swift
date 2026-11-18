import SwiftUI

struct ContentView: View {
    @State private var library = MockLibrary()
    @State private var showingSettings = false
    @State private var visibility: NavigationSplitViewVisibility = .all
    @AppStorage("horus.prototype.appearance") private var appearance = "system"

    var body: some View {
        NavigationSplitView(columnVisibility: $visibility) {
            NotesSidebar(library: library, showingSettings: $showingSettings)
                .navigationSplitViewColumnWidth(min: 240, ideal: 290, max: 420)
        } detail: {
            if let note = library.selectedNote {
                NoteDetailView(note: note, library: library)
                    .id(note.id)
            } else {
                ContentUnavailableView {
                    Label("A little space to think", systemImage: "note.text")
                } description: {
                    Text("Choose a note or start something new.")
                } actions: {
                    Button("New note", action: library.addNote)
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
        .sheet(isPresented: $showingSettings) {
            PrototypeSettingsView(appearance: $appearance)
        }
    }
}

#Preview("iPad shell") {
    ContentView()
}
