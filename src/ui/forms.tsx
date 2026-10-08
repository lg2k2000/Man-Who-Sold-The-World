import { useEffect, useId, useRef, type ReactNode } from 'react';
import * as f from '../import/fields';

/** The form panel that slides in over the right side of a records view. */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose(): void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer" role="dialog" aria-modal="false" aria-label={title} ref={ref}>
      <div className="panel-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close form">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z" />
          </svg>
        </button>
      </div>
      <div className="drawer-body">{children}</div>
      <div className="drawer-foot">{footer}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** A labeled form field with its error and hint wired to the control for screen readers. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`ffield${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, describedBy)}
      {hint && (
        <div className="fhint" id={hintId}>
          {hint}
        </div>
      )}
      {error && (
        <div className="ferror" id={errId} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** Shows how a states cell reads, region by region, or the first problem in it. */
export function StatesPreview({ value, regionNames }: { value: string; regionNames: Map<string, string> }) {
  if (!value.trim()) return <span className="muted">None</span>;
  try {
    const codes = f.regions(value);
    return (
      <span className="chips">
        {codes.map((c) => (
          <span key={c} className="mini-chip">
            {regionNames.get(c) ?? c}
          </span>
        ))}
      </span>
    );
  } catch (e) {
    return <span className="ferror-inline">{e instanceof Error ? e.message : String(e)}</span>;
  }
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Turns a list of region codes back into the "WA; OR; BC" form the inputs use. */
export function statesText(codes: string[]): string {
  return codes.map((c) => c.slice(3)).join('; ');
}
