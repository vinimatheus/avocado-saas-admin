import { NextRequest, NextResponse } from "next/server";
import {
  PlatformAdminRole,
  PlatformEventSeverity,
  PlatformOrgStatus,
} from "@prisma/client";

import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import {
  createStarterImpersonationToken,
  resolveStarterAppBaseUrl,
} from "@/lib/starter/impersonation-token";
import { logPlatformEvent } from "@/lib/platform/events";

const DEFAULT_RETURN_TO = "/admin/empresas";
const DEFAULT_SIGN_IN_NEXT = "/admin/empresas";
const DEFAULT_STARTER_NEXT = "/dashboard";

function resolveSafePath(path: string, fallbackPath: string): string {
  const trimmed = path.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallbackPath;
  }

  return trimmed;
}

function redirectWithMessage(
  request: NextRequest,
  path: string,
  type: "error" | "success",
  message: string,
): NextResponse {
  const safePath = resolveSafePath(path, DEFAULT_RETURN_TO);
  const redirectUrl = new URL(safePath, request.nextUrl.origin);
  redirectUrl.searchParams.set(type, message);
  return NextResponse.redirect(redirectUrl);
}

function redirectToSignIn(request: NextRequest, nextPath: string): NextResponse {
  const signInUrl = new URL("/sign-in", request.nextUrl.origin);
  signInUrl.searchParams.set("next", resolveSafePath(nextPath, DEFAULT_SIGN_IN_NEXT));
  return NextResponse.redirect(signInUrl);
}

function getSingleSearchParam(
  request: NextRequest,
  key: string,
  fallbackValue = "",
): string {
  return request.nextUrl.searchParams.get(key)?.trim() || fallbackValue;
}

function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderStarterAutoPostDocument(actionUrl: string, token: string, nextPath: string): string {
  const safeActionUrl = escapeHtml(actionUrl);
  const safeToken = escapeHtml(token);
  const safeNextPath = escapeHtml(nextPath);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Redirecionando para a empresa...</title>
  </head>
  <body>
    <form id="starter-impersonation-form" method="post" action="${safeActionUrl}">
      <input type="hidden" name="token" value="${safeToken}" />
      <input type="hidden" name="next" value="${safeNextPath}" />
      <noscript>
        <p>JavaScript desabilitado. Clique para continuar:</p>
        <button type="submit">Continuar</button>
      </noscript>
    </form>
    <script>
      document.getElementById("starter-impersonation-form")?.submit();
    </script>
  </body>
</html>`;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = resolveSafePath(getSingleSearchParam(request, "returnTo"), DEFAULT_RETURN_TO);
  return redirectWithMessage(
    request,
    returnTo,
    "error",
    "Fluxo invalido. Use o botao de acesso seguro no painel.",
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const organizationId = getFormValue(formData, "organizationId");
  const returnTo = resolveSafePath(getFormValue(formData, "returnTo"), DEFAULT_RETURN_TO);
  const requestOrigin = request.headers.get("origin")?.trim() || "";

  if (requestOrigin && requestOrigin !== request.nextUrl.origin) {
    return redirectWithMessage(
      request,
      returnTo,
      "error",
      "Origem invalida para iniciar autenticacao cross-app.",
    );
  }

  if (!organizationId) {
    return redirectWithMessage(request, returnTo, "error", "Organizacao nao informada.");
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return redirectToSignIn(request, returnTo);
  }

  const platformAdmin = await prisma.platformAdmin.findUnique({
    where: {
      userId: session.user.id,
    },
    select: {
      id: true,
      status: true,
      role: true,
      mustChangePassword: true,
    },
  });

  if (!platformAdmin || platformAdmin.status !== "ACTIVE") {
    return redirectToSignIn(request, returnTo);
  }

  if (platformAdmin.mustChangePassword) {
    return redirectWithMessage(
      request,
      "/change-password",
      "error",
      "Troque sua senha antes de acessar tenants no Starter.",
    );
  }

  if (platformAdmin.role !== PlatformAdminRole.MASTER) {
    return redirectWithMessage(
      request,
      returnTo,
      "error",
      "Apenas MASTER pode abrir sessao cross-app em tenants.",
    );
  }

  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      id: true,
      slug: true,
      platformStatus: true,
      ownerSubscription: {
        select: {
          ownerUserId: true,
        },
      },
      members: {
        where: {
          role: {
            equals: "owner",
            mode: "insensitive",
          },
        },
        take: 1,
        select: {
          userId: true,
        },
      },
    },
  });

  if (!organization) {
    return redirectWithMessage(request, returnTo, "error", "Organizacao nao encontrada.");
  }

  if (organization.platformStatus === PlatformOrgStatus.BLOCKED) {
    return redirectWithMessage(
      request,
      returnTo,
      "error",
      "Tenant bloqueado na plataforma. Desbloqueie antes de autenticar no Starter.",
    );
  }

  const ownerUserId =
    organization.ownerSubscription?.ownerUserId?.trim() || organization.members[0]?.userId || "";
  if (!ownerUserId) {
    return redirectWithMessage(
      request,
      returnTo,
      "error",
      "Organizacao sem owner para realizar autenticacao.",
    );
  }

  let token: string;
  try {
    token = createStarterImpersonationToken({
      actorUserId: session.user.id,
      actorAdminId: platformAdmin.id,
      targetUserId: ownerUserId,
      organizationId: organization.id,
    });
  } catch {
    return redirectWithMessage(
      request,
      returnTo,
      "error",
      "Falha ao criar token de autenticacao para o Starter.",
    );
  }

  await logPlatformEvent({
    source: "admin",
    action: "starter.impersonation.requested",
    severity: PlatformEventSeverity.INFO,
    actorUserId: session.user.id,
    actorAdminId: platformAdmin.id,
    organizationId: organization.id,
    targetType: "organization",
    targetId: organization.id,
    metadata: {
      organizationSlug: organization.slug,
      targetUserId: ownerUserId,
    },
  });

  const starterUrl = new URL("/api/platform-admin/impersonation", resolveStarterAppBaseUrl());
  const document = renderStarterAutoPostDocument(starterUrl.toString(), token, DEFAULT_STARTER_NEXT);

  return new NextResponse(document, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  });
}
