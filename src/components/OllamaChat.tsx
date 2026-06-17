import { useEffect, useRef, useState } from "react";
import { Send, Square, Sparkles, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { streamOllamaChat, type OllamaMessage } from "@/lib/ollama";
import { bridge, type ChatMsg } from "@/lib/bridge";
import { toast } from "sonner";

interface Props {
  projectId: string;
  contextBuilder: () => string;
}

const QUICK_PROMPTS = [
  "Write the opening scene",
  "Continue the current scene",
  "Design a new character",
  "Suggest a branching choice here",
  "Generate a background prompt for this scene",
  "Polish the dialogue I have so far",
];

// In-memory cache so chat survives tab switches even before disk write resolves.
const chatCache: Record<string, ChatMsg[]> = {};

function buildSystemPrompt(ctx: string): string {
  return `You are the Builder AI for a Visual Novel project. You are a true creative collaborator: when the user asks for something (e.g. "create the opening scene", "add a character"), you actually CREATE it by emitting structured actions, not just describing it.

=== HOW TO RESPOND ===
1. Briefly (1-3 sentences) explain what you are creating.
2. Emit ONE fenced JSON block with the tag \`vn-actions\` containing an array of actions. Example:
\`\`\`vn-actions
{ "actions": [
  { "type": "create_scene", "title": "Opening", "backgroundPrompt": "rainy Tokyo alley at dusk", "musicPrompt": "melancholy lo-fi piano",
    "lines": [
      { "type": "narration", "text": "The rain had not stopped for three days." },
      { "type": "dialogue", "character": "Hana", "expression": "neutral", "text": "You came." }
    ] },
  { "type": "create_character", "name": "Hana", "role": "protagonist", "personality": "quiet, observant", "voiceStyle": "soft alto", "outfit": "navy raincoat", "palette": "deep blues" }
] }
\`\`\`
3. If a character is mentioned but missing required info, still emit a create_character action with reasonable defaults AND ask the user one short follow-up to refine it.
4. Reference existing characters by their exact name. Do NOT duplicate a character that already exists in context.

=== AVAILABLE ACTIONS ===
- create_scene { title, backgroundPrompt?, musicPrompt?, lines?: [{type:"dialogue"|"narration"|"choice", character?, expression?, text, choices?:[{label, gotoSceneTitle?}]}] }
- update_scene { title (existing), backgroundPrompt?, musicPrompt?, appendLines?: [...] }
- create_character { name, role?, personality?, voiceStyle?, outfit?, palette?, portraitPrompt? }
- update_character { name (existing), ...patch }
- add_lore { title, keywords?: [string], body }

=== PROJECT CONTEXT ===
${ctx}
=== END CONTEXT ===

Be concise. Always emit the vn-actions block when the user asks you to create/add/update something. If the user is only chatting (asking a question), reply normally without a vn-actions block.`;
}

interface ActionResult {
  ok: boolean;
  summary: string;
}

interface ParsedActions {
  actions: Array<Record<string, unknown>>;
}

function extractActions(text: string): ParsedActions["actions"] {
  const re = /```vn-actions\s*([\s\S]*?)```/gi;
  const out: ParsedActions["actions"] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const j = JSON.parse(m[1].trim()) as ParsedActions;
      if (Array.isArray(j?.actions)) out.push(...j.actions);
    } catch {
      /* ignore malformed block */
    }
  }
  return out;
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function executeActions(
  projectId: string,
  actions: ParsedActions["actions"],
): Promise<ActionResult[]> {
  const store = useStore.getState();
  const results: ActionResult[] = [];

  for (const raw of actions) {
    const a = raw as Record<string, unknown>;
    const type = String(a.type ?? "");
    try {
      const project = store.getProject(projectId);
      if (!project) {
        results.push({ ok: false, summary: `Project missing` });
        continue;
      }
      if (type === "create_scene") {
        const title = String(a.title ?? "Untitled Scene");
        const charByName = new Map(project.characters.map((c) => [c.name.toLowerCase(), c.id]));
        const linesIn = Array.isArray(a.lines) ? (a.lines as Array<Record<string, unknown>>) : [];
        const lines = linesIn.map((l) => {
          const t = String(l.type ?? "narration");
          const charName = l.character ? String(l.character) : undefined;
          return {
            id: nid(),
            type: (["dialogue", "narration", "choice", "sfx", "music", "transition", "show", "hide", "note"].includes(t) ? t : "narration") as
              | "dialogue" | "narration" | "choice" | "sfx" | "music" | "transition" | "show" | "hide" | "note",
            text: String(l.text ?? ""),
            characterId: charName ? charByName.get(charName.toLowerCase()) : undefined,
            expression: l.expression ? String(l.expression) : undefined,
          };
        });
        const scene = await store.addScene(projectId, title);
        await store.updateScene(projectId, scene.id, {
          backgroundPrompt: a.backgroundPrompt ? String(a.backgroundPrompt) : undefined,
          musicPrompt: a.musicPrompt ? String(a.musicPrompt) : undefined,
          lines,
        });
        results.push({ ok: true, summary: `Scene "${title}" created (${lines.length} lines)` });
      } else if (type === "update_scene") {
        const title = String(a.title ?? "");
        const sc = project.scenes.find((s) => s.title.toLowerCase() === title.toLowerCase());
        if (!sc) {
          results.push({ ok: false, summary: `Scene "${title}" not found` });
          continue;
        }
        const append = Array.isArray(a.appendLines) ? (a.appendLines as Array<Record<string, unknown>>) : [];
        const charByName = new Map(project.characters.map((c) => [c.name.toLowerCase(), c.id]));
        const newLines = append.map((l) => ({
          id: nid(),
          type: String(l.type ?? "narration") as "dialogue" | "narration" | "choice",
          text: String(l.text ?? ""),
          characterId: l.character ? charByName.get(String(l.character).toLowerCase()) : undefined,
          expression: l.expression ? String(l.expression) : undefined,
        }));
        await store.updateScene(projectId, sc.id, {
          backgroundPrompt: a.backgroundPrompt != null ? String(a.backgroundPrompt) : sc.backgroundPrompt,
          musicPrompt: a.musicPrompt != null ? String(a.musicPrompt) : sc.musicPrompt,
          lines: [...sc.lines, ...newLines],
        });
        results.push({ ok: true, summary: `Scene "${title}" updated (+${newLines.length} lines)` });
      } else if (type === "create_character") {
        const name = String(a.name ?? "New Character");
        const existing = project.characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          results.push({ ok: true, summary: `Character "${name}" already exists — skipped` });
          continue;
        }
        const ch = await store.addCharacter(projectId, name);
        await store.updateCharacter(projectId, ch.id, {
          role: a.role ? String(a.role) : "",
          personality: a.personality ? String(a.personality) : "",
          voiceStyle: a.voiceStyle ? String(a.voiceStyle) : "",
          outfit: a.outfit ? String(a.outfit) : "",
          palette: a.palette ? String(a.palette) : "",
          portraitPrompt: a.portraitPrompt ? String(a.portraitPrompt) : undefined,
        });
        results.push({ ok: true, summary: `Character "${name}" created` });
      } else if (type === "update_character") {
        const name = String(a.name ?? "");
        const ch = project.characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!ch) {
          results.push({ ok: false, summary: `Character "${name}" not found` });
          continue;
        }
        await store.updateCharacter(projectId, ch.id, {
          role: a.role != null ? String(a.role) : ch.role,
          personality: a.personality != null ? String(a.personality) : ch.personality,
          voiceStyle: a.voiceStyle != null ? String(a.voiceStyle) : ch.voiceStyle,
          outfit: a.outfit != null ? String(a.outfit) : ch.outfit,
          palette: a.palette != null ? String(a.palette) : ch.palette,
          portraitPrompt: a.portraitPrompt != null ? String(a.portraitPrompt) : ch.portraitPrompt,
        });
        results.push({ ok: true, summary: `Character "${name}" updated` });
      } else if (type === "add_lore") {
        const title = String(a.title ?? "Untitled");
        const entry = await store.addLore(projectId, title);
        await store.updateLore(projectId, entry.id, {
          keywords: Array.isArray(a.keywords) ? (a.keywords as unknown[]).map(String) : [],
          body: String(a.body ?? ""),
        });
        results.push({ ok: true, summary: `Lore "${title}" added` });
      } else {
        results.push({ ok: false, summary: `Unknown action type: ${type}` });
      }
    } catch (e) {
      results.push({ ok: false, summary: `${type} failed: ${(e as Error).message}` });
    }
  }
  return results;
}

export function OllamaChat({ projectId, contextBuilder }: Props) {
  const settings = useStore((s) => s.settings);
  const [messages, setMessages] = useState<ChatMsg[]>(() => chatCache[projectId] ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hydratedFor = useRef<string | null>(null);

  // Hydrate chat from disk/localStorage on project switch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hydratedFor.current === projectId) return;
      const loaded = await bridge.readChats(projectId).catch(() => []);
      if (cancelled) return;
      hydratedFor.current = projectId;
      const merged = chatCache[projectId]?.length ? chatCache[projectId] : loaded;
      chatCache[projectId] = merged;
      setMessages(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Persist on change (debounced via microtask)
  useEffect(() => {
    chatCache[projectId] = messages;
    if (hydratedFor.current !== projectId) return;
    const h = setTimeout(() => {
      void bridge.writeChats(projectId, messages).catch(() => {});
    }, 250);
    return () => clearTimeout(h);
  }, [messages, projectId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages]);

  async function send(text?: string) {
    const userText = (text ?? input).trim();
    if (!userText || streaming) return;
    if (!settings.ollama.model) {
      toast.error("Pick an Ollama model in Settings first.");
      return;
    }
    setInput("");
    const ctx = contextBuilder();
    const system: OllamaMessage = { role: "system", content: buildSystemPrompt(ctx) };
    const next: ChatMsg[] = [...messages, { role: "user", content: userText, ts: Date.now() }];
    setMessages([...next, { role: "assistant", content: "", ts: Date.now() }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      const oll: OllamaMessage[] = [system, ...next.map((m) => ({ role: m.role, content: m.content }))];
      for await (const chunk of streamOllamaChat(
        {
          url: settings.ollama.url,
          model: settings.ollama.model,
          temperature: settings.ollama.temperature,
        },
        oll,
        ac.signal,
      )) {
        acc += chunk;
        setMessages((prev) => {
          const out = prev.slice();
          out[out.length - 1] = { role: "assistant", content: acc, ts: Date.now() };
          return out;
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        toast.error(`Ollama error: ${(e as Error).message}`);
        setMessages((prev) => prev.slice(0, -1));
        setStreaming(false);
        abortRef.current = null;
        return;
      }
    }
    setStreaming(false);
    abortRef.current = null;

    // Execute any actions the model emitted
    const actions = extractActions(acc);
    if (actions.length > 0) {
      const results = await executeActions(projectId, actions);
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      if (ok > 0) toast.success(`AI applied ${ok} change${ok === 1 ? "" : "s"} to your project.`);
      if (fail > 0) toast.error(`${fail} action${fail === 1 ? "" : "s"} failed.`);
      const summary = results.map((r) => `${r.ok ? "✓" : "✗"} ${r.summary}`).join("\n");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `**Applied changes:**\n\n${summary}`, ts: Date.now() },
      ]);
    }
  }

  function clearChat() {
    setMessages([]);
    chatCache[projectId] = [];
    void bridge.writeChats(projectId, []).catch(() => {});
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          Builder AI — {settings.ollama.model || "no model"} · chat persists per project
        </span>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearChat} disabled={streaming}>
            <Trash2 className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
      </div>
      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Tell me what to build. Example: <em>"Create the opening scene where Hana meets the
              stranger at the train station — rainy night, melancholy mood."</em> I'll create the
              scene card, add any new characters mentioned, and ask you for more detail when I
              need it.
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="secondary"
                  onClick={() => send(p)}
                  disabled={streaming}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {p}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                : "max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-secondary-foreground"
            }
          >
            {m.role === "assistant" ? (
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm">{m.content}</div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${settings.ollama.model || "(no model)"} …`}
            className="max-h-40 min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {streaming ? (
            <Button variant="destructive" onClick={() => abortRef.current?.abort()}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => send()} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
