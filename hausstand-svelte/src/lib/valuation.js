import { yearsBetween } from './util.js';
import { money } from './domain.js';

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

export const label = valuation => {
  const min = Number(valuation?.minimumValue || 0) > 0 ? `, Mindestwert ${money(valuation.minimumValue)}` : '';
  if (valuation?.type === 'linear') return `linear über ${valuation.durationYears || '?'} Jahre${min}`;
  if (valuation?.type === 'degressive') return `degressiv ${Math.round((valuation.annualRate || 0) * 1000) / 10}%/Jahr${min}`;
  return `konstant${min}`;
};
