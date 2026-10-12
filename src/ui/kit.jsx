import { useEffect, useRef } from 'preact/hooks';
import { memberMap, initials, meId, toasts, dismissToast } from '../state.js';
import { KASSE } from '../model.js';
import { IX } from './icons.jsx';

/** A flatmate as a round fridge magnet. */
export function Magnet({ id, size = 30, label = false }) {
  if (id === KASSE) return <KasseMagnet size={size} />;
  const m = memberMap.value[id];
  const color = m ? m.color % 10 : 'x';
  const text = m ? initials.value[id] || '?' : '?';
  return (
    <span
      class={`magnet magnet--${color}${id === meId.value ? ' magnet--me' : ''}`}
      style={{ '--s': `${size}px` }}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label ? m?.name : undefined}
      role={label ? 'img' : undefined}
    >
      {text}
    </span>
  );
}

export function KasseMagnet({ size = 30 }) {
  return (
    <span class="magnet magnet--kasse" style={{ '--s': `${size}px` }} aria-hidden="true">
      €
    </span>
  );
}

// ---------------------------------------------------------------- marker drawings
// Strokes use pathLength=100 so the .draw animation always runs the full line.

/** Hand-drawn tick box; checked adds a red check that is drawn in. */
export function Box({ checked = false, size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path d="M4.5 5.6 L27 3.8 L28.4 27.2 L5.2 28.6 Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" />
      {checked && (
        <path
          class="draw draw--check"
          pathLength="100"
          d="M7.5 16 L14 23.5 L29 2"
          stroke="var(--red)"
          stroke-width="3.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      )}
    </svg>
  );
}

/** A marker line through the word it sits in (parent must be position: relative). */
export function Strike({ muted = false }) {
  return (
    <svg class="strike" viewBox="0 0 200 24" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
      <path
        class="draw"
        pathLength="100"
        d="M2 14 C 40 7, 80 18, 120 10 S 180 14, 198 8"
        stroke={muted ? 'var(--ink-3)' : 'var(--red)'}
        stroke-width={muted ? 3 : 4.4}
        stroke-linecap="round"
      />
    </svg>
  );
}

/** A red check on its own (chores done). */
export function Check({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path
        class="draw draw--check"
        pathLength="100"
        d="M4 17 L12 25.5 L29 4"
        stroke="currentColor"
        stroke-width="3.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** A loose marker circle, drawn around whatever sits on top of it. */
export function Ring({ width = 40, height = 40, color = 'currentColor', animate = false }) {
  return (
    <svg width={width} height={height} viewBox="0 0 40 40" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
      <path
        class={animate ? 'draw' : undefined}
        pathLength="100"
        d="M21 4 C 31 4, 37 12, 36 21 C 35 31, 27 37, 18 36 C 9 35, 3 27, 4 18 C 5 10, 12 4, 23 5"
        stroke={color}
        stroke-width="2.3"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The big sentence each tab opens with. */
export function Headline({ children, sub }) {
  return (
    <header class="headline">
      <h1>{children}</h1>
      {sub && <div class="headline__sub">{sub}</div>}
    </header>
  );
}

export function Section({ title, aside, children, id }) {
  return (
    <section class="section" aria-labelledby={id}>
      {(title || aside) && (
        <div class="section__head">
          {title && <h2 id={id}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div class="empty">
      <p class="empty__title">{title}</p>
      {children && <p class="empty__text">{children}</p>}
      {action}
    </div>
  );
}

/** Bottom sheet dialog. Closes on Escape and backdrop tap; restores focus. */
export function Sheet({ open, title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector('[data-autofocus]');
    (first || el)?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('noscroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('noscroll');
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <div class="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet${wide ? ' sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div class="sheet__head">
          <h2>{title}</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Schließen">
            <IX />
          </button>
        </div>
        <div class="sheet__body">{children}</div>
        {footer && <div class="sheet__foot">{footer}</div>}
      </div>
    </div>
  );
}

/** One form row. group: wraps several controls (buttons), so it must not be a <label>. */
export function Field({ label, hint, children, error, group = false }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag class="field" role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
      {label && <span class="field__label" aria-hidden={group ? 'true' : undefined}>{label}</span>}
      {children}
      {error ? <span class="field__error">{error}</span> : hint && <span class="field__hint">{hint}</span>}
    </Tag>
  );
}

export function MoneyInput({ value, onInput, placeholder = '0,00', autofocus, label }) {
  return (
    <span class="money">
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        enterkeyhint="done"
        placeholder={placeholder}
        value={value}
        aria-label={label}
        data-autofocus={autofocus ? '' : undefined}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
      <span class="money__eur" aria-hidden="true">€</span>
    </span>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          class={`seg__opt${value === o.value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
          key={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pick one person (optionally the Kasse) or several people, as magnet chips. */
export function People({ list, value, onChange, multi = false, kasse = false, kasseLabel = 'Kasse', label }) {
  const isOn = (id) => (multi ? value.includes(id) : value === id);
  const toggle = (id) => {
    if (!multi) return onChange(id);
    onChange(isOn(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const entries = [...(kasse ? [{ id: KASSE, name: kasseLabel }] : []), ...list];
  return (
    <div class="people" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {entries.map((m) => (
        <button
          type="button"
          key={m.id}
          class={`person${isOn(m.id) ? ' is-on' : ''}`}
          role={multi ? undefined : 'radio'}
          aria-checked={multi ? undefined : isOn(m.id)}
          aria-pressed={multi ? isOn(m.id) : undefined}
          onClick={() => toggle(m.id)}
        >
          <Magnet id={m.id} size={26} />
          <span>{m.id === meId.value ? 'Ich' : m.name}</span>
        </button>
      ))}
    </div>
  );
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" key={t.id} onClick={(e) => e.target === e.currentTarget && dismissToast(t.id)}>
          <span onClick={() => dismissToast(t.id)}>{t.text}</span>
          {t.action && (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                t.onAction?.();
                dismissToast(t.id);
              }}
            >
              {t.action}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Small yes/no sheet for destructive actions. */
export function Confirm({ open, title, text, confirm = 'Löschen', onConfirm, onClose, danger = true }) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            class={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirm}
          </button>
        </>
      }
    >
      {text && <p class="sheet__text">{text}</p>}
    </Sheet>
  );
}

/** Splits text into paragraphs/lines and turns http(s) links into anchors. */
export function RichText({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g);
  return (
    <p class="rich">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a href={p} target="_blank" rel="noopener noreferrer" key={i}>
            {p.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  );
}
