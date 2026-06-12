// Standard Ren'Py expression set used for character sprite batch generation.
// Order matches typical VN authoring conventions; neutral is always first so
// it doubles as the character's default portrait.

export interface ExpressionPreset {
  name: string;
  /** Prompt suffix appended to the character's base portrait prompt. */
  suffix: string;
}

export const EXPRESSION_PRESETS: ExpressionPreset[] = [
  { name: "neutral", suffix: "neutral expression, calm, relaxed face, looking at viewer" },
  { name: "happy", suffix: "happy expression, warm smile, bright eyes, cheerful" },
  { name: "sad", suffix: "sad expression, downcast eyes, slight frown, melancholy" },
  { name: "angry", suffix: "angry expression, furrowed brow, glaring eyes, tense jaw" },
  { name: "surprised", suffix: "surprised expression, wide eyes, open mouth, raised eyebrows" },
  { name: "blush", suffix: "shy expression, blushing cheeks, soft smile, looking away" },
  { name: "shocked", suffix: "shocked expression, eyes wide open, mouth agape, stunned" },
  { name: "smug", suffix: "smug expression, smirk, half-lidded eyes, confident" },
];
