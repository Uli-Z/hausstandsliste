import { yearsBetween } from './util.js';
import { money } from './domain.js';
import { message, getLocale } from './i18n.js';

export const valueAt = (valuation, startValue, startDate, asOfDate) => {
  const base = Math.max(0, Number(startValue) || 0);
  const min = Math.max(0, Number(valuation?.minimumValue) || 0);
  const years = yearsBetween(startDate, asOfDate);
  let value = base;
  if (valuation?.type === 'linear') {
    const duration = Number(valuation.durationYears) || 0;
    value = duration > 0 ? base * Math.max(0, 1 - years / duration) : base;
  } else if (valuation?.type === 'degressive') {
    const rate = Math.max(0, Math.min(1, Number(valuation.annualRate) || 0));
    value = base * Math.pow(1 - rate, years);
  }
  return Math.max(min, value);
};

// Preserve the existing valuation rule; round once, before allocation.
export const valueAtCents = (...args) => Math.round(valueAt(...args) * 100);

export const label = valuation => {
  const t = (key, params) => message(key, getLocale(), params);
  const min = Number(valuation?.minimumValue || 0) > 0 ? t('valuation.minimum', { value: money(valuation.minimumValue) }) : '';
  if (valuation?.type === 'linear') return t('valuation.linear', {years: valuation.durationYears || '?'}) + min;
  if (valuation?.type === 'degressive') return t('valuation.degressive', {rate: Math.round((valuation.annualRate || 0) * 1000) / 10}) + min;
  return t('valuation.fixed') + min;
};
