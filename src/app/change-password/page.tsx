import { redirect } from "next/navigation";

import { rotateAdminPasswordFirstLoginAction } from "@/actions/admin-actions";
import { FeedbackBanners } from "@/components/admin/feedback-banners";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePlatformAdmin } from "@/lib/admin/context";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const { platformAdmin } = await requirePlatformAdmin({
    nextPath: "/change-password",
    allowMustChangePassword: true,
  });

  if (!platformAdmin.mustChangePassword) {
    redirect("/admin");
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();

  return (
    <AuthShell
      title="Troca obrigatoria de senha"
      description="Sua conta foi criada com senha temporaria. Defina uma nova senha para continuar."
    >
      <form action={rotateAdminPasswordFirstLoginAction} className="space-y-4">
        <FeedbackBanners errorMessage={errorMessage} />

        <div className="space-y-1.5">
          <label
            htmlFor="currentPassword"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Senha atual
          </label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="newPassword"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Nova senha
          </label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirmNewPassword"
            className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Confirmar nova senha
          </label>
          <Input
            id="confirmNewPassword"
            name="confirmNewPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Atualizar senha
        </Button>
      </form>
    </AuthShell>
  );
}
