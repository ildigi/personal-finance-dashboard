import { LegalLayout, LegalSection } from "@/components/layout/LegalLayout";

/** Termini di utilizzo (indirizzo registrato su Enable Banking come "Terms URL"). */
export function TermsPage() {
  return (
    <LegalLayout title="Termini di utilizzo">
      <LegalSection title="Uso personale">
        <p>
          Questa dashboard è destinata all&apos;uso personale e non commerciale del solo
          proprietario. Non offre alcun servizio a terzi e non collega conti di altre persone.
        </p>
      </LegalSection>

      <LegalSection title="Sola lettura">
        <p>
          L&apos;app legge conti, saldi, movimenti e investimenti, ma non può disporre pagamenti né
          modificare nulla presso la banca o il broker.
        </p>
      </LegalSection>

      <LegalSection title="Nessuna garanzia sui dati">
        <ul>
          <li>
            Le cifre provengono da banche e broker e possono essere incomplete, in ritardo o
            inesatte.
          </li>
          <li>La classificazione dei movimenti è automatica e può sbagliare.</li>
          <li>
            Quanto mostrato non è una consulenza finanziaria: per le decisioni fanno fede gli
            estratti ufficiali della banca e del broker.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Revoca">
        <p>
          Il proprietario può revocare il consenso in qualsiasi momento da{" "}
          <strong>Impostazioni → Scollega</strong> oppure direttamente dalla banca.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
