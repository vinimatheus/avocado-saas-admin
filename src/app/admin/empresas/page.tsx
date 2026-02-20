import Link from "next/link";
import {
  Building2,
  ExternalLink,
  Gift,
  Lock,
  LogIn,
  MoreHorizontal,
  Unlock,
  UserRound,
} from "lucide-react";

import { setOrganizationPlatformStatusAction } from "@/actions/admin-actions";
import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { cn } from "@/lib/utils";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parsePageParam(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export const dynamic = "force-dynamic";
const PAGE_SIZE = 12;

export default async function EmpresasAdminPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const query = getSingleSearchParam(resolvedSearchParams.q).trim();
  const page = parsePageParam(getSingleSearchParam(resolvedSearchParams.page).trim());
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();
  const where = query
    ? {
        OR: [
          {
            name: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            slug: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : undefined;
  const totalOrganizations = await prisma.organization.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalOrganizations / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const organizations = await prisma.organization.findMany({
    where,
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      slug: true,
      platformStatus: true,
      platformBlockedReason: true,
      ownerSubscription: {
        select: {
          planCode: true,
          status: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
          complimentaryPlanCode: true,
          complimentaryMonths: true,
          complimentaryStartsAt: true,
          complimentaryEndsAt: true,
        },
      },
      members: {
        where: {
          role: {
            contains: "owner",
          },
        },
        take: 1,
        select: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const fromItem = totalOrganizations === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const toItem = totalOrganizations === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalOrganizations);

  const baseParams = new URLSearchParams();
  if (query) {
    baseParams.set("q", query);
  }
  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams(baseParams);
    if (targetPage > 1) {
      params.set("page", String(targetPage));
    }

    const serialized = params.toString();
    if (!serialized) {
      return "/admin/empresas";
    }

    return `/admin/empresas?${serialized}`;
  };

  const returnToPath = buildPageHref(currentPage);
  const now = new Date();

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Empresas"
        title="Governanca global de tenants"
        description="Visualize empresas em um datatable paginado, com linhas compactas e acoes colapsaveis para operacao rapida."
      />

      <Card className="border-border/70 bg-card/85">
        <CardContent className="p-4">
          <form className="flex flex-col gap-2 sm:flex-row" method="get">
            <Input
              name="q"
              placeholder="Buscar por nome ou slug"
              defaultValue={query}
            />
            <Button type="submit" className="sm:w-auto">
              Buscar
            </Button>
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
              <TableHead>Empresa</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status plataforma</TableHead>
              <TableHead className="text-right">Operacoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma empresa encontrada com os filtros informados.
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((organization) => {
                const owner = organization.members[0]?.user;
                const isBlocked = organization.platformStatus === "BLOCKED";
                const subscription = organization.ownerSubscription;
                const isComplimentaryActive = Boolean(
                  subscription &&
                    subscription.status === "ACTIVE" &&
                    subscription.cancelAtPeriodEnd &&
                    subscription.complimentaryPlanCode &&
                    subscription.complimentaryMonths &&
                    subscription.complimentaryStartsAt &&
                    subscription.complimentaryEndsAt &&
                    subscription.currentPeriodEnd &&
                    subscription.currentPeriodEnd.getTime() ===
                      subscription.complimentaryEndsAt.getTime() &&
                    subscription.complimentaryEndsAt > now &&
                    subscription.planCode === subscription.complimentaryPlanCode,
                );

                return (
                  <TableRow key={organization.id} className="align-top">
                    <TableCell className="min-w-[220px] py-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-muted/60 p-1.5 text-muted-foreground">
                          <Building2 className="size-3.5" />
                        </span>
                        <Link
                          href={`/admin/empresas/${organization.id}`}
                          className="text-sm font-medium transition-colors hover:text-primary"
                        >
                          {organization.name}
                        </Link>
                      </div>
                      <p className="mt-1 pl-8 text-xs text-muted-foreground">
                        {organization.slug}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[230px] py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <UserRound className="size-3.5 text-muted-foreground" />
                        <span>{owner?.name || "Sem owner"}</span>
                      </div>
                      <p className="mt-1 pl-[1.35rem] text-xs text-muted-foreground">
                        {owner?.email || "Nao informado"}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[170px] py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {subscription?.planCode || "FREE"}
                        </p>
                        {isComplimentaryActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <Gift className="size-3" />
                            Cortesia
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {subscription?.status || "FREE"}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[190px] py-2">
                      <StatusBadge status={organization.platformStatus} />
                      {organization.platformBlockedReason ? (
                        <p
                          className="mt-1 flex max-w-[26ch] items-center gap-1 text-xs text-muted-foreground"
                          title={organization.platformBlockedReason}
                        >
                          <Lock className="size-3 shrink-0" />
                          <span className="truncate">
                            {organization.platformBlockedReason}
                          </span>
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="py-2">
                      <Collapsible className="ml-auto w-fit">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/empresas/${organization.id}`}
                            aria-label={`Abrir detalhes de ${organization.name}`}
                            title="Abrir detalhes"
                            className={cn(
                              buttonVariants({ variant: "outline", size: "icon" }),
                              "h-8 w-8",
                            )}
                          >
                            <ExternalLink className="size-4" />
                          </Link>
                          <form method="post" action="/api/starter/impersonate">
                            <input
                              type="hidden"
                              name="organizationId"
                              value={organization.id}
                            />
                            <input type="hidden" name="returnTo" value={returnToPath} />
                            <button
                              type="submit"
                              aria-label={`Ir para empresa ${organization.name}`}
                              title="Ir para empresa"
                              className={cn(
                                buttonVariants({ variant: "outline", size: "icon" }),
                                "h-8 w-8",
                              )}
                            >
                              <LogIn className="size-4" />
                            </button>
                          </form>
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Gerenciar bloqueio de ${organization.name}`}
                              title="Mais operacoes"
                              className={cn(
                                buttonVariants({ variant: "ghost", size: "icon" }),
                                "h-8 w-8",
                              )}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent className="mt-2 w-[240px] space-y-2 rounded-md border border-border/70 bg-background/95 p-2 shadow-sm">
                          {isComplimentaryActive ? (
                            <p className="rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700">
                              Cortesia de {subscription?.complimentaryMonths} mes(es) ate{" "}
                              {subscription?.complimentaryEndsAt?.toLocaleString("pt-BR")}
                            </p>
                          ) : null}
                          {isBlocked ? (
                            <form
                              action={setOrganizationPlatformStatusAction}
                              className="space-y-2"
                            >
                              <input
                                type="hidden"
                                name="organizationId"
                                value={organization.id}
                              />
                              <input type="hidden" name="status" value="ACTIVE" />
                              <input
                                type="hidden"
                                name="returnTo"
                                value={returnToPath}
                              />
                              <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                                className="w-full gap-1"
                              >
                                <Unlock className="size-3.5" />
                                Desbloquear
                              </Button>
                            </form>
                          ) : (
                            <form
                              action={setOrganizationPlatformStatusAction}
                              className="space-y-2"
                            >
                              <input
                                type="hidden"
                                name="organizationId"
                                value={organization.id}
                              />
                              <input type="hidden" name="status" value="BLOCKED" />
                              <input
                                type="hidden"
                                name="returnTo"
                                value={returnToPath}
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
                                className="w-full gap-1"
                              >
                                <Lock className="size-3.5" />
                                Bloquear
                              </Button>
                            </form>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-border/70 bg-card/85">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {fromItem} - {toItem} de {totalOrganizations} empresa(s). Pagina{" "}
            {currentPage} de {totalPages}.
          </p>
          <div className="flex items-center gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildPageHref(currentPage - 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Anterior
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
            )}
            {hasNextPage ? (
              <Link
                href={buildPageHref(currentPage + 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Proxima
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Proxima
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
