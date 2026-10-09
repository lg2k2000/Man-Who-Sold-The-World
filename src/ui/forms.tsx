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

interface TextFieldProps {
  label: string;
  value: string;
  onChange(v: string): void;
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'date';
  mono?: boolean;
}

export function TextField({ label, value, onChange, error, hint, placeholder, type = 'text', mono }: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(fid, d) => (
        <input
          id={fid}
          aria-describedby={d}
          className={`text-input${mono ? ' mono' : ''}`}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, error, rows = 3 }: Omit<TextFieldProps, 'type'> & { rows?: number }) {
  return (
    <Field label={label} error={error}>
      {(fid, d) => (
        <textarea
          id={fid}
          aria-describedby={d}
          className="text-input"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: Option[];
  error?: string;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(fid, d) => (
        <select id={fid} aria-describedby={d} className="text-input" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Source and verified-on, the provenance fields every record form ends with. */
export function ProvenanceFields({
  source,
  setSource,
  verified,
  setVerified,
  errors,
}: {
  source: string;
  setSource(v: string): void;
  verified: string;
  setVerified(v: string): void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <TextField label="Source" value={source} onChange={setSource} error={errors.source} hint="Where this came from, as text or a URL." />
      <Field label="Verified on" error={errors.verified_at}>
        {(fid, d) => (
          <div className="inline">
            <input
              id={fid}
              aria-describedby={d}
              className="text-input"
              type="date"
              value={verified}
              onChange={(e) => setVerified(e.target.value)}
            />
            <button type="button" className="btn small" onClick={() => setVerified(today())}>
              Today
            </button>
          </div>
        )}
      </Field>
    </>
  );
}

/** The drawer footer: status line, save, close, any extra buttons, and delete for an existing record. */
export function FormFooter({
  status,
  saveLabel,
  onSave,
  onClose,
  onDelete,
  children,
}: {
  status: string | null;
  saveLabel: string;
  onSave(): void;
  onClose(): void;
  onDelete?: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      {status && (
        <p className="form-status" role="status">
          {status}
        </p>
      )}
      <div className="btn-row">
        <button type="button" className="btn solid" onClick={onSave}>
          {saveLabel}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        {children}
        {onDelete && (
          <>
            <span className="fb-spacer" />
            <button type="button" className="btn danger" onClick={onDelete}>
              Delete
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** "3 deals" or "1 deal"; "3 companies" or "1 company". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
