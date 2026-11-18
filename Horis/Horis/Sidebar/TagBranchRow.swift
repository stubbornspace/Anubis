import SwiftUI

struct TagBranchRow: View {
    let branch: TagBranch
    @Bindable var library: MockLibrary

    var body: some View {
        DisclosureGroup(isExpanded: $library[expanded: branch.id]) {
            ForEach(branch.children) { child in
                TagBranchRow(branch: child, library: library)
            }
            ForEach(library.notes(in: branch.id)) { note in
                NoteRow(note: note)
            }
        } label: {
            Text(branch.title)
                .foregroundStyle(.primary)
                .frame(minHeight: 32)
        }
        .accessibilityIdentifier("tag-\(branch.id)")
    }
}
