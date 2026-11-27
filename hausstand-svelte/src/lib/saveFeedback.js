// The mail outcome is independent of the confirmed project save.
// Only allowlisted response codes are used for user-facing messages.
export function mailFeedback(result) {
  switch (result?.mailStatus) {
    case 'accepted': return {key:'mail.accepted',kind:'success',retryable:false};
    case 'disabled': return {key:'mail.disabled',kind:'info',retryable:false};
    case 'unknown': return {key:'mail.unknown',kind:'warning',retryable:false};
    case 'failed': {
      const allowed = ['configuration','preparation','unavailable','rejected','pending','cooldown'];
      const code = allowed.includes(result.mailErrorCode) ? result.mailErrorCode : 'failed';
      return {key:'mail.'+code,kind:'warning',retryable:result.mailRetryable === true};
    }
    default: return {key:'mail.unknown',kind:'warning',retryable:false};
  }
}
export function confirmedSave(result) {
  return result?.saveStatus === 'saved' && Number.isSafeInteger(result.revision) && result.revision > 0;
}
