import { walkEvents } from './projector.js';

// Lifecycle consistency only. Ownership, financing and payments remain
// independent historical facts even outside a person's active interval.
export function archiveHistoryProblems(project) {
  const names = new Map((project.people || []).map(p => [p.id,p.name]));
  const problems = [];
  if (!(project.events || []).some(e => ['person-deactivated','person-reactivated'].includes(e.type))) return problems;
  walkEvents(project, '9999-12-31', (state,event) => {
    if (!['person-deactivated','person-reactivated'].includes(event.type)) return;
    const id=event.personId, person=state.peopleById.get(id);
    const valid=names.has(id) && person?.entered &&
      (event.type==='person-deactivated' ? person.active : !!person.inactiveFrom);
    if (!valid) {
      const key='errors.archiveStatus';
      problems.push({key,params:{name:names.get(id)||id,date:event.date,eventId:event.id},
        identity:JSON.stringify([key,id,event.id,null,event.date])});
    }
  });
  return problems;
}
