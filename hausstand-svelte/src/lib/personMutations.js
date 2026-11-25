import { uid, nextEventOrder, todayISO } from './util.js';
import { validISODate } from './claimSettlement.js';
import { projectAt } from './projector.js';

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
export function addPerson(project, { name }) {
  const checked = checkedName(project, name);
  // The creation event is an audit record, never a membership start date.
  const date = todayISO();
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

/** Membership changes are dated facts, independent of ownership and payment. */
export function personStatusProblem(project, { personId, date, kind }) {
  if (!(project.people || []).some(person => person.id === personId)) return 'PERSON_NOT_FOUND';
  if (!validISODate(date)) return 'INVALID_PERSON_DATE';
  if (kind !== 'deactivate' && kind !== 'reactivate') return 'INVALID_PERSON_STATUS';
  const active = !!projectAt(project,date).peopleById.get(personId)?.active;
  if (active !== (kind === 'deactivate')) return 'INVALID_PERSON_STATUS';
  return null;
}

export function changePersonStatus(project, { personId, date, kind, reason = '' }) {
  const problem = personStatusProblem(project,{personId,date,kind});
  if (problem) throw new Error(problem);
  if (typeof reason !== 'string') throw new Error('INVALID_PERSON_REASON');
  const person = project.people.find(p => p.id === personId);
  const type = kind === 'deactivate' ? 'person-deactivated' : 'person-reactivated';
  const event = createEvent(type,date,{personId,reason:reason.trim()},project);
  project.events.push(event);
  return {person,event};
}
