import SwiftUI

/// Replace only this editing surface with the Tiptap host in the next phase.
struct NoteDetailView: View {
    @Bindable var note: MockNote
    let library: MockLibrary
    @State private var showingTags = false
    @State private var confirmingDelete = false
    private enum Field: Hashable { case title, body }
    @FocusState private var focusedField: Field?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            TextField("Untitled note", text: $note.title, axis: .vertical)
                .font(.largeTitle.bold())
                .focused($focusedField, equals: .title)
                .accessibilityLabel("Note title")
            TextEditor(text: $note.body)
                .font(.body)
                .lineSpacing(7)
                .scrollContentBackground(.hidden)
                .focused($focusedField, equals: .body)
                .accessibilityLabel("Note body")
        }
        .padding(.horizontal, 28)
        .padding(.top, 28)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .navigationTitle(note.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button("Focus mode", systemImage: "viewfinder") { }
                    .disabled(true)
                    .help("Focus mode — available with the editor")
                Button("Source", systemImage: "chevron.left.forwardslash.chevron.right") { }
                    .disabled(true)
                    .help("Source — available with the editor")
                Divider()
                Button("Insert image", systemImage: "photo.badge.plus") { }
                    .disabled(true)
                    .help("Insert image — available with the editor")
                Button("Tags", systemImage: "tag") { showingTags = true }
                    .help("Tags")
                Button("History", systemImage: "clock.arrow.circlepath") { }
                    .disabled(true)
                    .help("History — available when notes are saved")
                ShareLink(item: note.displayTitle + "\n\n" + note.body) {
                    Label("Export", systemImage: "square.and.arrow.up")
                }
                .help("Export")
                Button("Delete note", systemImage: "trash", role: .destructive) {
                    confirmingDelete = true
                }
                .help("Delete note")
                .confirmationDialog("Delete this sample note?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                    Button("Delete note", role: .destructive) { library.delete(note) }
                } message: {
                    Text("It will return the next time you launch the prototype.")
                }
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done", systemImage: "keyboard.chevron.compact.down") { focusedField = nil }
            }
        }
        .sheet(isPresented: $showingTags) {
            NoteTagsView(note: note, availableTags: library.allTags)
        }
    }
}
