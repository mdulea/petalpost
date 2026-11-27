// DOM-free state transitions for host publish results in the editor (success, 409 conflict, 410 ended, 404 deleted
// after live publish, and transient/validation errors). Listed in tests/check-dom-free.js.

/**
 * Classifies a publish API response for credential cred ({id, secret, version}).
 * Returns {action: 'remember' | 'forget' | 'keep', nextCred, outcome: 'published' | 'updated' | null,
 * statusKind: 'ok' | 'conflict' | 'ended' | 'deleted' | 'error', message}.
 */
export function resolvePublishResult(cred, result) {
  if (result.ok) {
    return {
      action: 'remember',
      nextCred: { ...cred, version: result.data.version },
      outcome: cred.version === null ? 'published' : 'updated',
      statusKind: 'ok',
      message: '',
    };
  }
  if (result.status === 409) {
    return {
      action: 'remember',
      nextCred: { ...cred, version: result.data.version },
      outcome: null,
      statusKind: 'conflict',
      message: result.message,
    };
  }
  if (result.status === 410) {
    return {
      action: 'forget',
      nextCred: null,
      outcome: null,
      statusKind: 'ended',
      message: result.message,
    };
  }
  if (result.status === 404 && cred.version !== null) {
    return {
      action: 'forget',
      nextCred: null,
      outcome: null,
      statusKind: 'deleted',
      message: null,
    };
  }
  return {
    action: 'keep',
    nextCred: cred,
    outcome: null,
    statusKind: 'error',
    message: result.message,
  };
}
