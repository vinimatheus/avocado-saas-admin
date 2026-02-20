import { Badge } from "@/components/ui/badge";

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger";

function resolveVariant(rawStatus: string): BadgeVariant {
  const status = rawStatus.toUpperCase();

  if (
    status.includes("ACTIVE") ||
    status.includes("SUCCESS") ||
    status.includes("COMPLETED") ||
    status.includes("MASTER")
  ) {
    return "success";
  }

  if (
    status.includes("BLOCKED") ||
    status.includes("FAILED") ||
    status.includes("ERROR") ||
    status.includes("DISABLED") ||
    status.includes("CANCELED")
  ) {
    return "danger";
  }

  if (
    status.includes("PENDING") ||
    status.includes("IGNORED") ||
    status.includes("WAIT")
  ) {
    return "warning";
  }

  return "secondary";
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge variant={resolveVariant(status)} className={className}>
      {status}
    </Badge>
  );
}
