import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const PAGE_SIZE = 30;

function parseDateParam(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parsePageParam(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export const dynamic = "force-dynamic";

export default async function LogsAdminPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const source = getSingleSearchParam(resolvedSearchParams.source).trim();
  const action = getSingleSearchParam(resolvedSearchParams.action).trim();
  const organizationId = getSingleSearchParam(resolvedSearchParams.organizationId).trim();
  const from = getSingleSearchParam(resolvedSearchParams.from).trim();
  const to = getSingleSearchParam(resolvedSearchParams.to).trim();
  const page = parsePageParam(getSingleSearchParam(resolvedSearchParams.page).trim());

  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to);
  const where = {
    source: source
      ? {
          contains: source,
          mode: "insensitive" as const,
        }
      : undefined,
    action: action
      ? {
          contains: action,
          mode: "insensitive" as const,
        }
      : undefined,
    organizationId: organizationId || undefined,
    createdAt:
      fromDate || toDate
        ? {
            gte: fromDate ?? undefined,
            lte: toDate ?? undefined,
          }
        : undefined,
  };

  const totalLogs = await prisma.platformEventLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const logs = await prisma.platformEventLog.findMany({
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
      source: true,
      action: true,
      severity: true,
      organizationId: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      actorUser: {
        select: {
          email: true,
        },
      },
      organization: {
        select: {
          name: true,
        },
      },
      actorAdmin: {
        select: {
          role: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  const groupedLogsMap = new Map<
    string,
    {
      dayLabel: string;
      count: number;
      sources: Map<string, (typeof logs)[number][]>;
    }
  >();

  for (const log of logs) {
    const dayLabel = log.createdAt.toLocaleDateString("pt-BR");
    const dayGroup = groupedLogsMap.get(dayLabel) ?? {
      dayLabel,
      count: 0,
      sources: new Map<string, (typeof logs)[number][]>(),
    };

    const sourceLogs = dayGroup.sources.get(log.source) ?? [];
    sourceLogs.push(log);

    dayGroup.sources.set(log.source, sourceLogs);
    dayGroup.count += 1;

    groupedLogsMap.set(dayLabel, dayGroup);
  }

  const groupedLogs = Array.from(groupedLogsMap.values()).map((group) => ({
    dayLabel: group.dayLabel,
    count: group.count,
    sourceGroups: Array.from(group.sources.entries()),
  }));

  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const fromItem = totalLogs === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const toItem = totalLogs === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalLogs);

  const baseParams = new URLSearchParams();
  if (source) {
    baseParams.set("source", source);
  }
  if (action) {
    baseParams.set("action", action);
  }
  if (organizationId) {
    baseParams.set("organizationId", organizationId);
  }
  if (from) {
    baseParams.set("from", from);
  }
  if (to) {
    baseParams.set("to", to);
  }

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams(baseParams);
    if (targetPage > 1) {
      params.set("page", String(targetPage));
    }

    const query = params.toString();
    if (!query) {
      return "/admin/logs";
    }

    return `/admin/logs?${query}`;
  };

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Logs"
        title="Auditoria de eventos da plataforma"
        description="Consulte trilhas de admin, auth e billing com filtros por fonte, acao, tenant e janela temporal."
      />

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Filtros de consulta</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="source">Fonte</Label>
              <Input
                id="source"
                name="source"
                placeholder="auth, billing, admin..."
                defaultValue={source}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="action">Acao</Label>
              <Input
                id="action"
                name="action"
                placeholder="webhook.processed"
                defaultValue={action}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="organizationId">Organization ID</Label>
              <Input
                id="organizationId"
                name="organizationId"
                placeholder="org_xxx"
                defaultValue={organizationId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">De</Label>
              <Input id="from" name="from" type="datetime-local" defaultValue={from} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">Ate</Label>
              <Input id="to" name="to" type="datetime-local" defaultValue={to} />
            </div>
            <div className="md:col-span-5">
              <Button type="submit">Filtrar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {groupedLogs.length === 0 ? (
        <Card className="border-border/70 bg-card/85">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum log encontrado com os filtros informados.
          </CardContent>
        </Card>
      ) : (
        groupedLogs.map((group, index) => (
          <Card key={group.dayLabel} className="border-border/70 bg-card/85">
            <Collapsible defaultOpen={index === 0}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">{group.dayLabel}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.count} evento(s) em {group.sourceGroups.length} fonte(s)
                    </p>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="group h-7 gap-1 px-2 text-xs">
                      Expandir
                      <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </CardHeader>

              <CollapsibleContent>
                <CardContent className="space-y-3 pt-0">
                  {group.sourceGroups.map(([sourceName, sourceLogs]) => (
                    <div
                      key={`${group.dayLabel}-${sourceName}`}
                      className="overflow-hidden rounded-lg border border-border/60"
                    >
                      <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
                        <StatusBadge status={sourceName.toUpperCase()} />
                        <p className="text-xs text-muted-foreground">
                          {sourceLogs.length} evento(s)
                        </p>
                      </div>

                      <Table>
                        <TableHeader className="bg-muted/20">
                          <TableRow>
                            <TableHead className="w-[95px]">Hora</TableHead>
                            <TableHead>Evento</TableHead>
                            <TableHead>Sev.</TableHead>
                            <TableHead>Ator</TableHead>
                            <TableHead>Organizacao</TableHead>
                            <TableHead className="w-[96px] text-right">Detalhes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sourceLogs.map((log) => (
                            <TableRow key={log.id} className="align-top">
                              <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                                {log.createdAt.toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="min-w-[220px] px-3 py-2">
                                <p className="text-sm font-medium">{log.action}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {log.targetType} - {log.targetId}
                                </p>
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <StatusBadge status={log.severity.toUpperCase()} />
                              </TableCell>
                              <TableCell className="min-w-[200px] px-3 py-2">
                                <p className="text-sm">
                                  {log.actorAdmin?.user.email || log.actorUser?.email || "sistema"}
                                </p>
                                {log.actorAdmin ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    admin {log.actorAdmin.role}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="min-w-[180px] px-3 py-2">
                                <p className="text-sm">{log.organization?.name || "-"}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {log.organizationId || "-"}
                                </p>
                              </TableCell>
                              <TableCell className="px-3 py-2 align-top text-right">
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                      JSON
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="pt-2 text-left">
                                    <pre className="max-h-40 overflow-auto rounded-md bg-muted/55 p-2 text-xs">
                                      {JSON.stringify(log.metadata ?? {}, null, 2)}
                                    </pre>
                                  </CollapsibleContent>
                                </Collapsible>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))
      )}

      <Card className="border-border/70 bg-card/85">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {fromItem} - {toItem} de {totalLogs} evento(s). Pagina {currentPage} de{" "}
            {totalPages}.
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
