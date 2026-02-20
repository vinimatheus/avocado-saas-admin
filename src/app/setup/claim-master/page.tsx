import { redirect } from "next/navigation";

import { claimMasterAdminAction } from "@/actions/admin-actions";
import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function requiresBootstrapToken(): boolean {
  const hasConfiguredToken = Boolean(process.env.ADMIN_BOOTSTRAP_TOKEN?.trim());
  return process.env.NODE_ENV === "production" || hasConfiguredToken;
}

export const dynamic = "force-dynamic";

export default async function ClaimMasterPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const context = await getPlatformAdminContext();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const shouldRequireBootstrapToken = requiresBootstrapToken();

  if (context.platformAdminCount > 0) {
    redirect("/sign-in");
  }

  return (
    <AuthShell
      title="Setup inicial: MASTER"
      description="Nenhum administrador global foi encontrado. Cadastre o primeiro usuario MASTER."
    >
      <form action={claimMasterAdminAction} className="space-y-4">
        <FeedbackBanners errorMessage={errorMessage} />

        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Nome completo
          </label>
          <Input id="name" name="name" type="text" required />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            E-mail
          </label>
          <Input id="email" name="email" type="email" required />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Senha
          </label>
          <Input id="password" name="password" type="password" required />
        </div>

        {shouldRequireBootstrapToken ? (
          <div className="space-y-1.5">
            <label
              htmlFor="bootstrapToken"
              className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
            >
              Token de bootstrap
            </label>
            <Input
              id="bootstrapToken"
              name="bootstrapToken"
              type="password"
              autoComplete="off"
              required
            />
          </div>
        ) : null}

        <Button type="submit" className="w-full">
          Criar MASTER
        </Button>
      </form>
    </AuthShell>
  );
}
