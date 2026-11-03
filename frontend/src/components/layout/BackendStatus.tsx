import { useTranslation } from "react-i18next";

import { StatusDot, type Status } from "@/components/common/StatusIndicator";
import { useHealth } from "@/features/system/queries";

/** Riquadro compatto in fondo alla sidebar: il backend risponde? */
export function BackendStatus() {
  const { t } = useTranslation();
  const { data, isError } = useHealth();

  let status: Status = "pending";
  let label: string = t("backendStatus.connecting");
  if (isError) {
    status = "critical";
    label = t("backendStatus.unreachable");
  } else if (data) {
    status = data.status === "ok" ? "good" : data.status === "degraded" ? "warning" : "critical";
    label =
      data.status === "ok"
        ? t("backendStatus.connected")
        : data.status === "degraded"
          ? t("backendStatus.migrationsPending")
          : t("backendStatus.databaseUnreachable");
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-muted-foreground"
    >
      <StatusDot status={status} />
      <span className="flex-1 truncate">{label}</span>
      {data && <span className="text-muted-foreground/70">v{data.version}</span>}
    </div>
  );
}
