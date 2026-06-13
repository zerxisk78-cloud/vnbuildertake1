// Built-in example VN — seeded for first-run users so the app is never empty.
import { nanoid } from "nanoid";
import type { Project } from "./types";

export function buildExampleProject(): Project {
  const akari = nanoid(8);
  const ren = nanoid(8);
  const s1 = nanoid(8);
  const s2a = nanoid(8);
  const s2b = nanoid(8);
  return {
    id: nanoid(10),
    name: "Example — The Lantern Festival",
    genre: "Romance",
    description:
      "A short tutorial visual novel. Two friends meet at a summer festival; the player chooses how the evening ends. Use this as a template — edit, regenerate art, or delete it once you're comfortable.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    characters: [
      {
        id: akari,
        name: "Akari",
        role: "Childhood friend",
        personality: "Warm, curious, a little shy.",
        voiceStyle: "Soft, lyrical, gentle pace.",
        outfit: "Indigo yukata with a goldfish pattern, white obi.",
        palette: "indigo, gold, soft pink",
        portraitPrompt:
          "anime girl, 18, long black hair, indigo yukata with goldfish pattern, gentle smile, festival evening lighting",
        expressions: [
          { name: "neutral" },
          { name: "happy" },
          { name: "blush" },
          { name: "sad" },
        ],
      },
      {
        id: ren,
        name: "Ren",
        role: "Protagonist",
        personality: "Thoughtful, easily flustered.",
        voiceStyle: "Calm, low register.",
        outfit: "Charcoal jinbei, simple sandals.",
        palette: "charcoal, deep teal",
        portraitPrompt:
          "anime boy, 18, dark hair, charcoal jinbei, kind eyes, festival night",
        expressions: [{ name: "neutral" }, { name: "surprised" }, { name: "smile" }],
      },
    ],
    scenes: [
      {
        id: s1,
        title: "1 — Festival Grounds",
        backgroundPrompt:
          "japanese summer festival at dusk, paper lanterns, food stalls, warm bokeh, anime background",
        musicPrompt: "soft shamisen and taiko, gentle festive theme",
        lines: [
          { id: nanoid(8), type: "narration", text: "Lanterns float above the shrine path. The night smells like grilled corn and gunpowder." },
          { id: nanoid(8), type: "show", characterId: akari, expression: "happy", text: "" },
          { id: nanoid(8), type: "dialogue", characterId: akari, expression: "happy", text: "Ren! Over here — I saved you a spot by the river." },
          { id: nanoid(8), type: "dialogue", characterId: ren, expression: "smile", text: "You actually came. I thought you said festivals were 'too loud'." },
          { id: nanoid(8), type: "dialogue", characterId: akari, expression: "blush", text: "Maybe I changed my mind. About a few things." },
          {
            id: nanoid(8),
            type: "choice",
            text: "",
            choices: [
              { id: nanoid(6), label: "Ask what she means.", gotoSceneId: s2a },
              { id: nanoid(6), label: "Suggest watching the fireworks together.", gotoSceneId: s2b },
            ],
          },
        ],
      },
      {
        id: s2a,
        title: "2A — The Question",
        backgroundPrompt: "river bank at night, paper lanterns reflecting in water, anime background",
        lines: [
          { id: nanoid(8), type: "dialogue", characterId: ren, expression: "neutral", text: "What did you change your mind about?" },
          { id: nanoid(8), type: "dialogue", characterId: akari, expression: "blush", text: "…About telling you something I should've said a long time ago." },
          { id: nanoid(8), type: "narration", text: "The first firework opens above the river, painting both of you gold." },
        ],
      },
      {
        id: s2b,
        title: "2B — The Fireworks",
        backgroundPrompt: "japanese fireworks over a river at night, vivid, anime background",
        musicPrompt: "warm strings rising over taiko",
        lines: [
          { id: nanoid(8), type: "dialogue", characterId: ren, expression: "smile", text: "Come on — the fireworks start in a minute. Best view's on the bridge." },
          { id: nanoid(8), type: "dialogue", characterId: akari, expression: "happy", text: "Then we'd better run." },
          { id: nanoid(8), type: "narration", text: "She grabs your hand. Above you, the sky cracks open in color." },
        ],
      },
    ],
    lorebook: [
      {
        id: nanoid(8),
        title: "Lantern Festival",
        keywords: ["festival", "lanterns", "shrine"],
        body: "An annual midsummer festival at the local shrine. Paper lanterns line the river; fireworks at 9pm.",
      },
    ],
    assets: [],
  };
}
