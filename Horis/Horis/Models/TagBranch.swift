import Foundation

struct TagBranch: Identifiable, Equatable {
    let id: String
    let title: String
    let children: [TagBranch]

    static func roots(from tags: [String], parent: String = "") -> [TagBranch] {
        let prefix = parent.isEmpty ? "" : parent + "/"
        let names = Set(tags.filter { $0.hasPrefix(prefix) }.compactMap { tag in
            tag.dropFirst(prefix.count).split(separator: "/").first.map(String.init)
        })
        return names.sorted { $0.localizedStandardCompare($1) == .orderedAscending }.map { name in
            let path = prefix + name
            return TagBranch(id: path, title: name, children: roots(from: tags, parent: path))
        }
    }
}
