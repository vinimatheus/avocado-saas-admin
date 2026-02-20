"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BillingPlanCode,
  CheckoutStatus,
  PlatformAdminRole,
  PlatformAdminStatus,
  PlatformEventSeverity,
  PlatformOrgStatus,
  PlatformUserStatus,
  SubscriptionStatus,
  WebhookProcessingStatus,
} from "@prisma/client";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/context";
import { auth } from "@/lib/auth/server";
import { getPlanLabel, getPreviousPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/prisma";
import { logPlatformEvent } from "@/lib/platform/events";

const TEMP_PASSWORD_MIN_LENGTH = 10;
const PLAN_MANAGEMENT_PATH = "/admin/planos";

function isNextRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { digest?: unknown; message?: unknown };

  if (typeof record.digest === "string" && record.digest.startsWith("NEXT_REDIRECT")) {
    return true;
  }

  return typeof record.message === "string" && record.message === "NEXT_REDIRECT";
}

function parseActionError(error: unknown, fallbackMessage: string): string {
  if (isNextRedirectError(error)) {
    throw error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallbackMessage;
}

function getFormValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function resolveSafePath(path: string, fallbackPath: string): string {
  const trimmed = path.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallbackPath;
  }

  return trimmed;
}

function addMonths(date: Date, months: number): Date {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getMasterBootstrapToken(): string {
  return process.env.ADMIN_BOOTSTRAP_TOKEN?.trim() || "";
}

function mustRequireMasterBootstrapToken(): boolean {
  return isProduction() || Boolean(getMasterBootstrapToken());
}

function tokenMatches(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected.trim(), "utf8");
  const providedBuffer = Buffer.from(provided.trim(), "utf8");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function redirectWithMessage(path: string, type: "success" | "error", message: string): never {
  const params = new URLSearchParams();
  params.set(type, message);
  const safePath = resolveSafePath(path, "/admin");
  const separator = safePath.includes("?") ? "&" : "?";
  redirect(`${safePath}${separator}${params.toString()}`);
}

const claimMasterSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo."),
  email: z.string().trim().email("Informe um e-mail valido."),
  password: z
    .string()
    .min(TEMP_PASSWORD_MIN_LENGTH, `Senha deve ter pelo menos ${TEMP_PASSWORD_MIN_LENGTH} caracteres.`),
  bootstrapToken: z.string().trim().optional(),
});

const createAdminSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do admin."),
  email: z.string().trim().email("Informe um e-mail valido."),
  temporaryPassword: z
    .string()
    .min(TEMP_PASSWORD_MIN_LENGTH, `Senha temporaria deve ter pelo menos ${TEMP_PASSWORD_MIN_LENGTH} caracteres.`),
  returnTo: z.string().trim().optional(),
});

const rotatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z
      .string()
      .min(TEMP_PASSWORD_MIN_LENGTH, `Nova senha deve ter pelo menos ${TEMP_PASSWORD_MIN_LENGTH} caracteres.`),
    confirmNewPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((value) => value.newPassword === value.confirmNewPassword, {
    message: "A confirmacao da senha nao confere.",
    path: ["confirmNewPassword"],
  });

const organizationStatusSchema = z.object({
  organizationId: z.string().trim().min(1, "Organizacao nao informada."),
  status: z.nativeEnum(PlatformOrgStatus),
  reason: z.string().trim().optional(),
  returnTo: z.string().trim().optional(),
});

const userStatusSchema = z.object({
  userId: z.string().trim().min(1, "Usuario nao informado."),
  status: z.nativeEnum(PlatformUserStatus),
  reason: z.string().trim().optional(),
  returnTo: z.string().trim().optional(),
});

const revokeSessionsSchema = z.object({
  userId: z.string().trim().min(1, "Usuario nao informado."),
  returnTo: z.string().trim().optional(),
});

const syncOrganizationBillingSchema = z.object({
  organizationId: z.string().trim().min(1, "Organizacao nao informada."),
  returnTo: z.string().trim().optional(),
});

const grantComplimentaryPlanSchema = z
  .object({
    organizationId: z.string().trim().min(1, "Organizacao nao informada."),
    planCode: z.nativeEnum(BillingPlanCode),
    months: z.coerce.number().int().min(1, "Informe pelo menos 1 mes.").max(24, "Maximo de 24 meses."),
    reason: z.string().trim().max(240).optional(),
    returnTo: z.string().trim().optional(),
  })
  .refine((value) => value.planCode !== BillingPlanCode.FREE, {
    message: "A cortesia precisa usar um plano pago.",
    path: ["planCode"],
  });

const setOrganizationPlanSchema = z.object({
  organizationId: z.string().trim().min(1, "Organizacao nao informada."),
  planCode: z.nativeEnum(BillingPlanCode),
  reason: z.string().trim().max(240).optional(),
  returnTo: z.string().trim().optional(),
});

const downgradeOrganizationPlanSchema = z.object({
  organizationId: z.string().trim().min(1, "Organizacao nao informada."),
  reason: z.string().trim().max(240).optional(),
  returnTo: z.string().trim().optional(),
});

const removeOrganizationPlanSchema = z.object({
  organizationId: z.string().trim().min(1, "Organizacao nao informada."),
  reason: z.string().trim().max(240).optional(),
  returnTo: z.string().trim().optional(),
});

const retryWebhookSchema = z.object({
  eventId: z.string().trim().min(1, "Evento nao informado."),
  returnTo: z.string().trim().optional(),
});

const adminStatusSchema = z.object({
  adminId: z.string().trim().min(1, "Administrador nao informado."),
  status: z.nativeEnum(PlatformAdminStatus),
  returnTo: z.string().trim().optional(),
});

function inferCheckoutOutcome(eventName: string): CheckoutStatus | null {
  if (eventName === "billing.paid") {
    return CheckoutStatus.PAID;
  }

  if (eventName === "billing.failed") {
    return CheckoutStatus.FAILED;
  }

  if (eventName === "billing.expired" || eventName === "subscription.expired") {
    return CheckoutStatus.EXPIRED;
  }

  if (eventName === "billing.chargeback" || eventName === "billing.refunded") {
    return CheckoutStatus.CHARGEBACK;
  }

  return null;
}

function extractWebhookData(payload: unknown): {
  eventId: string;
  eventName: string;
  billingId: string | null;
  externalId: string | null;
} {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Payload invalido para reprocessamento.");
  }

  const record = payload as {
    id?: unknown;
    event?: unknown;
    data?: {
      billing?: {
        id?: unknown;
        products?: Array<{ externalId?: unknown }>;
      };
      transaction?: {
        externalId?: unknown;
      };
    };
  };

  const eventId = typeof record.id === "string" ? record.id.trim() : "";
  const eventName = typeof record.event === "string" ? record.event.trim() : "";
  const billingId = typeof record.data?.billing?.id === "string" ? record.data.billing.id.trim() : "";
  const externalIdFromTransaction =
    typeof record.data?.transaction?.externalId === "string"
      ? record.data.transaction.externalId.trim()
      : "";
  const externalIdFromProducts =
    record.data?.billing?.products
      ?.map((item) => (typeof item.externalId === "string" ? item.externalId.trim() : ""))
      .find(Boolean) || "";

  if (!eventId || !eventName) {
    throw new Error("Payload sem identificador de evento.");
  }

  return {
    eventId,
    eventName,
    billingId: billingId || null,
    externalId: externalIdFromTransaction || externalIdFromProducts || null,
  };
}

async function applyOrganizationPlanChange(params: {
  organizationId: string;
  targetPlanCode: BillingPlanCode;
  action: string;
  reason?: string;
  actorUserId: string;
  actorAdminId: string;
}) {
  const now = new Date();
  const currentSubscription = await prisma.ownerSubscription.findUnique({
    where: {
      organizationId: params.organizationId,
    },
    select: {
      id: true,
      planCode: true,
      status: true,
      currentPeriodEnd: true,
    },
  });

  if (!currentSubscription) {
    throw new Error("Assinatura da empresa nao encontrada.");
  }

  const movingToFree = params.targetPlanCode === BillingPlanCode.FREE;

  await prisma.ownerSubscription.update({
    where: {
      id: currentSubscription.id,
    },
    data: {
      planCode: params.targetPlanCode,
      pendingPlanCode: null,
      status: movingToFree ? SubscriptionStatus.FREE : SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      canceledAt: movingToFree ? now : null,
      currentPeriodStart: movingToFree ? null : now,
      currentPeriodEnd: movingToFree ? null : currentSubscription.currentPeriodEnd,
      trialPlanCode: null,
      trialStartedAt: null,
      trialEndsAt: null,
      complimentaryPlanCode: null,
      complimentaryMonths: null,
      complimentaryStartsAt: null,
      complimentaryEndsAt: null,
    },
  });

  await logPlatformEvent({
    source: "billing",
    action: params.action,
    severity: PlatformEventSeverity.INFO,
    actorUserId: params.actorUserId,
    actorAdminId: params.actorAdminId,
    organizationId: params.organizationId,
    targetType: "owner_subscription",
    targetId: currentSubscription.id,
    metadata: {
      previousPlanCode: currentSubscription.planCode,
      previousStatus: currentSubscription.status,
      currentPlanCode: params.targetPlanCode,
      currentStatus: movingToFree ? SubscriptionStatus.FREE : SubscriptionStatus.ACTIVE,
      reason: params.reason || null,
      changedManually: true,
    },
  });

  revalidatePath(PLAN_MANAGEMENT_PATH);
  revalidatePath("/admin/pagamentos");
  revalidatePath("/admin/empresas");
  revalidatePath(`/admin/empresas/${params.organizationId}`);

  return {
    previousPlanCode: currentSubscription.planCode,
    currentPlanCode: params.targetPlanCode,
  };
}

export async function signOutAction() {
  await auth.api.signOut({
    headers: await headers(),
  });

  redirect("/sign-in");
}

export async function claimMasterAdminAction(formData: FormData) {
  const parsed = claimMasterSchema.safeParse({
    name: getFormValue(formData, "name"),
    email: getFormValue(formData, "email"),
    password: getFormValue(formData, "password"),
    bootstrapToken: getFormValue(formData, "bootstrapToken"),
  });

  if (!parsed.success) {
    return redirectWithMessage(
      "/setup/claim-master",
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para criar o MASTER.",
    );
  }

  const email = parsed.data.email.toLowerCase();
  const bootstrapToken = parsed.data.bootstrapToken ?? "";

  try {
    if (mustRequireMasterBootstrapToken()) {
      const configuredBootstrapToken = getMasterBootstrapToken();

      if (!configuredBootstrapToken) {
        return redirectWithMessage(
          "/setup/claim-master",
          "error",
          "Setup bloqueado: configure ADMIN_BOOTSTRAP_TOKEN no ambiente antes de criar o MASTER.",
        );
      }

      if (!bootstrapToken) {
        return redirectWithMessage(
          "/setup/claim-master",
          "error",
          "Informe o token de bootstrap para concluir o setup inicial.",
        );
      }

      if (!tokenMatches(configuredBootstrapToken, bootstrapToken)) {
        return redirectWithMessage("/setup/claim-master", "error", "Token de bootstrap invalido.");
      }
    }

    const currentAdmins = await prisma.platformAdmin.count();
    if (currentAdmins > 0) {
      return redirectWithMessage(
        "/sign-in",
        "error",
        "O setup inicial ja foi concluido. Entre com um admin existente.",
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return redirectWithMessage(
        "/setup/claim-master",
        "error",
        "Esse e-mail ja existe no sistema. Use outro e-mail para o primeiro MASTER.",
      );
    }

    await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email,
        password: parsed.data.password,
      },
    });

    const createdUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (!createdUser) {
      throw new Error("Usuario nao foi criado para o MASTER.");
    }

    await prisma.$transaction(async (tx) => {
      const count = await tx.platformAdmin.count();
      if (count > 0) {
        throw new Error("Outro administrador concluiu o setup primeiro.");
      }

      await tx.platformAdmin.create({
        data: {
          userId: createdUser.id,
          role: PlatformAdminRole.MASTER,
          status: PlatformAdminStatus.ACTIVE,
          mustChangePassword: false,
        },
      });
    });

    await logPlatformEvent({
      source: "admin",
      action: "admin.master_claimed",
      severity: PlatformEventSeverity.INFO,
      actorUserId: createdUser.id,
      targetType: "platform_admin",
      targetId: createdUser.id,
      metadata: {
        email,
      },
    });

    redirect(`/sign-in?email=${encodeURIComponent(email)}&success=MASTER%20criado%20com%20sucesso.`);
  } catch (error) {
    return redirectWithMessage(
      "/setup/claim-master",
      "error",
      parseActionError(error, "Falha ao criar o primeiro MASTER."),
    );
  }
}

export async function createAdminByMasterAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    requireMaster: true,
    nextPath: "/admin/admins",
  });

  const parsed = createAdminSchema.safeParse({
    name: getFormValue(formData, "name"),
    email: getFormValue(formData, "email"),
    temporaryPassword: getFormValue(formData, "temporaryPassword"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", "/admin/admins");

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para criar administrador.",
    );
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return redirectWithMessage(
        returnTo,
        "error",
        "No MVP, o e-mail do novo admin precisa ser inedito (sem conta previa).",
      );
    }

    await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email,
        password: parsed.data.temporaryPassword,
      },
    });

    const createdUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (!createdUser) {
      throw new Error("Nao foi possivel localizar o usuario criado.");
    }

    await prisma.platformAdmin.create({
      data: {
        userId: createdUser.id,
        role: PlatformAdminRole.ADMIN,
        status: PlatformAdminStatus.ACTIVE,
        mustChangePassword: true,
        createdByAdminId: platformAdmin.id,
      },
    });

    await logPlatformEvent({
      source: "admin",
      action: "admin.created",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      targetType: "platform_admin",
      targetId: createdUser.id,
      metadata: {
        role: "ADMIN",
        email,
      },
    });

    revalidatePath("/admin/admins");
    return redirectWithMessage(returnTo, "success", "Administrador criado com senha temporaria.");
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao criar novo admin."),
    );
  }
}

export async function rotateAdminPasswordFirstLoginAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: "/change-password",
    allowMustChangePassword: true,
  });

  const parsed = rotatePasswordSchema.safeParse({
    currentPassword: getFormValue(formData, "currentPassword"),
    newPassword: getFormValue(formData, "newPassword"),
    confirmNewPassword: getFormValue(formData, "confirmNewPassword"),
  });

  if (!parsed.success) {
    return redirectWithMessage(
      "/change-password",
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para alterar senha.",
    );
  }

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
    });

    await prisma.platformAdmin.update({
      where: {
        id: platformAdmin.id,
      },
      data: {
        mustChangePassword: false,
      },
    });

    await logPlatformEvent({
      source: "admin",
      action: "admin.password_rotated",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      targetType: "platform_admin",
      targetId: platformAdmin.id,
      metadata: {
        mustChangePassword: false,
      },
    });

    redirect("/admin?success=Senha%20alterada%20com%20sucesso.");
  } catch (error) {
    return redirectWithMessage(
      "/change-password",
      "error",
      parseActionError(error, "Falha ao alterar senha."),
    );
  }
}

export async function setOrganizationPlatformStatusAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: "/admin/empresas",
  });

  const parsed = organizationStatusSchema.safeParse({
    organizationId: getFormValue(formData, "organizationId"),
    status: getFormValue(formData, "status"),
    reason: getFormValue(formData, "reason"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(
    parsed.success ? parsed.data.returnTo || "" : "",
    "/admin/empresas",
  );

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar organizacao.",
    );
  }

  if (parsed.data.status === PlatformOrgStatus.BLOCKED && (parsed.data.reason ?? "").length < 3) {
    return redirectWithMessage(
      returnTo,
      "error",
      "Informe um motivo com pelo menos 3 caracteres para bloquear.",
    );
  }

  try {
    const blocked = parsed.data.status === PlatformOrgStatus.BLOCKED;

    const organization = await prisma.organization.update({
      where: {
        id: parsed.data.organizationId,
      },
      data: {
        platformStatus: parsed.data.status,
        platformBlockedAt: blocked ? new Date() : null,
        platformBlockedReason: blocked ? parsed.data.reason ?? "" : null,
        platformBlockedByAdminId: blocked ? platformAdmin.id : null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    await logPlatformEvent({
      source: "admin",
      action: blocked ? "organization.blocked" : "organization.unblocked",
      severity: blocked ? PlatformEventSeverity.WARN : PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      organizationId: organization.id,
      targetType: "organization",
      targetId: organization.id,
      metadata: {
        name: organization.name,
        reason: blocked ? parsed.data.reason ?? "" : null,
      },
    });

    revalidatePath("/admin/empresas");
    return redirectWithMessage(
      returnTo,
      "success",
      blocked ? "Empresa bloqueada com sucesso." : "Empresa desbloqueada com sucesso.",
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao atualizar status da empresa."),
    );
  }
}

export async function setUserPlatformStatusAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: "/admin/usuarios",
  });

  const parsed = userStatusSchema.safeParse({
    userId: getFormValue(formData, "userId"),
    status: getFormValue(formData, "status"),
    reason: getFormValue(formData, "reason"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", "/admin/usuarios");

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar usuario.",
    );
  }

  if (parsed.data.userId === session.user.id && parsed.data.status === PlatformUserStatus.BLOCKED) {
    return redirectWithMessage(returnTo, "error", "Voce nao pode bloquear seu proprio usuario.");
  }

  if (parsed.data.status === PlatformUserStatus.BLOCKED && (parsed.data.reason ?? "").length < 3) {
    return redirectWithMessage(
      returnTo,
      "error",
      "Informe um motivo com pelo menos 3 caracteres para bloquear.",
    );
  }

  try {
    const blocked = parsed.data.status === PlatformUserStatus.BLOCKED;

    const user = await prisma.user.update({
      where: {
        id: parsed.data.userId,
      },
      data: {
        platformStatus: parsed.data.status,
        platformBlockedAt: blocked ? new Date() : null,
        platformBlockedReason: blocked ? parsed.data.reason ?? "" : null,
        platformBlockedByAdminId: blocked ? platformAdmin.id : null,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (blocked) {
      await prisma.session.deleteMany({
        where: {
          userId: user.id,
        },
      });
    }

    await logPlatformEvent({
      source: "admin",
      action: blocked ? "user.blocked" : "user.unblocked",
      severity: blocked ? PlatformEventSeverity.WARN : PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      targetType: "user",
      targetId: user.id,
      metadata: {
        email: user.email,
        reason: blocked ? parsed.data.reason ?? "" : null,
      },
    });

    revalidatePath("/admin/usuarios");
    return redirectWithMessage(
      returnTo,
      "success",
      blocked ? "Usuario bloqueado com sucesso." : "Usuario desbloqueado com sucesso.",
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao atualizar status do usuario."),
    );
  }
}

export async function revokeUserSessionsAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: "/admin/usuarios",
  });

  const parsed = revokeSessionsSchema.safeParse({
    userId: getFormValue(formData, "userId"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", "/admin/usuarios");

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para revogar sessoes.",
    );
  }

  try {
    const result = await prisma.session.deleteMany({
      where: {
        userId: parsed.data.userId,
      },
    });

    await logPlatformEvent({
      source: "admin",
      action: "user.sessions_revoked",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      targetType: "user",
      targetId: parsed.data.userId,
      metadata: {
        sessionsRevoked: result.count,
      },
    });

    return redirectWithMessage(
      returnTo,
      "success",
      `Sessoes revogadas com sucesso (${result.count}).`,
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao revogar sessoes do usuario."),
    );
  }
}

export async function setOrganizationPlanAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: PLAN_MANAGEMENT_PATH,
  });

  const parsed = setOrganizationPlanSchema.safeParse({
    organizationId: getFormValue(formData, "organizationId"),
    planCode: getFormValue(formData, "planCode"),
    reason: getFormValue(formData, "reason"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", PLAN_MANAGEMENT_PATH);

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar plano.",
    );
  }

  try {
    const result = await applyOrganizationPlanChange({
      organizationId: parsed.data.organizationId,
      targetPlanCode: parsed.data.planCode,
      action: "subscription.plan_changed_by_admin",
      reason: parsed.data.reason,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
    });

    return redirectWithMessage(
      returnTo,
      "success",
      `Plano atualizado: ${getPlanLabel(result.previousPlanCode)} -> ${getPlanLabel(result.currentPlanCode)}.`,
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao atualizar plano da empresa."),
    );
  }
}

export async function downgradeOrganizationPlanAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: PLAN_MANAGEMENT_PATH,
  });

  const parsed = downgradeOrganizationPlanSchema.safeParse({
    organizationId: getFormValue(formData, "organizationId"),
    reason: getFormValue(formData, "reason"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", PLAN_MANAGEMENT_PATH);

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para downgrade.",
    );
  }

  try {
    const currentSubscription = await prisma.ownerSubscription.findUnique({
      where: {
        organizationId: parsed.data.organizationId,
      },
      select: {
        planCode: true,
      },
    });

    if (!currentSubscription) {
      return redirectWithMessage(returnTo, "error", "Assinatura da empresa nao encontrada.");
    }

    const nextPlanCode = getPreviousPlanCode(currentSubscription.planCode);

    if (!nextPlanCode) {
      return redirectWithMessage(
        returnTo,
        "error",
        "Esse tenant ja esta no menor plano disponivel.",
      );
    }

    const result = await applyOrganizationPlanChange({
      organizationId: parsed.data.organizationId,
      targetPlanCode: nextPlanCode,
      action: "subscription.plan_downgraded_by_admin",
      reason: parsed.data.reason,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
    });

    return redirectWithMessage(
      returnTo,
      "success",
      `Downgrade aplicado: ${getPlanLabel(result.previousPlanCode)} -> ${getPlanLabel(result.currentPlanCode)}.`,
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao aplicar downgrade da empresa."),
    );
  }
}

export async function removeOrganizationPlanAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: PLAN_MANAGEMENT_PATH,
  });

  const parsed = removeOrganizationPlanSchema.safeParse({
    organizationId: getFormValue(formData, "organizationId"),
    reason: getFormValue(formData, "reason"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", PLAN_MANAGEMENT_PATH);

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para remover plano.",
    );
  }

  try {
    const result = await applyOrganizationPlanChange({
      organizationId: parsed.data.organizationId,
      targetPlanCode: BillingPlanCode.FREE,
      action: "subscription.plan_removed_by_admin",
      reason: parsed.data.reason,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
    });

    if (result.previousPlanCode === BillingPlanCode.FREE) {
      return redirectWithMessage(returnTo, "success", "A empresa ja estava no plano FREE.");
    }

    return redirectWithMessage(
      returnTo,
      "success",
      `Plano removido: ${getPlanLabel(result.previousPlanCode)} -> ${getPlanLabel(BillingPlanCode.FREE)}.`,
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao remover plano da empresa."),
    );
  }
}

export async function syncOrganizationBillingAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: PLAN_MANAGEMENT_PATH,
  });

  const parsed = syncOrganizationBillingSchema.safeParse({
    organizationId: getFormValue(formData, "organizationId"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(
    parsed.success ? parsed.data.returnTo || "" : "",
    PLAN_MANAGEMENT_PATH,
  );

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para sincronizacao.",
    );
  }

  try {
    const checkouts = await prisma.billingCheckoutSession.findMany({
      where: {
        organizationId: parsed.data.organizationId,
      },
      select: {
        id: true,
        ownerUserId: true,
        subscriptionId: true,
        amountCents: true,
        currency: true,
        status: true,
        paidAt: true,
        abacateBillingId: true,
        abacateBillingUrl: true,
      },
    });

    let syncedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const checkout of checkouts) {
        const providerBillingId = checkout.abacateBillingId ?? `sync_${checkout.id}`;

        await tx.billingInvoice.upsert({
          where: {
            providerBillingId,
          },
          create: {
            ownerUserId: checkout.ownerUserId,
            subscriptionId: checkout.subscriptionId,
            checkoutSessionId: checkout.id,
            provider: "abacatepay",
            providerBillingId,
            status: checkout.status,
            amountCents: checkout.amountCents,
            currency: checkout.currency,
            billingUrl: checkout.abacateBillingUrl,
            paidAt: checkout.status === CheckoutStatus.PAID ? checkout.paidAt : null,
          },
          update: {
            checkoutSessionId: checkout.id,
            status: checkout.status,
            amountCents: checkout.amountCents,
            currency: checkout.currency,
            billingUrl: checkout.abacateBillingUrl,
            paidAt: checkout.status === CheckoutStatus.PAID ? checkout.paidAt : null,
          },
        });

        syncedCount += 1;
      }
    });

    await logPlatformEvent({
      source: "billing",
      action: "billing.sync_invoices",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      organizationId: parsed.data.organizationId,
      targetType: "organization",
      targetId: parsed.data.organizationId,
      metadata: {
        syncedCheckouts: syncedCount,
      },
    });

    revalidatePath(PLAN_MANAGEMENT_PATH);
    revalidatePath("/admin/pagamentos");
    return redirectWithMessage(
      returnTo,
      "success",
      `Sincronizacao concluida (${syncedCount} checkout(s)).`,
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao sincronizar faturas."),
    );
  }
}

export async function grantOrganizationComplimentaryPlanAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: "/admin/empresas",
  });

  const parsed = grantComplimentaryPlanSchema.safeParse({
    organizationId: getFormValue(formData, "organizationId"),
    planCode: getFormValue(formData, "planCode"),
    months: getFormValue(formData, "months"),
    reason: getFormValue(formData, "reason"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(
    parsed.success ? parsed.data.returnTo || `/admin/empresas/${parsed.data.organizationId}` : "",
    "/admin/empresas",
  );

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para conceder cortesia.",
    );
  }

  try {
    const now = new Date();
    const complimentaryEndsAt = addMonths(now, parsed.data.months);

    const currentSubscription = await prisma.ownerSubscription.findUnique({
      where: {
        organizationId: parsed.data.organizationId,
      },
      select: {
        id: true,
        planCode: true,
        status: true,
      },
    });

    if (!currentSubscription) {
      return redirectWithMessage(returnTo, "error", "Assinatura da empresa nao encontrada.");
    }

    await prisma.ownerSubscription.update({
      where: {
        id: currentSubscription.id,
      },
      data: {
        planCode: parsed.data.planCode,
        pendingPlanCode: null,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: complimentaryEndsAt,
        cancelAtPeriodEnd: true,
        canceledAt: null,
        trialPlanCode: null,
        trialStartedAt: null,
        trialEndsAt: null,
        complimentaryPlanCode: parsed.data.planCode,
        complimentaryMonths: parsed.data.months,
        complimentaryStartsAt: now,
        complimentaryEndsAt,
      },
    });

    await logPlatformEvent({
      source: "billing",
      action: "subscription.complimentary_granted",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      organizationId: parsed.data.organizationId,
      targetType: "owner_subscription",
      targetId: currentSubscription.id,
      metadata: {
        previousPlanCode: currentSubscription.planCode,
        previousStatus: currentSubscription.status,
        complimentaryPlanCode: parsed.data.planCode,
        complimentaryMonths: parsed.data.months,
        complimentaryStartsAt: now.toISOString(),
        complimentaryEndsAt: complimentaryEndsAt.toISOString(),
        reason: parsed.data.reason || null,
        noPaymentRequired: true,
      },
    });

    revalidatePath(PLAN_MANAGEMENT_PATH);
    revalidatePath("/admin/pagamentos");
    revalidatePath("/admin/empresas");
    revalidatePath(`/admin/empresas/${parsed.data.organizationId}`);
    return redirectWithMessage(
      returnTo,
      "success",
      `Plano ${parsed.data.planCode} concedido gratis por ${parsed.data.months} mes(es), sem cobranca.`,
    );
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao conceder plano gratuito para a empresa."),
    );
  }
}

export async function retryWebhookEventAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    nextPath: PLAN_MANAGEMENT_PATH,
  });

  const parsed = retryWebhookSchema.safeParse({
    eventId: getFormValue(formData, "eventId"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(
    parsed.success ? parsed.data.returnTo || "" : "",
    PLAN_MANAGEMENT_PATH,
  );

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para reprocessamento.",
    );
  }

  try {
    const event = await prisma.billingWebhookEvent.findUnique({
      where: {
        id: parsed.data.eventId,
      },
      select: {
        id: true,
        provider: true,
        status: true,
        payload: true,
      },
    });

    if (!event) {
      return redirectWithMessage(returnTo, "error", "Evento nao encontrado.");
    }

    if (event.provider !== "abacatepay") {
      return redirectWithMessage(returnTo, "error", "Reprocessamento suportado apenas para eventos abacatepay.");
    }

    if (
      event.status !== WebhookProcessingStatus.FAILED &&
      event.status !== WebhookProcessingStatus.IGNORED
    ) {
      return redirectWithMessage(
        returnTo,
        "error",
        "Somente eventos FAILED ou IGNORED podem ser reprocessados.",
      );
    }

    const payloadData = extractWebhookData(event.payload);
    const outcome = inferCheckoutOutcome(payloadData.eventName);

    if (!outcome) {
      return redirectWithMessage(
        returnTo,
        "error",
        "Evento sem mapeamento para status de checkout no MVP.",
      );
    }

    const checkout = payloadData.billingId
      ? await prisma.billingCheckoutSession.findFirst({
          where: {
            abacateBillingId: payloadData.billingId,
          },
        })
      : payloadData.externalId
      ? await prisma.billingCheckoutSession.findFirst({
          where: {
            providerExternalId: payloadData.externalId,
          },
        })
      : null;

    if (!checkout) {
      await prisma.billingWebhookEvent.update({
        where: {
          id: event.id,
        },
        data: {
          status: WebhookProcessingStatus.IGNORED,
          errorMessage: "Checkout nao encontrado no reprocessamento manual.",
        },
      });

      return redirectWithMessage(returnTo, "error", "Checkout nao encontrado para esse evento.");
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const providerBillingId = payloadData.billingId ?? `retry_${checkout.id}_${event.id}`;

      await tx.billingCheckoutSession.update({
        where: {
          id: checkout.id,
        },
        data: {
          status: outcome,
          paidAt: outcome === CheckoutStatus.PAID ? now : null,
        },
      });

      await tx.billingInvoice.upsert({
        where: {
          providerBillingId,
        },
        create: {
          ownerUserId: checkout.ownerUserId,
          subscriptionId: checkout.subscriptionId,
          checkoutSessionId: checkout.id,
          provider: "abacatepay",
          providerBillingId,
          status: outcome,
          amountCents: checkout.amountCents,
          currency: checkout.currency,
          billingUrl: checkout.abacateBillingUrl,
          paidAt: outcome === CheckoutStatus.PAID ? now : null,
        },
        update: {
          checkoutSessionId: checkout.id,
          status: outcome,
          amountCents: checkout.amountCents,
          currency: checkout.currency,
          billingUrl: checkout.abacateBillingUrl,
          paidAt: outcome === CheckoutStatus.PAID ? now : null,
        },
      });

      if (outcome === CheckoutStatus.PAID) {
        const nextPeriodEnd = new Date(now);
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30);

        await tx.ownerSubscription.update({
          where: {
            id: checkout.subscriptionId,
          },
          data: {
            status: SubscriptionStatus.ACTIVE,
            planCode: checkout.targetPlanCode,
            pendingPlanCode: null,
            currentPeriodStart: now,
            currentPeriodEnd: nextPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        });
      } else if (outcome === CheckoutStatus.EXPIRED) {
        await tx.ownerSubscription.update({
          where: {
            id: checkout.subscriptionId,
          },
          data: {
            status: SubscriptionStatus.EXPIRED,
            planCode: checkout.targetPlanCode,
            pendingPlanCode: null,
            currentPeriodEnd: now,
          },
        });
      } else if (outcome === CheckoutStatus.CHARGEBACK) {
        await tx.ownerSubscription.update({
          where: {
            id: checkout.subscriptionId,
          },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            planCode: checkout.targetPlanCode,
            pendingPlanCode: null,
            canceledAt: now,
          },
        });
      } else {
        await tx.ownerSubscription.update({
          where: {
            id: checkout.subscriptionId,
          },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            pendingPlanCode: null,
          },
        });
      }

      await tx.billingWebhookEvent.update({
        where: {
          id: event.id,
        },
        data: {
          status: WebhookProcessingStatus.PROCESSED,
          errorMessage: null,
          processedAt: now,
        },
      });
    });

    await logPlatformEvent({
      source: "billing",
      action: "webhook.retry_processed",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      organizationId: checkout.organizationId,
      targetType: "billing_webhook_event",
      targetId: event.id,
      metadata: {
        outcome,
        checkoutId: checkout.id,
      },
    });

    revalidatePath(PLAN_MANAGEMENT_PATH);
    revalidatePath("/admin/pagamentos");
    return redirectWithMessage(returnTo, "success", "Webhook reprocessado com sucesso.");
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao reprocessar webhook."),
    );
  }
}

export async function setPlatformAdminStatusAction(formData: FormData) {
  const { platformAdmin, session } = await requirePlatformAdmin({
    requireMaster: true,
    nextPath: "/admin/admins",
  });

  const parsed = adminStatusSchema.safeParse({
    adminId: getFormValue(formData, "adminId"),
    status: getFormValue(formData, "status"),
    returnTo: getFormValue(formData, "returnTo"),
  });

  const returnTo = resolveSafePath(parsed.success ? parsed.data.returnTo || "" : "", "/admin/admins");

  if (!parsed.success) {
    return redirectWithMessage(
      returnTo,
      "error",
      parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar admin.",
    );
  }

  try {
    const target = await prisma.platformAdmin.findUnique({
      where: {
        id: parsed.data.adminId,
      },
      select: {
        id: true,
        role: true,
        status: true,
        userId: true,
      },
    });

    if (!target) {
      return redirectWithMessage(returnTo, "error", "Administrador nao encontrado.");
    }

    if (target.role === PlatformAdminRole.MASTER && parsed.data.status === PlatformAdminStatus.DISABLED) {
      const activeMasters = await prisma.platformAdmin.count({
        where: {
          role: PlatformAdminRole.MASTER,
          status: PlatformAdminStatus.ACTIVE,
        },
      });

      if (activeMasters <= 1) {
        return redirectWithMessage(returnTo, "error", "Nao e permitido desativar o ultimo MASTER ativo.");
      }
    }

    await prisma.platformAdmin.update({
      where: {
        id: target.id,
      },
      data: {
        status: parsed.data.status,
      },
    });

    if (parsed.data.status === PlatformAdminStatus.DISABLED) {
      await prisma.session.deleteMany({
        where: {
          userId: target.userId,
        },
      });
    }

    await logPlatformEvent({
      source: "admin",
      action: "admin.status_changed",
      severity: PlatformEventSeverity.INFO,
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      targetType: "platform_admin",
      targetId: target.id,
      metadata: {
        from: target.status,
        to: parsed.data.status,
      },
    });

    revalidatePath("/admin/admins");
    return redirectWithMessage(returnTo, "success", "Status do admin atualizado.");
  } catch (error) {
    return redirectWithMessage(
      returnTo,
      "error",
      parseActionError(error, "Falha ao atualizar status do admin."),
    );
  }
}
