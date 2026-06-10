// ComfyUI HTTP/WebSocket client.
// Talks to a running ComfyUI server (default http://127.0.0.1:8188).
// All calls go directly from the renderer (CORS is enabled on ComfyUI by default).

import { nanoid } from "nanoid";

export interface QueueOptions {
  url: string;
  workflow: Record<string, unknown>;
  onProgress?: (pct: number, message: string) => void;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  url: string; // http URL to the image on ComfyUI's /view endpoint
  filename: string;
  subfolder: string;
  type: string;
  promptId: string;
  seed?: number;
}

/** GET /system_stats — also acts as a ping. */
export async function comfyPing(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/system_stats`, { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

/** GET /object_info — used to list checkpoints, samplers, etc. */
export async function comfyObjectInfo(url: string): Promise<Record<string, any>> {
  const r = await fetch(`${url}/object_info`);
  if (!r.ok) throw new Error(`object_info failed: ${r.status}`);
  return r.json();
}

/** Pull the checkpoint model list (the first input enum of CheckpointLoaderSimple). */
export async function comfyListCheckpoints(url: string): Promise<string[]> {
  const info = await comfyObjectInfo(url);
  const node = info?.CheckpointLoaderSimple;
  const enumVals = node?.input?.required?.ckpt_name?.[0];
  return Array.isArray(enumVals) ? enumVals : [];
}

/** POST /prompt — queue a workflow. */
async function queuePrompt(url: string, workflow: Record<string, unknown>, clientId: string) {
  const r = await fetch(`${url}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!r.ok) throw new Error(`queue failed: ${r.status} ${await r.text()}`);
  return r.json() as Promise<{ prompt_id: string; number: number }>;
}

/** GET /history/<id> — poll for completion. */
async function getHistory(url: string, promptId: string) {
  const r = await fetch(`${url}/history/${promptId}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j[promptId] ?? null;
}

/** Run a workflow and resolve once it finishes. Polls with optional WS progress. */
export async function runWorkflow(opts: QueueOptions): Promise<GeneratedImage[]> {
  const { url, workflow, onProgress, signal } = opts;
  const clientId = nanoid(16);

  // Open WS for progress (best-effort, fallback to polling-only).
  let ws: WebSocket | null = null;
  try {
    const wsUrl = url.replace(/^http/, "ws") + `/ws?clientId=${clientId}`;
    ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (m.type === "progress") {
          const v = (m.data.value / m.data.max) * 100;
          onProgress?.(v, `Sampling ${m.data.value}/${m.data.max}`);
        } else if (m.type === "executing") {
          if (m.data?.node) onProgress?.(-1, `Running node ${m.data.node}`);
        }
      } catch {
        /* noop */
      }
    };
  } catch {
    /* WS optional */
  }

  try {
    onProgress?.(0, "Queueing…");
    const { prompt_id } = await queuePrompt(url, workflow, clientId);

    // Poll history until outputs appear.
    const start = Date.now();
    const timeoutMs = 10 * 60 * 1000;
    while (true) {
      if (signal?.aborted) throw new Error("aborted");
      if (Date.now() - start > timeoutMs) throw new Error("timeout");
      const h = await getHistory(url, prompt_id);
      if (h?.outputs) {
        const images: GeneratedImage[] = [];
        for (const out of Object.values<any>(h.outputs)) {
          if (out?.images?.length) {
            for (const img of out.images) {
              const q = new URLSearchParams({
                filename: img.filename,
                subfolder: img.subfolder ?? "",
                type: img.type ?? "output",
              });
              images.push({
                url: `${url}/view?${q.toString()}`,
                filename: img.filename,
                subfolder: img.subfolder ?? "",
                type: img.type ?? "output",
                promptId: prompt_id,
              });
            }
          }
        }
        if (images.length) {
          onProgress?.(100, "Done");
          return images;
        }
      }
      await new Promise((r) => setTimeout(r, 750));
    }
  } finally {
    try {
      ws?.close();
    } catch {
      /* noop */
    }
  }
}
