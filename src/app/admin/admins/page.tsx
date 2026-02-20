import {
  createAdminByMasterAction,
  setPlatformAdminStatusAction,
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
import { requirePlatformAdmin } from "@/lib/admin/context";
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

export default async function AdminsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const { session, platformAdmin } = await requirePlatformAdmin({
    requireMaster: true,
    nextPath: "/admin/admins",
  });

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();

  const admins = await prisma.platformAdmin.findMany({
    orderBy: [
      {
        role: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      id: true,
      role: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      createdByAdmin: {
        select: {
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Administracao"
        title="Gestao de administradores globais"
        description="Apenas contas MASTER podem criar novos admins e alterar status de acesso."
      />

      <FeedbackBanners
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <Card className="border-border/70 bg-card/85">
        <CardContent className="p-4">
          <form
            action={createAdminByMasterAction}
            className="grid gap-3 md:grid-cols-4"
          >
            <Input name="name" placeholder="Nome" required />
            <Input name="email" type="email" placeholder="E-mail" required />
            <Input
              name="temporaryPassword"
              type="password"
              placeholder="Senha temporaria"
              required
            />
            <input type="hidden" name="returnTo" value="/admin/admins" />
            <Button type="submit" className="md:col-span-4">
              Criar ADMIN
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 bg-card/85">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Senha temporaria</TableHead>
              <TableHead>Criado por</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => {
              const isCurrentUser = admin.userId === session.user.id;

              return (
                <TableRow key={admin.id}>
                  <TableCell className="min-w-[210px]">
                    <p className="font-medium">{admin.user.name || "Sem nome"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {admin.user.email}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={admin.role} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={admin.status} />
                  </TableCell>
                  <TableCell>
                    {admin.mustChangePassword ? "Pendente" : "Concluida"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {admin.createdByAdmin?.user.email || "Setup inicial"}
                  </TableCell>
                  <TableCell>
                    {admin.status === "ACTIVE" ? (
                      <form action={setPlatformAdminStatusAction} className="ml-auto">
                        <input type="hidden" name="adminId" value={admin.id} />
                        <input type="hidden" name="status" value="DISABLED" />
                        <input
                          type="hidden"
                          name="returnTo"
                          value="/admin/admins"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          disabled={
                            isCurrentUser &&
                            platformAdmin.role === "MASTER" &&
                            admins.filter(
                              (item) =>
                                item.role === "MASTER" &&
                                item.status === "ACTIVE",
                            ).length <= 1
                          }
                        >
                          Desativar
                        </Button>
                      </form>
                    ) : (
                      <form action={setPlatformAdminStatusAction} className="ml-auto">
                        <input type="hidden" name="adminId" value={admin.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <input
                          type="hidden"
                          name="returnTo"
                          value="/admin/admins"
                        />
                        <Button type="submit" variant="secondary" size="sm">
                          Ativar
                        </Button>
                      </form>
                    )}
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
