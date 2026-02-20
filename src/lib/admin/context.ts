import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

type AdminSession = Awaited<ReturnType<typeof auth.api.getSession>>;

type PlatformAdminSnapshot = {
  id: string;
  userId: string;
  role: "MASTER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  mustChangePassword: boolean;
};

export type PlatformAdminContext = {
  requestHeaders: Headers;
  session: AdminSession;
  platformAdminCount: number;
  platformAdmin: PlatformAdminSnapshot | null;
};

function buildSignInPath(nextPath: string, errorMessage?: string): string {
  const params = new URLSearchParams();
  if (nextPath) {
    params.set("next", nextPath);
  }
  if (errorMessage) {
    params.set("error", errorMessage);
  }

  const query = params.toString();
  return query ? `/sign-in?${query}` : "/sign-in";
}

export async function getPlatformAdminContext(): Promise<PlatformAdminContext> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  const platformAdminCount = await prisma.platformAdmin.count();

  if (!session?.user) {
    return {
      requestHeaders,
      session,
      platformAdminCount,
      platformAdmin: null,
    };
  }

  const platformAdmin = await prisma.platformAdmin.findUnique({
    where: {
      userId: session.user.id,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      mustChangePassword: true,
    },
  });

  return {
    requestHeaders,
    session,
    platformAdminCount,
    platformAdmin,
  };
}

export async function requirePlatformAdmin(options?: {
  nextPath?: string;
  requireMaster?: boolean;
  allowWhenNoAdmins?: boolean;
  allowMustChangePassword?: boolean;
}): Promise<{
  session: NonNullable<AdminSession>;
  platformAdmin: PlatformAdminSnapshot;
}> {
  const nextPath = options?.nextPath ?? "/admin";
  const context = await getPlatformAdminContext();

  if (context.platformAdminCount === 0) {
    if (options?.allowWhenNoAdmins) {
      if (!context.session?.user) {
        throw new Error("Sessao ausente para fluxo de setup de master.");
      }

      return {
        session: context.session,
        platformAdmin: {
          id: "",
          userId: context.session.user.id,
          role: "MASTER",
          status: "ACTIVE",
          mustChangePassword: false,
        },
      };
    }

    redirect("/setup/claim-master");
  }

  if (!context.session?.user) {
    redirect(buildSignInPath(nextPath));
  }

  if (!context.platformAdmin) {
    redirect(buildSignInPath(nextPath, "Usuario sem permissao de administrador global."));
  }

  if (context.platformAdmin.status !== "ACTIVE") {
    try {
      await auth.api.signOut({
        headers: context.requestHeaders,
      });
    } catch {
      // Ignore sign-out failure and force redirect anyway.
    }

    redirect(buildSignInPath(nextPath, "Administrador desativado."));
  }

  if (context.platformAdmin.mustChangePassword && !options?.allowMustChangePassword) {
    redirect("/change-password");
  }

  if (options?.requireMaster && context.platformAdmin.role !== "MASTER") {
    redirect("/admin");
  }

  return {
    session: context.session,
    platformAdmin: context.platformAdmin,
  };
}
