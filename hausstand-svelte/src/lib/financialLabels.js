// A06: Clear separation of ownership events, derived claims, hypothetical
// transfer suggestions and payments actually recorded in an event journal.
// B03: dated settlement events affect local open balances, but the UI does
// not yet offer a form to record payments (B04-B06).
export const PAYMENT_STATUS_NOTICE =
  'Dokumentierte Ausgleichsereignisse werden ab ihrem Datum berücksichtigt; die App überweist selbst kein Geld. „Bezahlt“ belegt nur eine eingetragene frühere Zahlung, „extern verbucht“ keine Zahlung. Neue Ausgleiche lassen sich über die Oberfläche noch nicht erfassen.';

export const BILATERAL_BALANCE_DESCRIPTION =
  'Rechnerischer Saldo aus lokal offenen Forderungen nach zugeordneten Ausgleichen und gegenläufigen Ansprüchen. Gebuchte Zahlungen sind Dokumentation, kein Banknachweis.';

export const MULTILATERAL_SUGGESTION_DESCRIPTION =
  'Unverbindlicher Vorschlag für möglichst wenige weitere Überweisungen auf Basis des lokalen Restbetrags. Der Empfänger kann vom ursprünglichen Gläubiger abweichen. Keine Zahlung wird durch diesen Vorschlag gebucht.';

export const REDISTRIBUTION_SUGGESTION_TITLE =
  'Rechnerischer Überweisungsvorschlag (nicht gebucht)';

export const REDISTRIBUTION_SUGGESTION_NOTICE =
  'Nur eine Vorschau der Wertverschiebung, keine gebuchte Zahlung. Die tatsächlich entstandenen Forderungen stehen in „Geld & Ausgleich“.';

export const DERIVED_CLAIMS_DESCRIPTION =
  'Ursprüngliche Forderungen aus Eigentumsereignissen und ihre dokumentierten Ausgleiche. Extern verbucht bedeutet nicht bezahlt; gegenläufige Ansprüche sind im bilateralen Nettosaldo verrechnet.';

export const FINANCIAL_EVENT_NOTE = event => {
  if (event?.financialMode === 'derived') {
    return 'entgeltlich · mögliche Forderungen werden abgeleitet · keine Zahlung gebucht';
  }
  return 'unentgeltlich/Altvorgang · keine neue Forderung · keine Zahlung gebucht';
};

export const ITEM_FUNDING_NOTE = event => (
  event?.financialMode === 'derived' && event?.financedByPersonId
    ? 'Finanzierung zugeordnet · mögliche Forderungen werden abgeleitet · keine Zahlung gebucht'
    : 'Keine Forderung aus der Anschaffung erfasst'
);

export const PERSON_BALANCE_NOTE = cents => (
  cents > 0 ? 'rechnerisch zu erhalten (nach dokumentierten Ausgleichen)'
    : cents < 0 ? 'rechnerisch zu zahlen (nach dokumentierten Ausgleichen)'
      : 'kein rechnerischer Nettosaldo (nicht gleich bezahlt)'
);
