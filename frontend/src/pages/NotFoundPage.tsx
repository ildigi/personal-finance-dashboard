import { Compass } from "lucide-react";
import { Link } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { i18n } from "@/i18n";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title={i18n.t("notFound.title")}
        action={
          <Button asChild>
            <Link to="/">{i18n.t("notFound.back")}</Link>
          </Button>
        }
      >
        {i18n.t("notFound.text")}
      </EmptyState>
    </Card>
  );
}
