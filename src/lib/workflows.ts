// ComfyUI workflow templates (API format prompts).
// These are minimal SDXL pipelines that work with any standard SDXL checkpoint.
// Customize by selecting a different checkpoint model in Settings.

export interface WorkflowParams {
  checkpoint: string;
  positive: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  sampler?: string;
  scheduler?: string;
}

const DEFAULT_NEG =
  "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, "
  + "fewer digits, cropped, worst quality, low quality, jpeg artifacts, watermark, signature";

/** Standard SDXL txt2img workflow in ComfyUI API format. */
export function sdxlTxt2Img(p: WorkflowParams): Record<string, unknown> {
  const seed = p.seed ?? Math.floor(Math.random() * 2_147_483_647);
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: p.steps ?? 28,
        cfg: p.cfg ?? 6.5,
        sampler_name: p.sampler ?? "dpmpp_2m",
        scheduler: p.scheduler ?? "karras",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: p.checkpoint },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: p.width ?? 1024, height: p.height ?? 1024, batch_size: 1 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: p.positive, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: p.negative ?? DEFAULT_NEG, clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "vnstudio", images: ["8", 0] },
    },
  };
}

/** Preset wrappers. */
export const PRESETS = {
  characterPortrait: (checkpoint: string, prompt: string, seed?: number) =>
    sdxlTxt2Img({
      checkpoint,
      positive:
        "masterpiece, best quality, highly detailed, character portrait, "
        + "upper body, looking at viewer, soft studio lighting, clean background, "
        + prompt,
      width: 832,
      height: 1216,
      seed,
    }),
  background: (checkpoint: string, prompt: string, seed?: number) =>
    sdxlTxt2Img({
      checkpoint,
      positive:
        "masterpiece, best quality, highly detailed background, cinematic lighting, "
        + "no humans, scenery, wide establishing shot, "
        + prompt,
      width: 1344,
      height: 768,
      seed,
    }),
  cg: (checkpoint: string, prompt: string, seed?: number) =>
    sdxlTxt2Img({
      checkpoint,
      positive:
        "masterpiece, best quality, highly detailed, cinematic CG illustration, "
        + "dramatic lighting, "
        + prompt,
      width: 1344,
      height: 768,
      seed,
    }),
};
