import { notFound } from "next/navigation";
import { BillingPlanCode } from "@prisma/client";

import {
  downgradeOrganizationPlanAction,
  grantOrganizationComplimentaryPlanAction,
  removeOrganizationPlanAction,
  setOrganizationPlanAction,
  setOrganizationPlatformStatusAction,
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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  PAID_PLAN_SEQUENCE,
  PLAN_SEQUENCE,
  getPlanLabel,
  getPreviousPlanCode,
} from "@/lib/billing/plans";
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

function formatDateTime(value: Date | null | undefined): string {
  if (!value) {
    return "-";
  }

  return value.toLocaleString("pt-BR");
}

export const dynamic = "force-dynamic";

export default async function EmpresaDetailPage({
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

  const organization = await prisma.organization.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
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
          owner: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          members: true,
          invitations: true,
          products: true,
        },
      },
    },
  });

  if (!organization) {
    notFound();
  }

  const recentEvents = await prisma.platformEventLog.findMany({
    where: {
      organizationId: organization.id,
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
      actorAdmin: {
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

  const isBlocked = organization.platformStatus === "BLOCKED";
  const subscription = organization.ownerSubscription;
  const now = new Date();
  const hasComplimentaryConfig = Boolean(
    subscription?.complimentaryPlanCode &&
      subscription.complimentaryMonths &&
      subscription.complimentaryStartsAt &&
      subscription.complimentaryEndsAt,
  );
  const isComplimentaryActive = Boolean(
    hasComplimentaryConfig &&
      subscription &&
      subscription.status === "ACTIVE" &&
      subscription.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd &&
      subscription.complimentaryEndsAt &&
      subscription.currentPeriodEnd.getTime() === subscription.complimentaryEndsAt.getTime() &&
      subscription.complimentaryEndsAt > now &&
      subscription.planCode === subscription.complimentaryPlanCode,
  );
  const canManagePlan = Boolean(subscription);
  const currentPlanCode = subscription?.planCode ?? BillingPlanCode.FREE;
  const downgradeTarget = subscription ? getPreviousPlanCode(subscription.planCode) : null;

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Empresa"
        title={organization.name}
        description={`Slug: ${organization.slug}`}
        actions={
          <form method="post" action="/api/starter/impersonate">
            <input type="hidden" name="organizationId" value={organization.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`/admin/empresas/${organization.id}`}
            />
            <Button type="submit" variant="outline">
              Ir para empresa
            </Button>
          </form>
        }
      />

      <FeedbackBanners
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Membros
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {organization._count.members}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Convites
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {organization._count.invitations}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Produtos
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {organization._count.products}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              Plano
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              {getPlanLabel(currentPlanCode)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              codigo: {currentPlanCode} - status {subscription?.status || "FREE"}
            </p>
            {isComplimentaryActive ? (
              <p className="mt-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700">
                Cortesia ativa: {subscription?.complimentaryPlanCode} por{" "}
                {subscription?.complimentaryMonths} mes(es), ate{" "}
                {formatDateTime(subscription?.complimentaryEndsAt)}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Governanca de plataforma</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">
              Status atual: <StatusBadge status={organization.platformStatus} />
            </span>
            {organization.platformBlockedReason ? (
              <span className="block">
                Motivo atual: {organization.platformBlockedReason}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isBlocked ? (
            <form action={setOrganizationPlatformStatusAction}>
              <input type="hidden" name="organizationId" value={organization.id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/empresas/${organization.id}`}
              />
              <Button type="submit" variant="secondary">
                Desbloquear empresa
              </Button>
            </form>
          ) : (
            <form action={setOrganizationPlatformStatusAction} className="space-y-2">
              <input type="hidden" name="organizationId" value={organization.id} />
              <input type="hidden" name="status" value="BLOCKED" />
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/empresas/${organization.id}`}
              />
              <Input
                name="reason"
                placeholder="Motivo do bloqueio"
                required
              />
              <Button type="submit" variant="destructive">
                Bloquear empresa
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Gestao direta de plano</CardTitle>
          <CardDescription>
            Altere o plano do tenant em um clique, aplique downgrade em cascata ou remova para FREE.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={setOrganizationPlanAction} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`/admin/empresas/${organization.id}`}
            />

            <div className="space-y-1.5">
              <Label htmlFor="manualPlanCode">Plano</Label>
              <NativeSelect
                id="manualPlanCode"
                name="planCode"
                defaultValue={currentPlanCode}
                className="h-9"
                required
                disabled={!canManagePlan}
              >
                {PLAN_SEQUENCE.map((planCode) => (
                  <option key={planCode} value={planCode}>
                    {getPlanLabel(planCode)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="manualReason">Motivo (opcional)</Label>
              <Input
                id="manualReason"
                type="text"
                name="reason"
                maxLength={240}
                placeholder="Ex.: ajuste comercial, migracao de carteira..."
                disabled={!canManagePlan}
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={!canManagePlan}>
                Aplicar plano
              </Button>
            </div>
          </form>

          <div className="grid gap-2 sm:grid-cols-2">
            <form action={downgradeOrganizationPlanAction} className="space-y-2">
              <input type="hidden" name="organizationId" value={organization.id} />
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/empresas/${organization.id}`}
              />
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                disabled={!canManagePlan || !downgradeTarget}
                title={
                  downgradeTarget
                    ? `Downgrade para ${getPlanLabel(downgradeTarget)}`
                    : "Sem downgrade disponivel"
                }
              >
                Fazer downgrade
              </Button>
              <p className="text-xs text-muted-foreground">
                {downgradeTarget
                  ? `Proximo nivel: ${getPlanLabel(downgradeTarget)}`
                  : "Este tenant ja esta no menor plano."}
              </p>
            </form>

            <form action={removeOrganizationPlanAction} className="space-y-2">
              <input type="hidden" name="organizationId" value={organization.id} />
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/empresas/${organization.id}`}
              />
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={!canManagePlan || currentPlanCode === BillingPlanCode.FREE}
              >
                Remover plano (voltar para FREE)
              </Button>
              <p className="text-xs text-muted-foreground">
                Limpa o plano pago atual, encerra cortesias e retorna status para FREE.
              </p>
            </form>
          </div>

          {!canManagePlan ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Nenhuma assinatura encontrada para este tenant. Nao foi possivel habilitar gestao de plano.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">
            Conceder plano gratis (cortesia)
          </CardTitle>
          <CardDescription>
            Ativa um plano pago sem cobranca por um periodo definido. Ao fim do
            periodo, o tenant volta automaticamente ao plano gratuito.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasComplimentaryConfig ? (
            <p className="rounded-md bg-muted/55 px-3 py-2 text-xs text-muted-foreground">
              Ultima cortesia: {subscription?.complimentaryPlanCode} por{" "}
              {subscription?.complimentaryMonths} mes(es), de{" "}
              {formatDateTime(subscription?.complimentaryStartsAt)} ate{" "}
              {formatDateTime(subscription?.complimentaryEndsAt)}.
            </p>
          ) : null}

          <form
            action={grantOrganizationComplimentaryPlanAction}
            className="grid gap-3 md:grid-cols-4"
          >
            <input type="hidden" name="organizationId" value={organization.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`/admin/empresas/${organization.id}`}
            />

            <div className="space-y-1.5">
              <Label htmlFor="planCode">Plano</Label>
              <NativeSelect
                id="planCode"
                name="planCode"
                defaultValue={BillingPlanCode.PRO_100}
                required
              >
                {PAID_PLAN_SEQUENCE.map((planCode) => (
                  <option key={planCode} value={planCode}>
                    {getPlanLabel(planCode)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="months">Meses</Label>
              <Input
                id="months"
                type="number"
                name="months"
                min={1}
                max={24}
                defaultValue={2}
                required
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Input
                id="reason"
                type="text"
                name="reason"
                maxLength={240}
                placeholder="Ex.: parceria comercial, onboarding estrategico..."
              />
            </div>

            <div className="md:col-span-4">
              <Button type="submit">Conceder plano gratis</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Eventos recentes da empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recentEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-border/70 bg-card p-3 text-xs">
                <p>
                  <strong>{event.source}</strong> - {event.action} ({event.severity})
                </p>
                <p className="mt-1 text-muted-foreground">
                  {event.createdAt.toLocaleString("pt-BR")}
                </p>
                <p className="text-muted-foreground">
                  ator: {event.actorAdmin?.user.email || "sistema"}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
