import Link from "next/link";

import {
  revokeUserSessionsAction,
  setUserPlatformStatusAction,
} from "@/actions/admin-actions";
import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db/prisma";

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

export default async function UsuariosAdminPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const query = getSingleSearchParam(resolvedSearchParams.q).trim();
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        }
      : undefined,
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      platformStatus: true,
      platformBlockedReason: true,
      createdAt: true,
      _count: {
        select: {
          sessions: true,
          members: true,
        },
      },
      platformAdmin: {
        select: {
          role: true,
          status: true,
        },
      },
    },
  });

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Usuarios"
        title="Controle de acessos globais"
        description="Gerencie bloqueios de conta e encerramento de sessoes em toda a plataforma."
      />

      <Card className="border-border/70 bg-card/85">
        <CardContent className="p-4">
          <form className="flex flex-col gap-2 sm:flex-row" method="get">
            <Input
              name="q"
              placeholder="Buscar por nome ou e-mail"
              defaultValue={query}
            />
            <Button type="submit">Buscar</Button>
          </form>
        </CardContent>
      </Card>

      <FeedbackBanners
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <Card className="overflow-hidden border-border/70 bg-card/85">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Sessoes</TableHead>
              <TableHead>Status plataforma</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isBlocked = user.platformStatus === "BLOCKED";

              return (
                <TableRow key={user.id} className="align-top">
                  <TableCell className="min-w-[200px]">
                    <p className="font-medium">
                      <Link
                        href={`/admin/usuarios/${user.id}`}
                        className="transition-colors hover:text-primary"
                      >
                        {user.name}
                      </Link>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <p>{user.platformAdmin?.role || "CLIENTE"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user._count.members} membro(s)
                    </p>
                  </TableCell>
                  <TableCell>{user._count.sessions}</TableCell>
                  <TableCell className="min-w-[180px]">
                    <StatusBadge status={user.platformStatus} />
                    {user.platformBlockedReason ? (
                      <p className="mt-2 max-w-[24ch] text-xs text-muted-foreground">
                        {user.platformBlockedReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="ml-auto flex max-w-[260px] flex-col gap-2">
                      {isBlocked ? (
                        <form action={setUserPlatformStatusAction} className="space-y-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="status" value="ACTIVE" />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/admin/usuarios"
                          />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            className="w-full"
                          >
                            Desbloquear
                          </Button>
                        </form>
                      ) : (
                        <form action={setUserPlatformStatusAction} className="space-y-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="status" value="BLOCKED" />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/admin/usuarios"
                          />
                          <Input
                            type="text"
                            name="reason"
                            placeholder="Motivo do bloqueio"
                            className="h-8 text-xs"
                            required
                          />
                          <Button
                            type="submit"
                            variant="destructive"
                            size="sm"
                            className="w-full"
                          >
                            Bloquear
                          </Button>
                        </form>
                      )}

                      <form action={revokeUserSessionsAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value="/admin/usuarios"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          Encerrar sessoes
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
