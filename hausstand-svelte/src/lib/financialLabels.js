// A06: Clear separation of ownership events, derived claims, hypothetical
// transfer suggestions and payments actually recorded in an event journal.
// Payments are now recorded in the UI as dated independent events. All balances
// are primarily communal per-person positions; routes are optional suggestions.
export const PAYMENT_STATUS_NOTICE =
  'Dokumentierte Ausgleichsereignisse werden ab ihrem Datum berücksichtigt; die App überweist selbst kein Geld. „Bezahlt“ belegt nur eine eingetragene frühere Zahlung, „extern verbucht“ keine Zahlung. Bereits erfolgte Ausgleiche können in der App dokumentiert, korrigiert und gelöscht werden.';

export const BILATERAL_BALANCE_DESCRIPTION =
  'Rechnerischer Saldo aus lokal offenen Forderungen nach dokumentierten Ausgleichen und gegenläufigen Ansprüchen. Gebuchte Zahlungen sind Dokumentation, kein Banknachweis.';

export const MULTILATERAL_SUGGESTION_DESCRIPTION =
  'Unverbindlicher Vorschlag zum Ausgleich der persönlichen Gemeinschaftssalden mit möglichst wenigen weiteren Überweisungen. Keine Zahlung wird durch diesen Vorschlag gebucht.';

export const REDISTRIBUTION_SUGGESTION_TITLE =
  'Zahlungsvorschlag – noch keine Zahlung eingetragen';

export const REDISTRIBUTION_SUGGESTION_NOTICE =
  'Hier ändern sich Eigentumsanteile, kein Geld wird überwiesen. Falls tatsächlich Geld geflossen ist, erfasse die Zahlung gesondert.';

export const DERIVED_CLAIMS_DESCRIPTION =
  'Wertverschiebungen aus Anschaffungen und Anteilsänderungen sowie ihre dokumentierten Ausgleiche. Sie ergeben den persönlichen Gemeinschaftssaldo. Extern verbucht bedeutet nicht bezahlt.';

export const FINANCIAL_EVENT_NOTE = event => {
  if (event?.financialMode === 'derived') {
    return 'Für die übernommenen Anteile entsteht ein entsprechender Geldanspruch, aber keine Überweisung.';
  }
  return 'Schenkung oder Korrektur: Eigentum ändert sich ohne neuen Geldanspruch und ohne Zahlung.';
};

export const ITEM_FUNDING_NOTE = event => (
  event?.financialMode === 'derived' && event?.purchaseContributionsCents
    ? 'Die Kaufbeiträge sind eingetragen. Daraus werden Geldsalden berechnet; allein dadurch wird eine Ausgleichszahlung noch nicht gebucht.'
    : 'Ohne eingetragene zahlende Person entsteht bei diesem Kauf kein automatischer Geldanspruch.'
);

export const PERSON_BALANCE_NOTE = cents => (
  cents > 0 ? 'rechnerisch zu erhalten (nach dokumentierten Ausgleichen)'
    : cents < 0 ? 'rechnerisch zu zahlen (nach dokumentierten Ausgleichen)'
      : 'kein rechnerischer Nettosaldo (nicht gleich bezahlt)'
);
