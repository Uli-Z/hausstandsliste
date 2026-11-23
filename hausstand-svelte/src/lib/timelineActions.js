// Presentation-only metadata: event types and saved dates remain untouched.
const ICONS = Object.freeze({
  'item-added': 'box',
  'item-ended': 'archive',
  'shares-set': 'arrows',
  'redistribution-executed': 'arrows',
  'claim-settlement-recorded': 'wallet',
  'person-added': 'person-add',
  'person-deactivated': 'people',
  'person-reactivated': 'person-add'
});

const EDITABLE_TYPES = new Set(Object.keys(ICONS));

export function iconForTimelineEvent(type) {
  return ICONS[type] || 'clock';
}

// Unknown event types must never open an editor that cannot handle them.
export function interactionForTimelineEvent(type, readOnly) {
  return !readOnly && EDITABLE_TYPES.has(type) ? 'edit' : 'details';
}
