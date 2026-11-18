import Foundation
import Observation

/// Design-only data. Replace the store boundary when connecting the Notes backend.
@MainActor @Observable
final class MockNote: Identifiable {
    let id: UUID
    var title: String
    var body: String
    var tags: [String]

    init(id: UUID = UUID(), title: String, body: String, tags: [String] = []) {
        self.id = id
        self.title = title
        self.body = body
        self.tags = tags
    }

    var displayTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Untitled note" : title
    }
}
