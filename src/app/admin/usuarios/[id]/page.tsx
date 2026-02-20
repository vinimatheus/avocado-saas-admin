import { notFound } from "next/navigation";

import {
  revokeUserSessionsAction,
  setUserPlatformStatusAction,
} from "@/actions/admin-actions";
import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/db/prisma";

type ParamsInput = {
  id: string;
};

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export const dynamic = "force-dynamic";

export default async function UsuarioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<ParamsInput>;
  searchParams?: SearchParamsInput;
}) {
  const { id } = await params;
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();

  const user = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      platformStatus: true,
      platformBlockedReason: true,
      platformAdmin: {
        select: {
          role: true,
          status: true,
          mustChangePassword: true,
        },
      },
      sessions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      },
      members: {
        select: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          role: true,
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const recentEvents = await prisma.platformEventLog.findMany({
    where: {
      OR: [
        {
          targetType: "user",
          targetId: user.id,
        },
        {
          actorUserId: user.id,
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    select: {
      id: true,
      source: true,
      action: true,
      severity: true,
      createdAt: true,
      metadata: true,
    },
  });

  const isBlocked = user.platformStatus === "BLOCKED";

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Usuario"
        title={user.name}
        description={user.email}
      />

      <FeedbackBanners
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Sessoes ativas
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {user.sessions.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Membros em empresas
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {user.members.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Papel global
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              {user.platformAdmin?.role || "CLIENTE"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.platformAdmin?.status || "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Governanca de plataforma</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">
              Status atual: <StatusBadge status={user.platformStatus} />
            </span>
            {user.platformBlockedReason ? (
              <span className="block">Motivo: {user.platformBlockedReason}</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isBlocked ? (
            <form action={setUserPlatformStatusAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/usuarios/${user.id}`}
              />
              <Button type="submit" variant="secondary">
                Desbloquear usuario
              </Button>
            </form>
          ) : (
            <form action={setUserPlatformStatusAction} className="space-y-2">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="status" value="BLOCKED" />
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/usuarios/${user.id}`}
              />
              <Input
                name="reason"
                placeholder="Motivo do bloqueio"
                required
              />
              <Button type="submit" variant="destructive">
                Bloquear usuario
              </Button>
            </form>
          )}

          <form action={revokeUserSessionsAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`/admin/usuarios/${user.id}`}
            />
            <Button type="submit" variant="outline">
              Encerrar sessoes agora
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Sessoes recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {user.sessions.map((session) => (
              <li
                key={session.id}
                className="rounded-lg border border-border/70 bg-card p-3 text-xs"
              >
                <p>{session.createdAt.toLocaleString("pt-BR")}</p>
                <p className="mt-1 text-muted-foreground">IP: {session.ipAddress || "-"}</p>
                <p className="truncate text-muted-foreground">
                  UA: {session.userAgent || "-"}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Eventos recentes do usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recentEvents.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-border/70 bg-card p-3 text-xs"
              >
                <p>
                  <strong>{event.source}</strong> - {event.action} ({event.severity})
                </p>
                <p className="mt-1 text-muted-foreground">
                  {event.createdAt.toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
