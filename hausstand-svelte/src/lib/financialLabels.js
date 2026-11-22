// A06: Clear separation of ownership events, derived claims, hypothetical
// transfer suggestions and payments actually recorded in an event journal.
// Payment event recording is not yet implemented; no screen may imply otherwise.
export const PAYMENT_STATUS_NOTICE =
  'Es werden derzeit keine tatsächlichen Zahlungen erfasst. Ein Forderungssaldo oder Überweisungsvorschlag ist kein Zahlungsnachweis.';

export const BILATERAL_BALANCE_DESCRIPTION =
  'Rechnerischer Saldo aus entstandenen Forderungen abzüglich gegenläufiger Ansprüche. Es sind keine tatsächlich geleisteten Zahlungen berücksichtigt.';

export const MULTILATERAL_SUGGESTION_DESCRIPTION =
  'Unverbindlicher Vorschlag für möglichst wenige Überweisungen. Der vorgeschlagene Empfänger kann vom ursprünglichen Gläubiger abweichen. Keine Zahlung wurde dadurch gebucht.';

export const REDISTRIBUTION_SUGGESTION_TITLE =
  'Rechnerischer Überweisungsvorschlag (nicht gebucht)';

export const REDISTRIBUTION_SUGGESTION_NOTICE =
  'Nur eine Vorschau der Wertverschiebung, keine gebuchte Zahlung. Die tatsächlich entstandenen Forderungen stehen in „Geld & Ausgleich“.';

export const DERIVED_CLAIMS_DESCRIPTION =
  'Aus diesen entgeltlichen Eigentumsereignissen abgeleitete Forderungen, keine Zahlungen.';

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
  cents > 0 ? 'rechnerisch zu erhalten, nicht als Zahlung erfasst'
    : cents < 0 ? 'rechnerisch zu zahlen, nicht als Zahlung erfasst'
      : 'kein rechnerischer Nettosaldo (nicht gleich bezahlt)'
);
