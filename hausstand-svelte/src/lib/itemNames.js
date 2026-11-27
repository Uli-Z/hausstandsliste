// A warning only: names are not identities and duplicate items remain valid.
export function normalizedItemName(name) {
  return typeof name === 'string' ? name.trim().normalize('NFC').toLowerCase() : '';
}

export function duplicateItemNames(project, name, exceptId = null) {
  const key = normalizedItemName(name);
  if (!key) return [];
  // Use master records rather than the date projection: future and archived
  // records must not disappear from this project-wide check.
  return (project?.items || []).filter(item =>
    item.id !== exceptId && normalizedItemName(item.name) === key);
}

// Shared presentation label. Unnumbered low-level fixtures use the raw name;
// all loaded projects receive persistent numbers before display.
export function itemDisplayName(item) {
  return Number.isSafeInteger(item?.number) && item.number > 0
    ? '#' + item.number + ' ' + item.name
    : item?.name || '';
}

export function duplicateItemStatus(item, projection) {
  const projected = projection?.items?.find(entry => entry.id === item.id);
  if (!projected) return 'outsideDate';
  return projected.status === 'active' ? 'active' : 'archived';
}
