"use client";

import { createAuthClient } from "better-auth/react";

const configuredBaseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
const authClientBaseUrl = configuredBaseUrl || "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: authClientBaseUrl,
});

export const { signIn, signUp, signOut, useSession } = authClient;
