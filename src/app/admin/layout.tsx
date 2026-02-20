import { Sparkles, ShieldCheck } from "lucide-react";

import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/admin/context";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { session, platformAdmin } = await requirePlatformAdmin({
    nextPath: "/admin",
  });

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-[1480px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-border/70 bg-card/85 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
                <Sparkles className="size-3.5" />
                Avocado SaaS Control
              </p>
              <h1 className="text-base font-semibold text-foreground sm:text-lg">
                Painel operacional do Admin
              </h1>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                {platformAdmin.role}
              </Badge>
              <SignOutButton />
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-4 lg:hidden">
            <AdminNavigation />
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <Card className="sticky top-4 border-border/70 bg-card/75 backdrop-blur">
              <CardContent className="p-3">
                <AdminNavigation />
              </CardContent>
            </Card>
          </aside>

          <main className="space-y-4 pb-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
