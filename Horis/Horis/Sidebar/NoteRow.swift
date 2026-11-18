import SwiftUI

struct NoteRow: View {
    let note: MockNote

    var body: some View {
        NavigationLink(value: note.id) {
            HStack {
                Text("–")
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
                Text(note.displayTitle)
                    .lineLimit(1)
            }
            .frame(minHeight: 32)
        }
        .accessibilityLabel(note.displayTitle)
    }
}
