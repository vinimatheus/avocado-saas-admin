import { AlertCircle, CircleCheckBig } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type FeedbackBannersProps = {
  errorMessage?: string;
  successMessage?: string;
};

export function FeedbackBanners({
  errorMessage,
  successMessage,
}: FeedbackBannersProps) {
  if (!errorMessage && !successMessage) {
    return null;
  }

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Acao nao concluida</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {successMessage ? (
        <Alert variant="success">
          <CircleCheckBig className="size-4" />
          <AlertTitle>Acao concluida</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
