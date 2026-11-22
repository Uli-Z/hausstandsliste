// Person IDs may occur as values (financedByPersonId, debtorPersonId,
// sourcePersonId, etc.) or as keys in historical share maps. Inspect all
// nested records conservatively, including event children and draft contents.
const mentionsPersonId = (record, id) => {
  if (typeof record === 'string' || typeof record === 'number') return String(record) === id;
  if (Array.isArray(record)) return record.some(entry => mentionsPersonId(entry, id));
  if (!record || typeof record !== 'object') return false;
  return Object.entries(record).some(([key, value]) => key === id || mentionsPersonId(value, id));
};

/**
 * Permanent deletion is only permitted for an unused person.
 * A plain person-added event is removable with their master record.
 * Any later lifecycle event, historical share, financing, draft or unknown
 * reference prohibits deletion, even if it falls after today's as-of date.
 */
export function personDeletionEligibility(project, personId) {
  if (personId === null || personId === undefined || String(personId) === '') {
    return { allowed: false, reason: 'Keine Person ausgewählt.' };
  }
  const id = String(personId);
  if (!(project?.people || []).some(person => String(person.id) === id)) {
    return { allowed: false, reason: 'Person ist nicht im Projekt vorhanden.' };
  }

  for (const event of project.events || []) {
    if (event?.type === 'person-added' && String(event.personId) === id) continue;
    if (mentionsPersonId(event, id)) {
      return { allowed: false, reason: 'Die Person ist mit historischen Ereignissen verknüpft.' };
    }
  }
  if ((project.items || []).some(item => mentionsPersonId(item, id))) {
    return { allowed: false, reason: 'Die Person ist in Gegenstandsdaten referenziert.' };
  }
  if ((project.people || []).some(person => String(person.id) !== id && mentionsPersonId(person, id))) {
    return { allowed: false, reason: 'Andere Personenstammdaten verweisen auf diese Person.' };
  }
  if ([...(project.drafts || []), ...(project.redistributions || [])].some(draft => mentionsPersonId(draft, id))) {
    return { allowed: false, reason: 'Die Person wird noch in einem Entwurf verwendet.' };
  }

  // Guard against references in optional or future data extensions. The
  // human-readable snapshot is derived, not an independent source of truth.
  const standardKeys = new Set([
    'schemaVersion', 'appVersion', 'currency', 'community', 'humanReadableSnapshot',
    'people', 'items', 'events', 'drafts', 'redistributions'
  ]);
  for (const [key, value] of Object.entries(project)) {
    if (!standardKeys.has(key) && mentionsPersonId(value, id)) {
      return { allowed: false, reason: 'Weitere Projektdaten verweisen auf diese Person.' };
    }
  }
  return { allowed: true, reason: '' };
}

/**
 * Mutates a project only after rechecking all references. On rejection the
 * project remains unchanged; no ownership shares or financing are rewritten.
 */
export function deleteUnusedPerson(project, personId) {
  const result = personDeletionEligibility(project, personId);
  if (!result.allowed) return result;
  const id = String(personId);
  project.people = project.people.filter(person => String(person.id) !== id);
  project.events = (project.events || []).filter(
    event => !(event?.type === 'person-added' && String(event.personId) === id)
  );
  return result;
}
