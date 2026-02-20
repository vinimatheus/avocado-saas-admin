import { createHmac, randomBytes } from "node:crypto";

const DEFAULT_STARTER_APP_BASE_URL = "http://localhost:3000";
const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 60;

type CreateStarterImpersonationTokenInput = {
  actorUserId: string;
  actorAdminId: string;
  targetUserId: string;
  organizationId: string;
};

type StarterImpersonationPayload = {
  v: number;
  iat: number;
  exp: number;
  jti: string;
  actorUserId: string;
  actorAdminId: string;
  targetUserId: string;
  organizationId: string;
};

function normalizeId(value: string): string {
  return value.trim();
}

function getImpersonationSecret(): string {
  const secret = process.env.ADMIN_STARTER_IMPERSONATION_SECRET?.trim() || "";

  if (!secret) {
    throw new Error("ADMIN_STARTER_IMPERSONATION_SECRET e obrigatoria.");
  }

  if (secret.length < 32) {
    throw new Error("ADMIN_STARTER_IMPERSONATION_SECRET deve ter pelo menos 32 caracteres.");
  }

  return secret;
}

function createSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function resolveStarterAppBaseUrl(): string {
  const configuredBaseUrl =
    process.env.STARTER_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_STARTER_APP_URL?.trim() ||
    DEFAULT_STARTER_APP_BASE_URL;

  try {
    return new URL(configuredBaseUrl).origin;
  } catch {
    return DEFAULT_STARTER_APP_BASE_URL;
  }
}

export function createStarterImpersonationToken(
  input: CreateStarterImpersonationTokenInput,
): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const payload: StarterImpersonationPayload = {
    v: TOKEN_VERSION,
    iat: nowInSeconds,
    exp: nowInSeconds + TOKEN_TTL_SECONDS,
    jti: randomBytes(16).toString("hex"),
    actorUserId: normalizeId(input.actorUserId),
    actorAdminId: normalizeId(input.actorAdminId),
    targetUserId: normalizeId(input.targetUserId),
    organizationId: normalizeId(input.organizationId),
  };

  if (
    !payload.actorUserId ||
    !payload.actorAdminId ||
    !payload.targetUserId ||
    !payload.organizationId
  ) {
    throw new Error("Token de impersonacao invalido: identificadores ausentes.");
  }

  const payloadEncoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createSignature(payloadEncoded, getImpersonationSecret());

  return `${payloadEncoded}.${signature}`;
}
