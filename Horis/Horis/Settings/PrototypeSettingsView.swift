import SwiftUI

struct PrototypeSettingsView: View {
    @Binding var appearance: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    Picker("Appearance", selection: $appearance) {
                        Text("System").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                }
                Section("About this prototype") {
                    LabeledContent("App", value: "Horus")
                    Text("Sample notes let you try the layout. Edits, tags, and deletions last only until the app closes.")
                    Text("Your Anubis library is not connected. Rich-text editing and sync will come later.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
