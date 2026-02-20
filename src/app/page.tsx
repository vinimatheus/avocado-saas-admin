import { redirect } from "next/navigation";

import { getPlatformAdminContext } from "@/lib/admin/context";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const context = await getPlatformAdminContext();

  if (context.platformAdminCount === 0) {
    redirect("/setup/claim-master");
  }

  if (!context.session?.user || !context.platformAdmin) {
    redirect("/sign-in");
  }

  if (context.platformAdmin.mustChangePassword) {
    redirect("/change-password");
  }

  redirect("/admin");
}
