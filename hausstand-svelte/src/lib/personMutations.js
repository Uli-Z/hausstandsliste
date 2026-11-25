import { uid, nextEventOrder } from './util.js';
import { validISODate } from './claimSettlement.js';

// Shared domain operations. Call inside the frontend's guarded transaction.
export const normalizePersonName = value => String(value || '').trim().toLocaleLowerCase('de');
export function duplicatePersonName(project, name, exceptId = null) {
  const normalized = normalizePersonName(name);
  return (project.people || []).find(p => String(p.id) !== String(exceptId) &&
    normalizePersonName(p.name) === normalized);
}
export function createEvent(type, date, data = {}, project = null) {
  return { id: uid('event'), type, date, order: nextEventOrder(project, date), ...data };
}
function checkedName(project, name, exceptId = null) {
  if (typeof name !== 'string' || !normalizePersonName(name) || duplicatePersonName(project, name, exceptId))
    throw new Error('INVALID_PERSON_NAME');
  return name;
}
export function addPerson(project, { name, date }) {
  const checked = checkedName(project, name);
  if (!validISODate(date)) throw new Error('INVALID_PERSON_DATE');
  const person = { id: uid('person'), name: checked };
  const event = createEvent('person-added', date, { personId: person.id, name: checked }, project);
  project.people.push(person);
  project.events.push(event);
  return { person, event };
}
export function renamePerson(project, { personId, name }) {
  const person = project.people.find(p => p.id === personId);
  if (!person) throw new Error('PERSON_NOT_FOUND');
  person.name = checkedName(project, name, personId);
  return { person };
}
