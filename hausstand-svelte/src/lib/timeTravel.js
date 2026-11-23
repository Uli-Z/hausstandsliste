// As-of navigation is temporary view state, never a project event.
// An intentionally selected day remains fixed over real calendar rollovers.
export const validCalendarDate = date => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
export const openDatePicker = state => state.datePickerOpen ? state : { ...state, datePickerOpen: true };
export const dismissDatePicker = state => !state.datePickerOpen ? state : { ...state, datePickerOpen: false };
export const selectAsOfDate = (state, date) => !validCalendarDate(date) ? state : { ...state, asOfDate: date, timeTravelActive: true };
export const returnToToday = (state, today) => ({ ...state, asOfDate: today, datePickerOpen: false, timeTravelActive: false });
export const syncCalendarDay = (state, today) => !validCalendarDate(today) || state.timeTravelActive || state.asOfDate === today ? state : { ...state, asOfDate: today };
