import { Link, useLocation } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { BookOpenText, Home, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const navItem = (to: string, label: string, Icon: typeof Home) => {
    const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 flex-col border-r border-border bg-sidebar p-3 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2 py-3">
          <BookOpenText className="h-5 w-5 text-primary" />
          <div className="text-sm font-semibold tracking-tight">VN Builder Studio</div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItem("/", "Projects", Home)}
          {navItem("/settings", "Settings", SettingsIcon)}
        </nav>
        <div className="mt-auto px-2 py-3 text-xs text-muted-foreground">
          Local · Ollama · ComfyUI
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
