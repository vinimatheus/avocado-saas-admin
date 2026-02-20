import { BillingPlanCode } from "@prisma/client";

export const PLAN_SEQUENCE: BillingPlanCode[] = [
  BillingPlanCode.FREE,
  BillingPlanCode.STARTER_50,
  BillingPlanCode.PRO_100,
  BillingPlanCode.SCALE_400,
];

export const PAID_PLAN_SEQUENCE: BillingPlanCode[] = PLAN_SEQUENCE.filter(
  (planCode) => planCode !== BillingPlanCode.FREE,
);

const PLAN_LABELS: Record<BillingPlanCode, string> = {
  [BillingPlanCode.FREE]: "FREE (gratuito)",
  [BillingPlanCode.STARTER_50]: "STARTER 50",
  [BillingPlanCode.PRO_100]: "PRO 100",
  [BillingPlanCode.SCALE_400]: "SCALE 400",
};

export function getPlanLabel(planCode: BillingPlanCode): string {
  return PLAN_LABELS[planCode] ?? planCode;
}

export function getPreviousPlanCode(planCode: BillingPlanCode): BillingPlanCode | null {
  const index = PLAN_SEQUENCE.indexOf(planCode);

  if (index <= 0) {
    return null;
  }

  return PLAN_SEQUENCE[index - 1] ?? null;
}
