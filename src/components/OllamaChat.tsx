import { useEffect, useRef, useState } from "react";
import { Send, Square, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { streamOllamaChat, type OllamaMessage } from "@/lib/ollama";
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
  "Generate a BGM prompt for this scene",
  "Polish the dialogue I have so far",
  "Convert the current scene to Ren'Py",
];

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function OllamaChat({ projectId, contextBuilder }: Props) {
  const settings = useStore((s) => s.settings);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
  }, [projectId]);

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
    const system: OllamaMessage = {
      role: "system",
      content: `You are the Builder AI for a visual novel project. You help write scenes, design characters, generate asset prompts, and format Ren'Py output. Be concise.\n\n=== PROJECT CONTEXT ===\n${ctx}\n=== END CONTEXT ===`,
    };
    const next: Msg[] = [...messages, { role: "user", content: userText }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const oll: OllamaMessage[] = [
        system,
        ...next.map((m) => ({ role: m.role, content: m.content })),
      ];
      let acc = "";
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
          out[out.length - 1] = { role: "assistant", content: acc };
          return out;
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        toast.error(`Ollama error: ${(e as Error).message}`);
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Chat with your local Ollama. Your full project (characters, scenes, lorebook,
              assets) is sent as context.
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
