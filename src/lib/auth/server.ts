import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { PlatformEventSeverity } from "@prisma/client";
import { APIError } from "better-call";

import { prisma } from "@/lib/db/prisma";
import { logPlatformEvent } from "@/lib/platform/events";

const SIGN_IN_EMAIL_PATH = "/sign-in/email";
const DEFAULT_AUTH_BASE_URL = "http://localhost:3001";
const DEFAULT_AUTH_COOKIE_PREFIX = "avocado-admin-auth";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || "";

  if (!secret) {
    if (isProduction()) {
      throw new Error("BETTER_AUTH_SECRET e obrigatoria em producao.");
    }

    return "dev-only-better-auth-secret-change-me-admin";
  }

  if (isProduction() && secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres em producao.");
  }

  return secret;
}

function getPrimaryBaseUrl(): string {
  const explicitBaseUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.BETTER_AUTH_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  return DEFAULT_AUTH_BASE_URL;
}

function getAuthCookiePrefix(): string {
  const configuredPrefix = process.env.BETTER_AUTH_COOKIE_PREFIX?.trim() || "";
  return configuredPrefix || DEFAULT_AUTH_COOKIE_PREFIX;
}

function getTrustedOrigins(): string[] {
  const baseUrl = getPrimaryBaseUrl();
  const configured = process.env.TRUSTED_ORIGINS?.trim() || "";
  const parsed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        return Boolean(new URL(value).origin);
      } catch {
        return false;
      }
    });

  return Array.from(new Set([baseUrl, ...parsed]));
}

async function assertEmailUserNotBlocked(rawEmail: unknown): Promise<void> {
  if (typeof rawEmail !== "string") {
    return;
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      platformStatus: true,
      platformBlockedReason: true,
    },
  });

  if (!user || user.platformStatus !== "BLOCKED") {
    return;
  }

  await logPlatformEvent({
    source: "auth",
    action: "login.blocked",
    severity: PlatformEventSeverity.WARN,
    actorUserId: user.id,
    targetType: "user",
    targetId: user.id,
    metadata: {
      email,
      reason: user.platformBlockedReason ?? null,
      channel: "admin-sign-in",
    },
  });

  throw new APIError("FORBIDDEN", {
    message: "Conta bloqueada pela administracao da plataforma.",
  });
}

export const auth = betterAuth({
  baseURL: getPrimaryBaseUrl(),
  secret: getAuthSecret(),
  trustedOrigins: getTrustedOrigins(),
  advanced: {
    useSecureCookies: isProduction(),
    cookiePrefix: getAuthCookiePrefix(),
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_EMAIL_PATH) {
        return;
      }

      await assertEmailUserNotBlocked(ctx.body?.email);
    }),
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, context) => {
          const userId = typeof session.userId === "string" ? session.userId : "";
          const sessionId = typeof session.id === "string" ? session.id : "";
          if (!userId || !sessionId) {
            return;
          }

          const path = context?.path || "";

          const user = await prisma.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              platformStatus: true,
              platformBlockedReason: true,
            },
          });

          if (user?.platformStatus === "BLOCKED") {
            await prisma.session.deleteMany({
              where: {
                id: sessionId,
                userId,
              },
            });

            await logPlatformEvent({
              source: "auth",
              action: "login.blocked",
              severity: PlatformEventSeverity.WARN,
              actorUserId: userId,
              targetType: "user",
              targetId: userId,
              metadata: {
                path,
                reason: user.platformBlockedReason ?? null,
                channel: "admin-session-create",
              },
            });

            throw new APIError("FORBIDDEN", {
              message: "Conta bloqueada pela administracao da plataforma.",
            });
          }

          await logPlatformEvent({
            source: "auth",
            action: "session.created",
            severity: PlatformEventSeverity.INFO,
            actorUserId: userId,
            targetType: "session",
            targetId: sessionId,
            metadata: {
              path,
              ipAddress: typeof session.ipAddress === "string" ? session.ipAddress : null,
              userAgent: typeof session.userAgent === "string" ? session.userAgent : null,
            },
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
