import { Compass } from "lucide-react";
import { Link } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Pagina non trovata"
        action={
          <Button asChild>
            <Link to="/">Torna alla panoramica</Link>
          </Button>
        }
      >
        L&apos;indirizzo non corrisponde a nessuna pagina della dashboard.
      </EmptyState>
    </Card>
  );
}
