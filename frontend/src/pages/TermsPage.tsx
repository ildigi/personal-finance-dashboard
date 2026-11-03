import { Trans } from "react-i18next";

import { LegalLayout, LegalSection } from "@/components/layout/LegalLayout";
import { i18n } from "@/i18n";

/** Termini di utilizzo (indirizzo registrato su Enable Banking come "Terms URL"). */
export function TermsPage() {
  return (
    <LegalLayout title={i18n.t("legal.terms.title")}>
      <LegalSection title={i18n.t("legal.terms.personal.title")}>
        <p>{i18n.t("legal.terms.personal.p1")}</p>
      </LegalSection>

      <LegalSection title={i18n.t("legal.terms.readOnly.title")}>
        <p>{i18n.t("legal.terms.readOnly.p1")}</p>
      </LegalSection>

      <LegalSection title={i18n.t("legal.terms.noWarranty.title")}>
        <ul>
          <li>{i18n.t("legal.terms.noWarranty.figures")}</li>
          <li>{i18n.t("legal.terms.noWarranty.classification")}</li>
          <li>{i18n.t("legal.terms.noWarranty.advice")}</li>
        </ul>
      </LegalSection>

      <LegalSection title={i18n.t("legal.terms.revoke.title")}>
        <p>
          <Trans i18nKey="legal.terms.revoke.p1" components={{ strong: <strong /> }} />
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
