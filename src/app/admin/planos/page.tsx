import Link from "next/link";
import { BillingPlanCode, WebhookProcessingStatus } from "@prisma/client";

import {
  downgradeOrganizationPlanAction,
  removeOrganizationPlanAction,
  retryWebhookEventAction,
  setOrganizationPlanAction,
  syncOrganizationBillingAction,
} from "@/actions/admin-actions";
import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAN_SEQUENCE, getPlanLabel, getPreviousPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/prisma";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

const PLAN_RETURN_PATH = "/admin/planos";

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) {
    return "Sem ciclo";
  }

  return value.toLocaleString("pt-BR");
}

export const dynamic = "force-dynamic";

export default async function PlanosAdminPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();

  const [subscriptions, webhooks] = await Promise.all([
    prisma.ownerSubscription.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      take: 100,
      select: {
        id: true,
        organizationId: true,
        planCode: true,
        status: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        complimentaryPlanCode: true,
        complimentaryMonths: true,
        complimentaryStartsAt: true,
        complimentaryEndsAt: true,
        updatedAt: true,
        organization: {
          select: {
            name: true,
            slug: true,
            platformStatus: true,
          },
        },
        owner: {
          select: {
            email: true,
          },
        },
      },
    }),
    prisma.billingWebhookEvent.findMany({
      where: {
        provider: "abacatepay",
        status: {
          in: [WebhookProcessingStatus.FAILED, WebhookProcessingStatus.IGNORED],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
      select: {
        id: true,
        eventType: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
  ]);
  const now = new Date();

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Planos"
        title="Gestao de planos por organizacao"
        description="Aplique plano, execute downgrade, remova para FREE e mantenha billing/webhooks no mesmo fluxo operacional."
      />

      <FeedbackBanners
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <Card className="overflow-hidden border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Planos por empresa</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Plano atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gestao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => {
                const isComplimentaryActive = Boolean(
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
                const downgradeTarget = getPreviousPlanCode(subscription.planCode);
                const isFreePlan = subscription.planCode === BillingPlanCode.FREE;

                return (
                  <TableRow key={subscription.id}>
                    <TableCell className="min-w-[190px]">
                      <p className="font-medium">{subscription.organization.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {subscription.organization.slug}
                      </p>
                      <Link
                        href={`/admin/empresas/${subscription.organizationId}`}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        Abrir empresa
                      </Link>
                    </TableCell>
                    <TableCell>{subscription.owner.email}</TableCell>
                    <TableCell className="min-w-[150px]">
                      <p>{getPlanLabel(subscription.planCode)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        codigo: {subscription.planCode}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <StatusBadge status={subscription.status} />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime(subscription.currentPeriodEnd)}
                      </p>
                      {isComplimentaryActive ? (
                        <p className="mt-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700">
                          Cortesia ativa: {subscription.complimentaryMonths} mes(es), ate{" "}
                          {formatDateTime(subscription.complimentaryEndsAt)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-[340px]">
                      <div className="ml-auto flex max-w-[320px] flex-col gap-2">
                        <form action={setOrganizationPlanAction} className="flex items-center gap-2">
                          <input
                            type="hidden"
                            name="organizationId"
                            value={subscription.organizationId}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={PLAN_RETURN_PATH}
                          />
                          <NativeSelect
                            name="planCode"
                            defaultValue={subscription.planCode}
                            className="h-8 text-xs"
                            aria-label={`Selecionar plano para ${subscription.organization.slug}`}
                          >
                            {PLAN_SEQUENCE.map((planCode) => (
                              <option key={planCode} value={planCode}>
                                {getPlanLabel(planCode)}
                              </option>
                            ))}
                          </NativeSelect>
                          <Button type="submit" variant="outline" size="sm">
                            Aplicar
                          </Button>
                        </form>

                        <div className="grid grid-cols-2 gap-2">
                          <form action={downgradeOrganizationPlanAction}>
                            <input
                              type="hidden"
                              name="organizationId"
                              value={subscription.organizationId}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={PLAN_RETURN_PATH}
                            />
                            <Button
                              type="submit"
                              variant="secondary"
                              size="sm"
                              className="w-full"
                              disabled={!downgradeTarget}
                              title={
                                downgradeTarget
                                  ? `Downgrade para ${getPlanLabel(downgradeTarget)}`
                                  : "Sem downgrade disponivel"
                              }
                            >
                              Downgrade
                            </Button>
                          </form>

                          <form action={removeOrganizationPlanAction}>
                            <input
                              type="hidden"
                              name="organizationId"
                              value={subscription.organizationId}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={PLAN_RETURN_PATH}
                            />
                            <Button
                              type="submit"
                              variant="destructive"
                              size="sm"
                              className="w-full"
                              disabled={isFreePlan}
                            >
                              Remover plano
                            </Button>
                          </form>
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                          {downgradeTarget
                            ? `Proximo downgrade: ${getPlanLabel(downgradeTarget)}`
                            : "Tenant ja esta no menor plano"}
                        </p>

                        <form action={syncOrganizationBillingAction}>
                          <input
                            type="hidden"
                            name="organizationId"
                            value={subscription.organizationId}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={PLAN_RETURN_PATH}
                          />
                          <Button type="submit" variant="outline" size="sm" className="w-full">
                            Sincronizar faturas
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Webhooks com falha</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="min-w-[200px]">
                    <p className="font-medium">{event.eventType}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{event.id}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={event.status} />
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-muted-foreground">
                    {event.errorMessage || "-"}
                  </TableCell>
                  <TableCell>{event.createdAt.toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    <form action={retryWebhookEventAction} className="ml-auto">
                      <input type="hidden" name="eventId" value={event.id} />
                      <input
                        type="hidden"
                        name="returnTo"
                        value={PLAN_RETURN_PATH}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        Reprocessar
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
