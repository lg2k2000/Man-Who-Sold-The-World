import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { downloadText } from './download';

// In-page dialogs. The browser's own confirm() is not available everywhere the
// app runs (sandboxed frames return false without asking), and some frames
// block downloads, so confirmations and exports both happen inside the page.

interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  resolve(ok: boolean): void;
}

interface ExportRequest {
  kind: 'export';
  title: string;
  fileName: string;
  text: string;
  hint: string;
}

type Request = ConfirmRequest | ExportRequest;

const useDialogs = create<{ current: Request | null; set(r: Request | null): void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));

/** Asks the viewer to confirm inside the page. Resolves true only on the confirm button. */
export function askConfirm(opts: { title: string; body: string; confirmLabel: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.getState().current?.kind === 'confirm' && (useDialogs.getState().current as ConfirmRequest).resolve(false);
    useDialogs.getState().set({ kind: 'confirm', danger: false, ...opts, resolve });
  });
}

/** Offers a file both as a download and as text to copy, since some frames block downloads. */
export function showExport(opts: { title: string; fileName: string; text: string; hint: string }) {
  useDialogs.getState().set({ kind: 'export', ...opts });
}

export function Dialogs() {
  const current = useDialogs((s) => s.current);
  const set = useDialogs((s) => s.set);
  const returnTo = useRef<HTMLElement | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');

  const close = (ok = false) => {
    if (current?.kind === 'confirm') current.resolve(ok);
    set(null);
    setCopied('idle');
    returnTo.current?.focus();
  };

  useEffect(() => {
    if (!current) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // close depends on current; re-run when the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-body">
        <h2 id="dialog-title">{current.title}</h2>
        {current.kind === 'confirm' ? (
          <>
            <p id="dialog-body">{current.body}</p>
            <div className="btn-row end">
              <button type="button" className="btn" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                ref={primary}
                type="button"
                className={`btn ${current.danger ? 'danger-solid' : 'solid'}`}
                onClick={() => close(true)}
              >
                {current.confirmLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="dialog-body">{current.hint}</p>
            <textarea
              className="text-input export-text"
              readOnly
              rows={10}
              aria-label={`Contents of ${current.fileName}`}
              value={current.text}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="muted small" role="status">
              {copied === 'ok'
                ? `Copied. Paste it into a file named ${current.fileName}.`
                : copied === 'failed'
                  ? 'This browser blocked copying. Click in the box, select all, and copy by hand.'
                  : `If the download does nothing here, copy the text and save it as ${current.fileName}.`}
            </p>
            <div className="btn-row end">
              <button type="button" className="btn" onClick={() => close(false)}>
                Close
              </button>
              <button type="button" className="btn" onClick={() => copy(current.text)}>
                Copy text
              </button>
              <button ref={primary} type="button" className="btn solid" onClick={() => downloadText(current.fileName, current.text)}>
                Download file
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
