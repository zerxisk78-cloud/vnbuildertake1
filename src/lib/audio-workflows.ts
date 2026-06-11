// ComfyUI audio workflow templates.
// Two backends, both runnable inside ComfyUI:
//   - Stable Audio Open 1.0 (built-in nodes since ComfyUI 0.2.x)
//   - MusicGen via the popular "ComfyUI-MusicGen" custom node pack
// Output node: SaveAudio → writes to ComfyUI/output and exposes a /view URL,
// exactly like image generation.

export interface AudioParams {
  positive: string;
  negative?: string;
  seconds?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  /** Stable Audio Open checkpoint filename (in models/checkpoints/). */
  checkpoint?: string;
}

/**
 * Stable Audio Open 1.0 — recommended for SFX and short ambient cues.
 * Requires `stable-audio-open-1.0` checkpoint in ComfyUI/models/checkpoints/.
 */
export function stableAudioWorkflow(p: AudioParams): Record<string, unknown> {
  const seed = p.seed ?? Math.floor(Math.random() * 2_147_483_647);
  const ckpt = p.checkpoint ?? "stable-audio-open-1.0.safetensors";
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "2": {
      class_type: "EmptyLatentAudio",
      inputs: { seconds: p.seconds ?? 8, batch_size: 1 },
    },
    "3": { class_type: "CLIPTextEncode", inputs: { text: p.positive, clip: ["1", 1] } },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: p.negative ?? "", clip: ["1", 1] },
    },
    "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: p.steps ?? 50,
        cfg: p.cfg ?? 4.5,
        sampler_name: "dpmpp_3m_sde_gpu",
        scheduler: "exponential",
        denoise: 1,
        model: ["1", 0],
        positive: ["3", 0],
        negative: ["5", 0],
        latent_image: ["2", 0],
      },
    },
    "7": { class_type: "VAEDecodeAudio", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": {
      class_type: "SaveAudio",
      inputs: { filename_prefix: "vnstudio_audio", audio: ["7", 0] },
    },
  };
}

/**
 * MusicGen (ComfyUI-MusicGen custom node pack) — recommended for longer
 * music tracks. Falls back gracefully if nodes aren't installed (queue will
 * error and the UI surfaces the message).
 */
export function musicGenWorkflow(p: AudioParams): Record<string, unknown> {
  return {
    "1": {
      class_type: "MusicgenLoader",
      inputs: { model_name: "facebook/musicgen-small" },
    },
    "2": {
      class_type: "MusicgenGenerate",
      inputs: {
        model: ["1", 0],
        text: p.positive,
        duration: p.seconds ?? 12,
        cfg: p.cfg ?? 3,
        top_k: 250,
        top_p: 0,
        temperature: 1,
        seed: p.seed ?? Math.floor(Math.random() * 2_147_483_647),
      },
    },
    "3": {
      class_type: "SaveAudio",
      inputs: { filename_prefix: "vnstudio_music", audio: ["2", 0] },
    },
  };
}

export const AUDIO_PRESETS = {
  music: (prompt: string, seconds = 20) =>
    musicGenWorkflow({ positive: prompt, seconds }),
  musicStableAudio: (prompt: string, seconds = 20) =>
    stableAudioWorkflow({ positive: prompt, seconds, steps: 80 }),
  sfx: (prompt: string, seconds = 3) =>
    stableAudioWorkflow({ positive: prompt, seconds, steps: 40 }),
  ambient: (prompt: string, seconds = 15) =>
    stableAudioWorkflow({ positive: prompt, seconds, steps: 60 }),
};
