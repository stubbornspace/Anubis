import Foundation

@MainActor
enum SampleNotes {
    static func make() -> [MockNote] {
        [
            MockNote(title: "Yuzu Tuna Tartare", body: """
            Bright citrus, a little heat, and the freshest tuna you can find.

            Ingredients

            • ¼ pound ahi tuna, cut into small cubes
            • ½ tablespoon soy sauce
            • 2 teaspoons sake
            • 2 teaspoons mirin
            • ½ teaspoon grated garlic
            • 1 teaspoon yuzu juice
            • Scallions and sesame seeds, to finish

            Method

            Whisk the soy sauce, sake, mirin, garlic, and yuzu together. Keep chilled until ready to serve.

            Gently fold in the tuna. Spoon onto a cool plate and finish with scallions and sesame seeds.

            Kitchen notes

            Dress just before serving to keep the texture delicate. A little avocado works beautifully alongside.
            """, tags: ["Cooking/Fish"]),
            MockNote(title: "Miso salmon", body: "Mix white miso, mirin, and a little honey. Brush over salmon and roast until just cooked.\n\nServe with steamed rice and cucumber salad.", tags: ["Cooking/Fish", "Weeknight"]),
            MockNote(title: "Sunday focaccia", body: "A slow morning, olive oil, and a very hot oven.\n\nLet the dough rest overnight. Dimple generously, add rosemary and flaky salt, then bake until deeply golden.", tags: ["Cooking/Baking"]),
            MockNote(title: "A small kitchen", body: "Keep the things you reach for every day close at hand.\n\nOne good knife. A wooden board. A heavy pan. Space to work.", tags: ["Cooking"]),
            MockNote(title: "Kyoto in the rain", body: "Walk the quieter streets early. Find coffee near the river. Leave the afternoon unplanned.\n\nPlaces to remember\n\n• Philosopher’s Path\n• Nishiki Market\n• The little bookshop by the station", tags: ["Travel/Japan"]),
            MockNote(title: "Packing lightly", body: "Notebook, camera, comfortable shoes.\n\nLeave room for something unexpected.", tags: ["Travel"]),
            MockNote(title: "A calmer writing space", body: "The page should feel like a place to think.\n\nKeep navigation close, let the words breathe, and make the small interactions feel familiar.", tags: ["Ideas"]),
            MockNote(title: "Weekend thoughts", body: "Go for a long walk.\nCook something new.\nRead a few pages without checking the time."),
            MockNote(title: "Untitled note", body: "A little space for the next idea.")
        ]
    }
}
