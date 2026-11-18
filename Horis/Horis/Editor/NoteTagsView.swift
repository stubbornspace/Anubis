import SwiftUI

struct NoteTagsView: View {
    @Bindable var note: MockNote
    let availableTags: [String]
    @Environment(\.dismiss) private var dismiss
    @State private var newTag = ""

    private var normalizedTag: String {
        newTag.split(separator: "/").map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty }.joined(separator: "/")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Tags") {
                    ForEach(Array(Set(availableTags + note.tags)).sorted(), id: \.self) { tag in
                        Button {
                            if note.tags.contains(tag) { note.tags.removeAll { $0 == tag } }
                            else { note.tags.append(tag) }
                        } label: {
                            HStack {
                                Text(tag).foregroundStyle(.primary)
                                Spacer()
                                if note.tags.contains(tag) {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                            .frame(minHeight: 32)
                        }
                        .accessibilityValue(note.tags.contains(tag) ? "Selected" : "Not selected")
                    }
                }
                Section {
                    TextField("New tag", text: $newTag)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit(addTag)
                    Button("Add tag", action: addTag)
                        .disabled(normalizedTag.isEmpty || note.tags.contains(normalizedTag))
                } footer: {
                    Text("Use a slash for nested tags, such as Cooking/Fish. Removing a tag keeps the note.")
                }
            }
            .navigationTitle("Tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func addTag() {
        guard !normalizedTag.isEmpty, !note.tags.contains(normalizedTag) else { return }
        note.tags.append(normalizedTag)
        newTag = ""
    }
}
