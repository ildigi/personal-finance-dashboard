import "i18next";

import type { it } from "./locales/it";

// Chiavi e parametri tipizzati: `t("chiave.inesistente")` o un `{{parametro}}` dimenticato
// non compilano.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof it };
    strictKeyChecks: true;
    strictInterpolationChecks: true;
  }
}
