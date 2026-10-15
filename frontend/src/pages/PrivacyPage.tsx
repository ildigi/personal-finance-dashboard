import { LegalLayout, LegalSection } from "@/components/layout/LegalLayout";

/** Informativa sulla privacy (indirizzo registrato su Enable Banking come "Privacy URL"). */
export function PrivacyPage() {
  return (
    <LegalLayout title="Informativa sulla privacy">
      <LegalSection title="Chi usa questa app">
        <p>
          Questa è una dashboard personale per la gestione delle proprie finanze, usata soltanto dal
          suo proprietario. Funziona in locale sul computer del proprietario (in futuro potrà
          funzionare su un suo server privato). Non è un servizio offerto ad altre persone.
        </p>
        <p>
          Il titolare del trattamento è il proprietario della dashboard, che è anche l&apos;unica
          persona di cui vengono trattati i dati.
        </p>
      </LegalSection>

      <LegalSection title="Quali dati vengono letti">
        <ul>
          <li>
            <strong>Conti bancari</strong>, tramite Enable Banking (servizio di informazione sui
            conti previsto dalla direttiva PSD2): elenco dei conti, saldi e movimenti dei soli conti
            del proprietario.
          </li>
          <li>
            <strong>Investimenti su Trading 212</strong>, tramite l&apos;API ufficiale in sola
            lettura.
          </li>
        </ul>
        <p>
          L&apos;accesso è <strong>in sola lettura</strong>: l&apos;app non può disporre pagamenti
          né spostare denaro. Non vede mai le password della banca: l&apos;accesso e
          l&apos;autenticazione forte avvengono direttamente nell&apos;app o nel sito della banca.
        </p>
      </LegalSection>

      <LegalSection title="Perché">
        <p>
          Solo per uso personale: tenere un budget, classificare le spese e analizzare
          l&apos;andamento di conti e investimenti.
        </p>
      </LegalSection>

      <LegalSection title="Dove sono conservati">
        <ul>
          <li>In un database PostgreSQL locale, sul computer del proprietario.</li>
          <li>I token della sessione di consenso sono conservati cifrati.</li>
          <li>
            I dati non vengono venduti, condivisi o inviati a terzi, a parte i fornitori necessari
            per ottenerli (Enable Banking e la banca).
          </li>
          <li>
            Nessuno strumento di analisi o tracciamento e nessun cookie di profilazione. Il browser
            ricorda solo preferenze locali, come il tema e la modalità privacy (in localStorage).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Durata del consenso e revoca">
        <p>
          Il consenso dato alla banca dura al massimo 180 giorni. Si può revocare in qualsiasi
          momento da <strong>Impostazioni → Scollega</strong>, che chiude la sessione anche presso
          Enable Banking, oppure direttamente dalla banca.
        </p>
        <p>
          Al momento dello scollegamento si possono anche cancellare i dati già scaricati, con
          «Elimina conti e movimenti».
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
