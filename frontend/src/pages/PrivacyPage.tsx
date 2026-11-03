import { Trans } from "react-i18next";

import { LegalLayout, LegalSection } from "@/components/layout/LegalLayout";
import { i18n } from "@/i18n";

const STRONG = { strong: <strong /> };

/** Informativa sulla privacy (indirizzo registrato su Enable Banking come "Privacy URL"). */
export function PrivacyPage() {
  return (
    <LegalLayout title={i18n.t("legal.privacy.title")}>
      <LegalSection title={i18n.t("legal.privacy.who.title")}>
        <p>{i18n.t("legal.privacy.who.p1")}</p>
        <p>{i18n.t("legal.privacy.who.p2")}</p>
      </LegalSection>

      <LegalSection title={i18n.t("legal.privacy.data.title")}>
        <ul>
          <li>
            <Trans i18nKey="legal.privacy.data.banks" components={STRONG} />
          </li>
          <li>
            <Trans i18nKey="legal.privacy.data.broker" components={STRONG} />
          </li>
        </ul>
        <p>
          <Trans i18nKey="legal.privacy.data.readOnly" components={STRONG} />
        </p>
      </LegalSection>

      <LegalSection title={i18n.t("legal.privacy.why.title")}>
        <p>{i18n.t("legal.privacy.why.p1")}</p>
      </LegalSection>

      <LegalSection title={i18n.t("legal.privacy.where.title")}>
        <ul>
          <li>{i18n.t("legal.privacy.where.db")}</li>
          <li>{i18n.t("legal.privacy.where.tokens")}</li>
          <li>{i18n.t("legal.privacy.where.thirdParties")}</li>
          <li>{i18n.t("legal.privacy.where.tracking")}</li>
        </ul>
      </LegalSection>

      <LegalSection title={i18n.t("legal.privacy.consent.title")}>
        <p>
          <Trans i18nKey="legal.privacy.consent.p1" components={STRONG} />
        </p>
        <p>{i18n.t("legal.privacy.consent.p2")}</p>
      </LegalSection>
    </LegalLayout>
  );
}
