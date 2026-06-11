// XTTS-api-server client (https://github.com/daswer123/xtts-api-server).
// All calls go from renderer; the server has permissive CORS by default.

export interface XttsSpeaker {
  name: string;
  /** Speaker key returned by /speakers, used as speaker_wav in /tts_to_audio. */
  voice_id?: string;
}

export async function xttsPing(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/docs`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function xttsListSpeakers(url: string): Promise<string[]> {
  // The api-server exposes /speakers (list of trained speaker names) and
  // /sample/{speaker} for previews. Different forks use /studio_speakers.
  const base = url.replace(/\/$/, "");
  for (const path of ["/speakers", "/studio_speakers"]) {
    try {
      const r = await fetch(base + path);
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j)) return j as string[];
      if (j && typeof j === "object") return Object.keys(j);
    } catch {
      /* try next */
    }
  }
  return [];
}

export async function xttsListLanguages(url: string): Promise<string[]> {
  const base = url.replace(/\/$/, "");
  try {
    const r = await fetch(base + "/languages");
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j)) return j as string[];
    }
  } catch {
    /* noop */
  }
  return ["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "ko", "hu"];
}

export interface XttsRequest {
  url: string;
  text: string;
  speaker: string;
  language: string;
  /** Override file-name prefix; the server will namespace it. */
  fileName?: string;
}

/** Returns a blob URL the renderer can play / save. */
export async function xttsGenerate(req: XttsRequest): Promise<{ blob: Blob; url: string }> {
  const base = req.url.replace(/\/$/, "");
  const r = await fetch(base + "/tts_to_audio/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: req.text,
      speaker_wav: req.speaker,
      language: req.language,
      file_name_or_path: req.fileName,
    }),
  });
  if (!r.ok) throw new Error(`XTTS ${r.status}: ${await r.text().catch(() => "")}`);
  const blob = await r.blob();
  return { blob, url: URL.createObjectURL(blob) };
}
