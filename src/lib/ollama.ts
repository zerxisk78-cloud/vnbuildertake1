// Browser/Electron-side Ollama client. Direct fetch — works in Electron (no CORS),
// works in browser preview if Ollama is started with OLLAMA_ORIGINS=*.

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaConfig {
  url: string;
  model: string;
  temperature: number;
}

export async function listOllamaModels(url: string): Promise<string[]> {
  const r = await fetch(`${url.replace(/\/$/, "")}/api/tags`);
  if (!r.ok) throw new Error(`Ollama /api/tags ${r.status}`);
  const j = await r.json();
  return (j.models ?? []).map((m: { name: string }) => m.name);
}

export async function* streamOllamaChat(
  cfg: OllamaConfig,
  messages: OllamaMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      options: { temperature: cfg.temperature },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama chat failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const j = JSON.parse(s) as { message?: { content?: string }; done?: boolean };
        const chunk = j.message?.content ?? "";
        if (chunk) yield chunk;
      } catch {
        /* skip */
      }
    }
  }
}
