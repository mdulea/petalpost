// DOM-free tracker action coordinator: serializes tracker mutations under one re-entrancy lock, disables and
// restores controls without undoing already-disabled controls, manages status messages and reload policies, and stops
// all further reloads and writes once a 410 ended response arrives. Listed in tests/check-dom-free.js.

/**
 * Creates the tracker's serialized action runner.
 * @param {{ load: () => Promise<void>, onEnded?: () => void }} options
 */
export function createTrackerCoordinator({ load, onEnded = undefined }) {
  let busy = false;
  let ended = false;

  function markEnded() {
    if (ended) return;
    ended = true;
    onEnded?.();
  }

  /**
   * Runs one serialized tracker action. Concurrent calls while another action is running or after the invitation ended
   * return `{ ok: false, skipped: true }`.
   * @param {{
   *   controls?: Iterable<{ disabled?: boolean }>,
   *   setStatus?: (text: string) => void,
   *   action: () => Promise<any>,
   *   reload?: 'always' | 'ok' | 'change' | 'none',
   *   onResult?: (result: any) => void,
   *   afterReload?: (result: any) => void,
   *   afterUnlock?: (result: any) => void,
   * }} spec
   */
  async function run({
    controls = [],
    setStatus = undefined,
    action,
    reload = 'always',
    onResult = undefined,
    afterReload = undefined,
    afterUnlock = undefined,
  }) {
    if (busy || ended) return { ok: false, skipped: true };
    busy = true;
    const list = [...controls];
    const toRestore = list.filter((control) => !control.disabled);
    for (const control of list) control.disabled = true;
    setStatus?.('');
    let result = null;
    try {
      result = await action();
      if (result?.status === 410) markEnded();
      if (ended) return result;
      onResult?.(result);
      if (result?.message) setStatus?.(result.message);
      const shouldReload =
        reload === 'always' ||
        (reload === 'ok' && Boolean(result?.ok)) ||
        (reload === 'change' && (Boolean(result?.ok) || result?.status === 409 || result?.status === 404));
      if (shouldReload) {
        await load();
        if (!ended) afterReload?.(result);
      }
      return result;
    } finally {
      for (const control of toRestore) control.disabled = false;
      afterUnlock?.(result);
      busy = false;
    }
  }

  return {
    run,
    markEnded,
    isEnded: () => ended,
    isBusy: () => busy,
  };
}
