import * as React from "react";
import { Shield } from "lucide-react";

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8 sm:max-w-lg">
      <section className="relative w-full overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-6 shadow-lg shadow-primary/5 backdrop-blur">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-24 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative mb-5 space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
            <Shield className="size-3.5" />
            Avocado Admin
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="relative">{children}</div>
      </section>
    </main>
  );
}
