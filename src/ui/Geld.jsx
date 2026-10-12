import { useState } from 'preact/hooks';
import {
  ctx, summary, balances, transferPlan, activeMembers, members, meId, txs, txsReady, txLimit, wg,
  boughtItems, name, nameDat, nameAcc, joinNames, run, toast, clock, sync,
} from '../state.js';
import {
  KASSE, formatMoney, parseMoney, splitEvenly, monthKey, monthLabel, shiftMonth, dayKey, dayLabel, relTime,
  computeSummary, summariesEqual,
} from '../model.js';
import { Headline, Section, Sheet, Magnet, KasseMagnet, People, MoneyInput, Field, Segmented, Confirm, Empty } from './kit.jsx';
import { IPlus, ICart, IReceipt, ISwap, IJar, IScale, ICheck, IRefresh } from './icons.jsx';

export function Geld() {
  const me = meId.value;
  const bal = balances.value;
  const my = bal[me] || 0;
  const plan = transferPlan.value;
  const kasse = summary.value?.kasse || 0;
  const [form, setForm] = useState(null); // { mode, tx? }
  const [detail, setDetail] = useState(null);
  const [settle, setSettle] = useState(null);

  const mine = plan.filter((p) => p.from === me || p.to === me);
  const sub = mine.slice(0, 3).map((p) =>
    p.from === me ? `Du zahlst ${name(p.to)} ${formatMoney(p.amount)}.` : `${name(p.from, { cap: true })} zahlt dir ${formatMoney(p.amount)}.`,
  );
  if (mine.length > 3) sub.push(`Und ${mine.length - 3} weitere Zahlungen.`);
  if (!mine.length) sub.push(`In der Kasse ${kasse === 1 || kasse === -1 ? 'ist' : 'sind'} ${formatMoney(kasse)}.`);

  return (
    <>
      <Headline sub={sub.join(' ')}>
        {my > 0 ? `Du bekommst ${formatMoney(my)}.` : my < 0 ? `Du schuldest ${formatMoney(-my)}.` : 'Du bist ausgeglichen.'}
      </Headline>

      <Consistency />

      {plan.length > 0 && (
        <Section title="So wird ausgeglichen" id="ausgleich">
          <ul class="list">
            {plan.map((p) => (
              <li class={`row${p.from === me || p.to === me ? ' is-mine' : ''}`} key={`${p.from}-${p.to}`}>
                <span class="pair">
                  <Magnet id={p.from} size={30} />
                  <Magnet id={p.to} size={30} />
                </span>
                <span class="row__main">
                  {p.from === me ? 'Du zahlst ' : `${name(p.from)} zahlt `}
                  <strong>{p.to === me ? 'dir' : name(p.to)}</strong>
                  <span class="amount row__amount">{formatMoney(p.amount)}</span>
                </span>
                <button type="button" class="btn btn--small" onClick={() => setSettle(p)}>
                  Bezahlt
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <KasseSection onDeposit={() => setForm({ mode: 'deposit' })} />

      <Balances />

      <Section title="Verlauf" id="verlauf">
        <TxList onOpen={setDetail} />
      </Section>

      <button type="button" class="fab" aria-label="Neue Buchung" onClick={() => setForm({ mode: 'expense' })}>
        <IPlus size={28} />
      </button>

      {form && <TxForm init={form} onClose={() => setForm(null)} />}
      {detail && (
        <TxDetail
          tx={txs.value.find((t) => t.id === detail.id) || detail}
          onClose={() => setDetail(null)}
          onEdit={(tx) => {
            setDetail(null);
            setForm({ mode: tx.type === 'adjust' ? 'adjust' : tx.type, tx });
          }}
        />
      )}
      {settle && <SettleSheet plan={settle} onClose={() => setSettle(null)} />}
    </>
  );
}

function KasseSection({ onDeposit }) {
  const me = meId.value;
  const kasse = summary.value?.kasse || 0;
  const monthly = wg.value?.kasseMonthly || 0;
  const mk = monthKey(new Date(clock.value));
  const contrib = summary.value?.contrib?.[mk] || {};
  const people = activeMembers.value;
  const paidCount = people.filter((m) => (contrib[m.id] || 0) >= monthly).length;
  return (
    <Section title="WG-Kasse" id="kasse">
      <div class="kasse">
        <KasseMagnet size={46} />
        <div class="kasse__text">
          <div class={`kasse__amount${kasse < 0 ? ' minus' : ''}`}>{formatMoney(kasse)}</div>
          <div class="muted">{kasse < 0 ? 'Die Kasse ist im Minus. Zeit zum Einzahlen.' : 'sind in der Kasse'}</div>
        </div>
        <button type="button" class="btn btn--small" onClick={onDeposit}>
          Einzahlen
        </button>
      </div>
      {monthly > 0 && (
        <div class="contrib">
          <p class="contrib__line">
            {monthLabel(mk, { withYear: false })}: {paidCount} von {people.length} haben ihren Beitrag von {formatMoney(monthly)} eingezahlt.
          </p>
          <ul class="contrib__list">
            {people.map((m) => {
              const paid = contrib[m.id] || 0;
              const ok = paid >= monthly;
              return (
                <li class={ok ? 'is-paid' : ''} key={m.id}>
                  <Magnet id={m.id} size={28} />
                  <span class="contrib__name">{m.id === me ? 'Du' : m.name}</span>
                  {ok ? (
                    <span class="contrib__ok">
                      <ICheck size={18} /> bezahlt
                    </span>
                  ) : (
                    <span class="muted">{formatMoney(monthly - paid)} offen</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Balances() {
  const me = meId.value;
  const bal = balances.value;
  const people = [...activeMembers.value, ...members.value.filter((m) => m.active === false && bal[m.id])];
  if (!people.length) return null;
  const max = Math.max(1, ...people.map((m) => Math.abs(bal[m.id] || 0)));
  return (
    <Section title="Salden" id="salden">
      <ul class="bars">
        {people.map((m) => {
          const v = bal[m.id] || 0;
          const w = (Math.abs(v) / max) * 50;
          return (
            <li class="bar" key={m.id}>
              <Magnet id={m.id} size={26} />
              <span class="bar__name">
                {m.id === me ? 'Du' : m.name}
                {m.active === false && <span class="muted"> (ausgezogen)</span>}
              </span>
              <span class="bar__track" aria-hidden="true">
                {v !== 0 && <span class={`bar__fill ${v < 0 ? 'is-minus' : 'is-plus'}`} style={{ width: `${w}%`, [v < 0 ? 'right' : 'left']: '50%' }} />}
              </span>
              <span class={`bar__val ${v < 0 ? 'minus' : v > 0 ? 'plus' : ''}`}>{formatMoney(v, { signed: true })}</span>
            </li>
          );
        })}
      </ul>
      <p class="fineprint">Plus heißt: bekommt Geld. Minus heißt: schuldet Geld.</p>
    </Section>
  );
}

const TX_ICON = { shopping: ICart, expense: IReceipt, transfer: ISwap, deposit: IJar, adjust: IScale };

export function txIcon(t) {
  return TX_ICON[t.kind === 'shopping' ? 'shopping' : t.type] || IReceipt;
}

function forWhom(split) {
  const active = activeMembers.value.map((m) => m.id);
  const ids = split || [];
  if (ids.length >= active.length && active.every((id) => ids.includes(id))) return 'für alle';
  const names = ids.map((id) => (id === meId.value ? 'dich' : name(id)));
  return `für ${joinNames(names)}`;
}

export function txSentence(t) {
  const me = meId.value;
  switch (t.type) {
    case 'expense':
      if (t.paidBy === KASSE) return 'Aus der Kasse bezahlt';
      return `${name(t.paidBy, { cap: true })} ${t.paidBy === me ? 'hast' : 'hat'} bezahlt, ${forWhom(t.split)}`;
    case 'deposit':
      return `${name(t.member, { cap: true })} ${t.member === me ? 'hast' : 'hat'} eingezahlt`;
    case 'transfer':
      return `${name(t.from, { cap: true })} an ${nameAcc(t.to)}`;
    case 'adjust':
      return 'Kassenstand angepasst';
    default:
      return '';
  }
}

const TITLES = { deposit: 'Einzahlung in die Kasse', transfer: 'Rückzahlung', adjust: 'Kassenstand korrigiert', expense: 'Ausgabe' };

/** Display title; monthly contributions are always "Beitrag <Monat>". */
export function txTitle(t) {
  if (t.type === 'deposit' && t.month) return `Beitrag ${monthLabel(t.month, { withYear: false })}`;
  return t.title || TITLES[t.type];
}

function TxList({ onOpen }) {
  const me = meId.value;
  const list = txs.value;
  if (!txsReady.value) return <p class="muted">Lädt …</p>;
  if (!list.length) {
    return (
      <Empty title="Noch keine Buchungen.">
        Trag Einkäufe über die Liste ein oder tipp unten rechts auf Plus.
      </Empty>
    );
  }
  const days = [];
  for (const t of list) {
    const last = days[days.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else days.push({ date: t.date, items: [t] });
  }
  return (
    <>
      {days.map((d) => (
        <div key={d.date}>
          <h3 class="day">{dayLabel(d.date, new Date(clock.value))}</h3>
          <ul class="list">
            {d.items.map((t) => {
              const Icon = txIcon(t);
              const share = t.type === 'expense' && t.paidBy !== KASSE ? splitEvenly(t.amount, t.split)[me] : null;
              const signed = t.type === 'adjust';
              return (
                <li key={t.id}>
                  <button type="button" class="tx" onClick={() => onOpen(t)}>
                    <span class="tx__icon">
                      <Icon size={20} />
                    </span>
                    <span class="tx__main">
                      <span class="tx__title">{txTitle(t)}</span>
                      <span class="tx__sub">{txSentence(t)}</span>
                    </span>
                    <span class="tx__right">
                      <span class="tx__amount">{formatMoney(t.amount, { signed })}</span>
                      {share ? <span class="tx__share">dein Anteil {formatMoney(share)}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {list.length >= txLimit.value && (
        <button type="button" class="btn btn--block more" onClick={() => (txLimit.value += 100)}>
          Ältere Buchungen laden
        </button>
      )}
    </>
  );
}

/** Warns when the running totals and the transactions disagree (only checkable when all are loaded). */
function Consistency() {
  const [busy, setBusy] = useState(false);
  if (!txsReady.value || txs.value.length >= txLimit.value || sync.value.pending || !summary.value) return null;
  const s = summary.value;
  const ok = summariesEqual({ balances: s.balances || {}, kasse: s.kasse || 0, contrib: s.contrib || {} }, computeSummary(txs.value));
  if (ok) return null;
  return (
    <div class="notice" role="alert">
      <p>Die Salden passen nicht zu den Buchungen. Das passiert, wenn zwei Handys gleichzeitig offline dieselbe Buchung geändert haben.</p>
      <button
        type="button"
        class="btn btn--small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await ctx.api.recomputeSummary();
            toast('Salden neu berechnet.');
          } catch (e) {
            toast('Neu berechnen geht nur mit Internet.');
          }
          setBusy(false);
        }}
      >
        <IRefresh size={18} /> Neu berechnen
      </button>
    </div>
  );
}

function TxDetail({ tx, onClose, onEdit }) {
  const me = meId.value;
  const [confirm, setConfirm] = useState(false);
  const shares = tx.type === 'expense' && tx.paidBy !== KASSE ? splitEvenly(tx.amount, tx.split) : null;
  const itemNames = (tx.itemIds || []).map((id) => boughtItems.value.find((i) => i.id === id)?.text).filter(Boolean);
  return (
    <>
      <Sheet
        open={!confirm}
        title={txTitle(tx)}
        onClose={onClose}
        footer={
          <>
            <button type="button" class="btn btn--danger" onClick={() => setConfirm(true)}>
              Löschen
            </button>
            <button type="button" class="btn" onClick={() => onEdit(tx)}>
              Bearbeiten
            </button>
          </>
        }
      >
        <div class="receipt">
          <div class="receipt__date">{dayLabel(tx.date, new Date(clock.value))}</div>
          <div class="receipt__total">{formatMoney(tx.amount, { signed: tx.type === 'adjust' })}</div>
          <p class="receipt__line">{txSentence(tx)}.</p>
          {shares && (
            <ul class="receipt__shares">
              {Object.entries(shares).map(([id, v]) => (
                <li key={id} class={id === me ? 'is-me' : ''}>
                  <span>{id === me ? 'Dein Anteil' : `Anteil ${name(id)}`}</span>
                  <span class="amount">{formatMoney(v)}</span>
                </li>
              ))}
            </ul>
          )}
          {itemNames.length > 0 && <p class="receipt__items">{itemNames.join(', ')}</p>}
          <p class="receipt__meta">
            Eingetragen von {nameDat(tx.createdBy)}, {relTime(tx.createdAt, clock.value)}
            {tx.updatedAt ? `, zuletzt geändert ${relTime(tx.updatedAt, clock.value)}` : ''}.
          </p>
        </div>
      </Sheet>
      <Confirm
        open={confirm}
        title="Buchung löschen?"
        text="Die Salden werden sofort angepasst. Das lässt sich nicht rückgängig machen."
        onConfirm={() => {
          run(ctx.api.deleteTx(tx), 'Löschen');
          toast('Buchung gelöscht.');
          onClose();
        }}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}

function SettleSheet({ plan, onClose }) {
  const me = meId.value;
  const [amount, setAmount] = useState(String((plan.amount / 100).toFixed(2)).replace('.', ','));
  const [tried, setTried] = useState(false);
  const cents = parseMoney(amount);
  const err = !cents || cents <= 0 ? 'Bitte einen Betrag wie 12,40 eingeben.' : null;
  const fromText = plan.from === me ? 'Du hast' : `${name(plan.from)} hat`;
  return (
    <Sheet
      open
      title="Rückzahlung eintragen"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            class="btn btn--primary"
            onClick={() => {
              setTried(true);
              if (err) return;
              run(ctx.api.addTx({ type: 'transfer', from: plan.from, to: plan.to, amount: cents, title: 'Rückzahlung' }, me));
              toast('Rückzahlung eingetragen.');
              onClose();
            }}
          >
            Eintragen
          </button>
        </>
      }
    >
      <p class="sheet__text">
        {fromText} {plan.to === me ? 'dir' : name(plan.to)} Geld gegeben? Bei einer Teilzahlung einfach den Betrag ändern.
      </p>
      <Field label="Betrag" error={tried && err}>
        <MoneyInput value={amount} onInput={setAmount} autofocus label="Betrag" />
      </Field>
    </Sheet>
  );
}

/** Count the cash, type the real amount, the app books the difference. */
export function KasseFixSheet({ onClose }) {
  const me = meId.value;
  const kasse = summary.value?.kasse || 0;
  const [value, setValue] = useState('');
  const [tried, setTried] = useState(false);
  const cents = parseMoney(value);
  const err = cents === null ? 'Bitte den gezählten Betrag eingeben, z. B. 23,50.' : null;
  return (
    <Sheet
      open
      title="Kassenstand korrigieren"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            class="btn btn--primary"
            onClick={() => {
              setTried(true);
              if (err) return;
              const delta = cents - kasse;
              if (delta) run(ctx.api.addTx({ type: 'adjust', amount: delta, title: 'Kassenstand korrigiert' }, me));
              toast(delta ? `Kasse auf ${formatMoney(cents)} gesetzt.` : 'Der Kassenstand stimmt schon.');
              onClose();
            }}
          >
            Übernehmen
          </button>
        </>
      }
    >
      <p class="sheet__text">Laut App sind {formatMoney(kasse)} in der Kasse. Wie viel ist wirklich drin?</p>
      <Field label="Gezählter Betrag" error={tried && err}>
        <MoneyInput value={value} onInput={setValue} autofocus label="Gezählter Betrag" />
      </Field>
    </Sheet>
  );
}

function centsToInput(c) {
  return c ? (Math.abs(c) / 100).toFixed(2).replace('.', ',') : '';
}

/** New or edited transaction: expense, deposit into the Kasse, or paying someone back. */
function TxForm({ init, onClose }) {
  const me = meId.value;
  const editing = init.tx || null;
  const people = activeMembers.value;
  const allIds = people.map((m) => m.id);
  const monthly = wg.value?.kasseMonthly || 0;
  const cur = monthKey(new Date(clock.value));
  const [mode, setMode] = useState(init.mode);
  const [title, setTitle] = useState(editing?.title || '');
  const [amount, setAmount] = useState(
    editing
      ? (editing.type === 'adjust' && editing.amount < 0 ? '-' : '') + centsToInput(editing.amount)
      : init.mode === 'deposit' && monthly
        ? centsToInput(monthly)
        : '',
  );
  const [date, setDate] = useState(editing?.date || dayKey());
  const [paidBy, setPaidBy] = useState(editing?.paidBy || me);
  const [split, setSplit] = useState(editing?.split || allIds);
  const [member, setMember] = useState(editing?.member || me);
  const [month, setMonth] = useState(editing ? editing.month || '' : monthly ? cur : '');
  const [from, setFrom] = useState(editing?.from || me);
  const [to, setTo] = useState(editing?.to || allIds.find((id) => id !== me) || me);
  const [tried, setTried] = useState(false);

  const cents = parseMoney(amount);
  const errors = {};
  if (mode !== 'adjust' && (!cents || cents <= 0)) errors.amount = 'Bitte einen Betrag wie 12,40 eingeben.';
  if (mode === 'adjust' && !cents) errors.amount = 'Bitte einen Betrag eingeben.';
  if (mode === 'expense' && !title.trim()) errors.title = 'Wofür war das?';
  if (mode === 'expense' && paidBy !== KASSE && !split.length) errors.split = 'Wähle mindestens eine Person.';
  if (mode === 'transfer' && from === to) errors.to = 'Wähle eine andere Person.';

  const build = () => {
    if (mode === 'expense') {
      return { type: 'expense', title: title.trim(), amount: cents, date, paidBy, split: paidBy === KASSE ? allIds : split, kind: editing?.kind || 'manual' };
    }
    if (mode === 'deposit') {
      return { type: 'deposit', title: month ? `Beitrag ${monthLabel(month, { withYear: false })}` : title.trim() || 'Einzahlung', amount: cents, date, member, month: month || null };
    }
    if (mode === 'transfer') return { type: 'transfer', title: 'Rückzahlung', amount: cents, date, from, to };
    return { type: 'adjust', title: 'Kassenstand korrigiert', amount: cents, date };
  };

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const tx = build();
    if (editing) {
      run(ctx.api.updateTx(editing, tx, me));
      toast('Änderung gespeichert.');
    } else {
      run(ctx.api.addTx(tx, me));
      toast({ expense: 'Ausgabe gespeichert.', deposit: 'Einzahlung gespeichert.', transfer: 'Rückzahlung gespeichert.', adjust: 'Gespeichert.' }[mode]);
    }
    onClose();
  };

  const shares = mode === 'expense' && paidBy !== KASSE && cents > 0 && split.length ? Object.values(splitEvenly(cents, split)) : [];
  const perHead = shares.length
    ? Math.min(...shares) === Math.max(...shares)
      ? `${formatMoney(shares[0])} pro Person`
      : `${formatMoney(Math.min(...shares))} bis ${formatMoney(Math.max(...shares))} pro Person`
    : null;
  const months = [shiftMonth(cur, -1), cur, shiftMonth(cur, 1)];
  const titleFor = { expense: 'Ausgabe', deposit: 'Einzahlung', transfer: 'Rückzahlung', adjust: 'Kassenstand' };

  return (
    <Sheet
      open
      title={editing ? `${titleFor[mode]} bearbeiten` : 'Neue Buchung'}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" class="btn btn--primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      {!editing && (
        <Segmented
          label="Art der Buchung"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setTried(false);
            if (m === 'deposit' && !amount && monthly) setAmount(centsToInput(monthly));
          }}
          options={[
            { value: 'expense', label: 'Ausgabe' },
            { value: 'deposit', label: 'Einzahlung' },
            { value: 'transfer', label: 'Rückzahlung' },
          ]}
        />
      )}

      {mode === 'expense' && (
        <>
          <Field label="Wofür?" error={tried && errors.title}>
            <input class="input" type="text" value={title} placeholder="z. B. Wocheneinkauf, Pizza, Internet" onInput={(e) => setTitle(e.currentTarget.value)} data-autofocus />
          </Field>
          <Field label="Betrag" error={tried && errors.amount} hint={perHead}>
            <MoneyInput value={amount} onInput={setAmount} label="Betrag" />
          </Field>
          <Field group label="Bezahlt von">
            <People kasse list={people} value={paidBy} onChange={setPaidBy} label="Bezahlt von" />
          </Field>
          {paidBy === KASSE ? (
            <p class="sheet__hint">Wird vom Kassenstand abgezogen und gilt für alle.</p>
          ) : (
            <Field group label="Für wen?" error={tried && errors.split}>
              <People multi list={people} value={split} onChange={setSplit} label="Für wen?" />
            </Field>
          )}
        </>
      )}

      {mode === 'deposit' && (
        <>
          <Field group label="Wer zahlt ein?">
            <People list={people} value={member} onChange={setMember} label="Wer zahlt ein?" />
          </Field>
          <Field label="Betrag" error={tried && errors.amount}>
            <MoneyInput value={amount} onInput={setAmount} autofocus label="Betrag" />
          </Field>
          <Field label="Wofür?">
            <select class="input" value={month} onChange={(e) => setMonth(e.currentTarget.value)}>
              {months.map((m) => (
                <option value={m} key={m}>
                  Beitrag {monthLabel(m)}
                </option>
              ))}
              <option value="">Sonstige Einzahlung</option>
            </select>
          </Field>
        </>
      )}

      {mode === 'transfer' && (
        <>
          <Field group label="Wer hat gezahlt?">
            <People list={people} value={from} onChange={setFrom} label="Wer hat gezahlt?" />
          </Field>
          <Field group label="An wen?" error={tried && errors.to}>
            <People list={people} value={to} onChange={setTo} label="An wen?" />
          </Field>
          <Field label="Betrag" error={tried && errors.amount}>
            <MoneyInput value={amount} onInput={setAmount} autofocus label="Betrag" />
          </Field>
        </>
      )}

      {mode === 'adjust' && (
        <Field label="Änderung des Kassenstands" error={tried && errors.amount} hint="Negativ, wenn weniger in der Kasse war.">
          <MoneyInput value={amount} onInput={setAmount} label="Betrag" />
        </Field>
      )}

      <Field label="Datum">
        <input class="input" type="date" value={date} max={dayKey()} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} />
      </Field>
    </Sheet>
  );
}
