import {
  CheckoutStatus,
  SubscriptionStatus,
  WebhookProcessingStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  ShieldCheck,
  Users2,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [organizationCount, blockedOrganizationCount, userCount, blockedUserCount, activeAdmins, activeSubscriptions, failedWebhooks] =
    await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({
        where: {
          platformStatus: "BLOCKED",
        },
      }),
      prisma.user.count(),
      prisma.user.count({
        where: {
          platformStatus: "BLOCKED",
        },
      }),
      prisma.platformAdmin.count({
        where: {
          status: "ACTIVE",
        },
      }),
      prisma.ownerSubscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
        },
      }),
      prisma.billingWebhookEvent.count({
        where: {
          status: {
            in: [WebhookProcessingStatus.FAILED, WebhookProcessingStatus.IGNORED],
          },
          provider: "abacatepay",
        },
      }),
    ]);

  const cards: {
    label: string;
    value: number;
    hint: string;
    icon: LucideIcon;
  }[] = [
    {
      label: "Empresas",
      value: organizationCount,
      hint: `Bloqueadas: ${blockedOrganizationCount}`,
      icon: Building2,
    },
    {
      label: "Usuarios",
      value: userCount,
      hint: `Bloqueados: ${blockedUserCount}`,
      icon: Users2,
    },
    { label: "Admins ativos", value: activeAdmins, hint: "RBAC global", icon: ShieldCheck },
    {
      label: "Planos ativos",
      value: activeSubscriptions,
      hint: "Status ACTIVE",
      icon: CreditCard,
    },
    {
      label: "Webhooks falhos/ignorados",
      value: failedWebhooks,
      hint: CheckoutStatus.FAILED,
      icon: Webhook,
    },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Visao central"
        title="Estado operacional da plataforma"
        description="Acompanhe tenants, usuarios, planos e saude dos webhooks em um unico ponto de controle."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="border-border/70 bg-card/80 backdrop-blur">
            <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
              <CardDescription className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {card.label}
              </CardDescription>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-3xl font-semibold tracking-tight">{card.value}</CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/85">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-500" />
            Atenção operacional
          </CardTitle>
          <CardDescription>
            Webhooks em estado {WebhookProcessingStatus.FAILED} ou{" "}
            {WebhookProcessingStatus.IGNORED} demandam reprocessamento no modulo de planos.
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}
