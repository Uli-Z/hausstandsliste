// Ephemeral UI feedback; never persisted in the project or version history.
export function createNotificationCenter({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  let nextId = 0;
  let entries = [];
  const subscribers = new Set();
  const timers = new Map();
  const publish = () => { for (const subscriber of subscribers) subscriber(entries); };
  function dismiss(id) {
    if (timers.has(id)) { cancel(timers.get(id)); timers.delete(id); }
    if (!entries.some(entry => entry.id === id)) return;
    entries = entries.filter(entry => entry.id !== id);
    publish();
  }
  function notify(message, { kind = 'info', duration = kind === 'error' ? 0 : 5000, source = '' } = {}) {
    if (typeof message !== 'string' || !message.trim()) return null;
    if (!['success', 'error', 'warning', 'info'].includes(kind)) throw new TypeError('Invalid notification kind');
    const id = ++nextId;
    entries = [...entries, { id, message, kind, source }];
    if (duration > 0) {
      const timer = schedule(() => dismiss(id), duration);
      timer?.unref?.();
      timers.set(id, timer);
    }
    publish();
    return id;
  }
  return {
    subscribe(subscriber) { subscribers.add(subscriber); subscriber(entries); return () => subscribers.delete(subscriber); },
    notify, dismiss,
    dismissSource(source) { for (const entry of entries.filter(entry => entry.source === source)) dismiss(entry.id); },
    clear() { for (const entry of [...entries]) dismiss(entry.id); }
  };
}
export const notifications = createNotificationCenter();
