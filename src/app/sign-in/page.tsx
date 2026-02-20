import { redirect } from "next/navigation";

import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getPlatformAdminContext } from "@/lib/admin/context";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function resolveCallbackPath(input: string): string {
  const value = input.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin";
  }

  return value;
}

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const context = await getPlatformAdminContext();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const nextPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();
  const initialEmail = getSingleSearchParam(resolvedSearchParams.email).trim();

  if (context.platformAdminCount === 0) {
    redirect("/setup/claim-master");
  }

  if (context.session?.user && context.platformAdmin?.status === "ACTIVE") {
    if (context.platformAdmin.mustChangePassword) {
      redirect("/change-password");
    }

    redirect(nextPath);
  }

  return (
    <AuthShell
      title="Entrar no painel admin"
      description="Use sua conta de administrador global para acessar os modulos operacionais."
    >
      <div className="space-y-4">
        <FeedbackBanners
          errorMessage={errorMessage}
          successMessage={successMessage}
        />
        <SignInForm nextPath={nextPath} initialEmail={initialEmail} />
      </div>
    </AuthShell>
  );
}
