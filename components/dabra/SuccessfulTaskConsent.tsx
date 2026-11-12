'use client';
import { useEffect, useRef, useState } from 'react';

type Notice = { noticeVersion: string; noticeSha256: string; text: string; generation: number; expiresAtMs: number };
type State = { ownerId: string; generation: number; granted: boolean; hasConsent: boolean; hasContent: boolean; notice: Notice | null };
/** Optional account control. No default notice or implied consent is rendered. */
export function SuccessfulTaskConsent({ ar, ownerId }: { ar: boolean; ownerId: string }) {
  const [state, setState] = useState<State | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const mutation = useRef<string | null>(null);
  const epoch = useRef(0), active = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { epoch.current++; active.current?.abort(); active.current = null; setState(null); setBusy(false); mutation.current = null; };
    window.addEventListener('focus', clear); document.addEventListener('visibilitychange', clear);
    return () => { clear(); window.removeEventListener('focus', clear); document.removeEventListener('visibilitychange', clear); };
  }, [ownerId]);
  const load = async (version: number, signal: AbortSignal) => {
    const response = await fetch('/api/dabra/tasks/consent', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!response.ok) throw new Error('Unavailable');
    const value: State = await response.json();
    if (version !== epoch.current || signal.aborted) return;
    if (value.ownerId !== ownerId || !Number.isSafeInteger(value.generation) || typeof value.hasConsent !== 'boolean' || typeof value.granted !== 'boolean' || typeof value.hasContent !== 'boolean') throw new Error('Invalid');
    setState(value);
  };
  const perform = async (action?: 'grant' | 'revoke') => {
    if (busy || active.current) return;
    const version = ++epoch.current, controller = new AbortController(); active.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    setBusy(true); setError(false);
    try {
      if (action && state) {
        if (state.ownerId !== ownerId || signal.aborted || version !== epoch.current) throw new Error('Owner changed');
        if (action === 'grant' && (!state.notice || state.notice.expiresAtMs <= Date.now())) throw new Error('Expired');
        mutation.current ??= crypto.randomUUID();
        const body = action === 'revoke' ? { action, generation: state.generation, expectedOwner: ownerId, mutationId: mutation.current } : { action, generation: state.notice!.generation, expectedOwner: ownerId,
          noticeVersion: state.notice!.noticeVersion, noticeSha256: state.notice!.noticeSha256, mutationId: mutation.current };
        const response = await fetch('/api/dabra/tasks/consent', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
        if (version !== epoch.current || signal.aborted) return;
        if (!response.ok) { setState(null); mutation.current = null; throw new Error('Unconfirmed'); }
        mutation.current = null;
      }
      if (version === epoch.current && !signal.aborted) await load(version, signal);
    } catch { if (version === epoch.current) { setState(null); setError(true); } } finally { if (version === epoch.current) { active.current = null; setBusy(false); } }
  };
  return <section>
    <button type="button" disabled={busy} onClick={() => void perform()}>{ar ? 'إدارة الأجوبة المحفوظة' : 'Manage saved answers'}</button>
    {error && <p role="status">{ar ? 'تعذر تأكيد الحالة. أعد تحميلها أو أعد المحاولة نفسها.' : 'State could not be confirmed. Reload or retry the same action.'}</p>}
    {state?.ownerId === ownerId && state.notice && !state.granted && <div>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{state.notice.text}</p>
      <button type="button" disabled={busy} onClick={() => void perform('grant')}>{ar ? 'تأكيد الموافقة على الإشعار المعروض' : 'Confirm consent to the displayed notice'}</button>
    </div>}
    {state?.ownerId === ownerId && (state.hasConsent || state.hasContent) && <button type="button" disabled={busy} onClick={() => void perform('revoke')}>
      {ar ? 'سحب الموافقة وحذف محتوى الأجوبة المحفوظة' : 'Withdraw consent and delete saved answer content'}
    </button>}
  </section>;
}
