import { useMemo, useRef, useState } from 'preact/hooks';
import {
  ctx, openItems, boughtItems, activeMembers, meId, name, nameDat, joinNames, run, toast, clock, visitSeen,
} from '../state.js';
import { guessKasse, suggest, relTime, parseMoney, formatMoney, KASSE, normalizeText, splitEvenly } from '../model.js';
import { Headline, Sheet, Magnet, People, MoneyInput, Field, Box, Strike } from './kit.jsx';
import { IPlus, ITrash, IPencil, IHand, ICart } from './icons.jsx';

const plural = (n, one, many) => (n === 1 ? one : many.replace('#', n));

export function Liste() {
  const me = meId.value;
  const items = [...openItems.value].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const missing = items.filter((i) => i.state === 'open');
  const mine = items.filter((i) => i.state === 'cart' && i.cartBy === me);
  const othersShopping = [...new Set(items.filter((i) => i.state === 'cart' && i.cartBy !== me).map((i) => i.cartBy))];
  const [actionItem, setActionItem] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const since = visitSeen.value.liste ?? Infinity;

  const kasseCount = missing.filter((i) => i.kasse).length;
  const sub = [];
  if (missing.length && kasseCount) {
    sub.push(kasseCount === missing.length ? 'Alles davon zahlt die Kasse.' : `${kasseCount} davon zahlt die Kasse.`);
  }
  if (othersShopping.length) {
    const who = othersShopping.map((id) => name(id));
    sub.push(`${joinNames(who)} ${who.length === 1 ? 'ist' : 'sind'} gerade einkaufen.`);
  }
  if (mine.length) sub.push(`Du hast ${plural(mine.length, 'eine Sache', '# Sachen')} abgehakt.`);
  if (!items.length) sub.push('Schreib auf, was fehlt. Alle sehen es sofort.');

  let head = plural(missing.length, '1 Sache fehlt.', '# Sachen fehlen.');
  if (!items.length) head = 'Alles da.';
  else if (!missing.length) head = 'Alles im Korb.';

  const tick = (it, inOther) => {
    if (inOther) {
      toast(`${name(it.cartBy, { cap: true })} hat das schon im Korb.`);
      return;
    }
    run(ctx.api.toggleCart(it, me));
  };

  return (
    <>
      <Headline sub={sub.join(' ')}>{head}</Headline>

      <Adder />

      {items.length > 0 && (
        <ul class="list" aria-label="Einkaufsliste">
          {items.map((it) => {
            const inMine = it.state === 'cart' && it.cartBy === me;
            const inOther = it.state === 'cart' && it.cartBy !== me;
            let meta;
            if (inMine) meta = 'In deinem Korb';
            else if (inOther) meta = `${name(it.cartBy, { cap: true })} hat das im Korb`;
            else if (it.claimedBy) meta = it.claimedBy === me ? 'Du holst das' : `${name(it.claimedBy)} holt das`;
            else meta = `${name(it.addedBy, { cap: true })}, ${relTime(it.addedAt, clock.value)}`;
            return (
              <li class={`item${inMine ? ' is-mine' : ''}${inOther ? ' is-other' : ''}`} key={it.id}>
                <button
                  type="button"
                  class="tick"
                  aria-pressed={inMine ? 'true' : 'false'}
                  aria-label={inOther ? `${it.text}, im Korb von ${name(it.cartBy)}` : `${it.text} abhaken`}
                  onClick={() => tick(it, inOther)}
                >
                  {inOther ? <Magnet id={it.cartBy} size={28} /> : <Box checked={inMine} />}
                </button>
                <button type="button" class="item__main" onClick={() => setActionItem(it)}>
                  <span class="item__line">
                    <span class="item__word">
                      {it.text}
                      {(inMine || inOther) && <Strike muted={inOther} />}
                    </span>
                    {it.addedAt > since && it.addedBy !== me && !inMine && <span class="tag tag--new">neu</span>}
                  </span>
                  <span class="item__meta">{meta}</span>
                </button>
                {it.kasse && <span class="tag tag--kasse">Kasse</span>}
                {it.state === 'open' && it.claimedBy && it.claimedBy !== me && <Magnet id={it.claimedBy} size={28} />}
              </li>
            );
          })}
        </ul>
      )}

      {mine.length > 0 && (
        <div class="checkout-bar">
          <button type="button" class="btn btn--primary btn--block btn--tall" onClick={() => setCheckout(true)}>
            Einkauf abschließen ({mine.length})
          </button>
        </div>
      )}

      <History />

      <ItemSheet item={actionItem} onClose={() => setActionItem(null)} />
      <Checkout open={checkout} items={mine} onClose={() => setCheckout(false)} />
    </>
  );
}

function Adder() {
  const me = meId.value;
  const [text, setText] = useState('');
  const [kasse, setKasse] = useState(false);
  const [touched, setTouched] = useState(false);
  const ref = useRef(null);
  const onList = openItems.value.map((i) => i.text);
  const history = boughtItems.value;
  const kasseOf = useMemo(() => {
    const m = new Map();
    for (const h of history) if (!m.has(h.text.toLowerCase())) m.set(h.text.toLowerCase(), !!h.kasse);
    return m;
  }, [history]);
  const chips = suggest(text, history.map((h) => h.text), onList, 6);

  const add = (raw, k) => {
    const t = normalizeText(raw);
    if (!t) return;
    const existing = onList.find((x) => x.toLowerCase() === t.toLowerCase());
    if (existing) {
      toast(`${existing} steht schon auf der Liste.`);
    } else {
      run(ctx.api.addItem({ text: t, kasse: k, by: me }));
    }
    setText('');
    setKasse(false);
    setTouched(false);
    ref.current?.focus();
  };

  return (
    <div class="adder-wrap">
      <form
        class="adder"
        onSubmit={(e) => {
          e.preventDefault();
          add(text, kasse);
        }}
      >
        <input
          ref={ref}
          type="text"
          value={text}
          placeholder="Was fehlt?"
          aria-label="Was fehlt?"
          enterkeyhint="done"
          autocomplete="off"
          autocapitalize="sentences"
          onInput={(e) => {
            const v = e.currentTarget.value;
            setText(v);
            if (!touched) setKasse(guessKasse(v));
          }}
        />
        <button
          type="button"
          class="kasse-toggle"
          aria-pressed={kasse ? 'true' : 'false'}
          title="Zahlt die WG-Kasse"
          onClick={() => {
            setKasse(!kasse);
            setTouched(true);
          }}
        >
          {kasse && (
            <svg viewBox="0 0 74 48" fill="none" aria-hidden="true">
              <path
                class="draw"
                pathLength="100"
                d="M10 25 C 8 12, 30 6, 51 8 C 67 10, 69 31, 55 38 C 39 44, 12 41, 9 28 C 8 21, 14 14, 24 12"
                stroke="var(--red)"
                stroke-width="2.4"
                stroke-linecap="round"
              />
            </svg>
          )}
          Kasse
        </button>
        <button type="submit" class="add-btn" aria-label="Hinzufügen" disabled={!text.trim()}>
          <svg width="42" height="42" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M20 4 C 30 3, 37 10, 36 20 C 35 30, 28 37, 19 36 C 10 35, 4 28, 5 19 C 6 11, 12 5, 22 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <path d="M20 12.5 L20.4 27.5 M12.5 20.2 L27.5 19.6" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
        </button>
      </form>
      {chips.length > 0 && (
        <div class="chips" aria-label={text ? 'Vorschläge' : 'Oft gekauft'}>
          {chips.map((c) => (
            <button
              type="button"
              class="chip"
              key={c}
              onClick={() => add(c, kasseOf.get(c.toLowerCase()) ?? guessKasse(c))}
            >
              + {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function History() {
  const me = meId.value;
  const onList = new Set(openItems.value.map((i) => i.text.toLowerCase()));
  const seen = new Set();
  const list = [];
  for (const it of boughtItems.value) {
    const k = it.text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    list.push(it);
  }
  if (!list.length) return null;
  return (
    <details class="history">
      <summary>Zuletzt gekauft</summary>
      <ul class="list">
        {list.map((it) => (
          <li class="hist" key={it.id}>
            <span class="hist__text">
              <span>{it.text}</span>
              <span class="hist__meta">
                {name(it.boughtBy, { cap: true })}, {relTime(it.boughtAt, clock.value)}
              </span>
            </span>
            <button
              type="button"
              class="icon-btn"
              aria-label={`${it.text} wieder auf die Liste`}
              disabled={onList.has(it.text.toLowerCase())}
              onClick={() => {
                run(ctx.api.addItem({ text: it.text, kasse: it.kasse, by: me }));
                toast(`${it.text} steht wieder auf der Liste.`);
              }}
            >
              <IPlus />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ItemSheet({ item, onClose }) {
  const me = meId.value;
  const [editing, setEditing] = useState(null);
  if (!item) return null;
  const close = () => {
    setEditing(null);
    onClose();
  };
  const remove = () => {
    run(ctx.api.deleteItem(item.id), 'Löschen');
    toast(`${item.text} gelöscht.`, { action: 'Rückgängig', onAction: () => run(ctx.api.restoreItem(item)) });
    close();
  };
  return (
    <Sheet open title={item.text} onClose={close}>
      <p class="sheet__text">
        Aufgeschrieben von {nameDat(item.addedBy)}, {relTime(item.addedAt, clock.value)}.
        {item.claimedBy && item.claimedBy !== me && ` ${name(item.claimedBy)} holt das.`}
      </p>
      {editing !== null ? (
        <form
          class="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalizeText(editing)) run(ctx.api.editItem(item.id, { text: editing }));
            close();
          }}
        >
          <input class="input" value={editing} data-autofocus onInput={(e) => setEditing(e.currentTarget.value)} aria-label="Neuer Name" />
          <button type="submit" class="btn btn--primary">
            Speichern
          </button>
        </form>
      ) : (
        <div class="actions">
          {item.claimedBy === me ? (
            <button type="button" class="action" onClick={() => (run(ctx.api.claimItem(item.id, null)), close())}>
              <IHand /> Doch nicht, ich hol das nicht
            </button>
          ) : (
            <button type="button" class="action" onClick={() => (run(ctx.api.claimItem(item.id, me)), close())}>
              <IHand /> Ich hol das
            </button>
          )}
          <button type="button" class="action" onClick={() => (run(ctx.api.toggleCart(item, me)), close())}>
            <ICart /> In meinen Korb
          </button>
          <label class="action action--switch">
            <span class="action__label">
              <span class="magnet magnet--kasse" style={{ '--s': '24px' }} aria-hidden="true">€</span> Zahlt die Kasse
            </span>
            <input
              type="checkbox"
              class="switch"
              checked={!!item.kasse}
              onChange={(e) => run(ctx.api.editItem(item.id, { kasse: e.currentTarget.checked }))}
            />
          </label>
          <button type="button" class="action" onClick={() => setEditing(item.text)}>
            <IPencil /> Umbenennen
          </button>
          <button type="button" class="action action--danger" onClick={remove}>
            <ITrash /> Löschen
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Checkout({ open, items, onClose }) {
  const me = meId.value;
  const allIds = activeMembers.value.map((m) => m.id);
  const kasseItems = items.filter((i) => i.kasse);
  const sharedItems = items.filter((i) => !i.kasse);
  const [amountK, setAmountK] = useState('');
  const [payK, setPayK] = useState(KASSE);
  const [amountS, setAmountS] = useState('');
  const [split, setSplit] = useState(null);
  const [payer, setPayer] = useState(null);
  const [tried, setTried] = useState(false);
  const splitIds = split ?? allIds;
  const payerId = payer ?? me;

  const centsK = amountK.trim() ? parseMoney(amountK) : null;
  const centsS = amountS.trim() ? parseMoney(amountS) : null;
  const errK = amountK.trim() && (centsK === null || centsK <= 0) ? 'Bitte einen Betrag wie 12,40 eingeben.' : null;
  const errS = amountS.trim() && (centsS === null || centsS <= 0) ? 'Bitte einen Betrag wie 12,40 eingeben.' : null;
  const errSplit = centsS > 0 && !splitIds.length ? 'Wähle mindestens eine Person.' : null;

  const reset = () => {
    setAmountK('');
    setPayK(KASSE);
    setAmountS('');
    setSplit(null);
    setPayer(null);
    setTried(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = () => {
    setTried(true);
    if (errK || errS || errSplit) return;
    const groups = [];
    if (kasseItems.length) groups.push({ items: kasseItems, amount: centsK, paidBy: payK === KASSE ? KASSE : me, split: allIds });
    if (sharedItems.length) groups.push({ items: sharedItems, amount: centsS, paidBy: payerId, split: splitIds });
    run(ctx.api.completeShopping({ me, groups, allIds }));
    const total = (centsK || 0) + (centsS || 0);
    toast(total ? `Einkauf abgeschlossen, ${formatMoney(total)} eingetragen.` : 'Einkauf abgeschlossen.');
    close();
  };

  const perHead = centsS > 0 && splitIds.length ? Object.values(splitEvenly(centsS, splitIds)) : [];
  const perHeadText = perHead.length
    ? Math.min(...perHead) === Math.max(...perHead)
      ? `${formatMoney(perHead[0])} pro Person`
      : `${formatMoney(Math.min(...perHead))} bis ${formatMoney(Math.max(...perHead))} pro Person`
    : null;

  return (
    <Sheet
      open={open}
      title="Einkauf abschließen"
      onClose={close}
      footer={
        <>
          <button type="button" class="btn btn--quiet" onClick={close}>
            Abbrechen
          </button>
          <button type="button" class="btn btn--primary" onClick={submit}>
            Abschließen
          </button>
        </>
      }
    >
      {kasseItems.length > 0 && (
        <div class="group">
          <h3 class="group__title">Für die Kasse</h3>
          <p class="group__items">{kasseItems.map((i) => i.text).join(', ')}</p>
          <Field label="Betrag laut Bon" error={tried && errK}>
            <MoneyInput value={amountK} onInput={setAmountK} autofocus label="Betrag für die Kasse" />
          </Field>
          <Field group
            label="Bezahlt"
            hint={payK === KASSE ? 'Wird vom Kassenstand abgezogen.' : 'Du hast ausgelegt, es wird auf alle aufgeteilt.'}
          >
            <div class="seg" role="radiogroup" aria-label="Bezahlt">
              <button type="button" role="radio" aria-checked={payK === KASSE} class={`seg__opt${payK === KASSE ? ' is-on' : ''}`} onClick={() => setPayK(KASSE)}>
                Aus der Kasse
              </button>
              <button type="button" role="radio" aria-checked={payK !== KASSE} class={`seg__opt${payK !== KASSE ? ' is-on' : ''}`} onClick={() => setPayK('me')}>
                Ich habe ausgelegt
              </button>
            </div>
          </Field>
        </div>
      )}
      {sharedItems.length > 0 && (
        <div class="group">
          <h3 class="group__title">Geteilt</h3>
          <p class="group__items">{sharedItems.map((i) => i.text).join(', ')}</p>
          <Field label="Betrag laut Bon" error={tried && errS} hint={perHeadText}>
            <MoneyInput value={amountS} onInput={setAmountS} autofocus={!kasseItems.length} label="Betrag für geteilte Sachen" />
          </Field>
          <Field group label="Für wen?" error={tried && errSplit}>
            <People multi list={activeMembers.value} value={splitIds} onChange={setSplit} label="Für wen?" />
          </Field>
          <Field group label="Bezahlt von">
            <People list={activeMembers.value} value={payerId} onChange={setPayer} label="Bezahlt von" />
          </Field>
        </div>
      )}
      <p class="sheet__hint">Ohne Betrag werden die Sachen nur abgehakt.</p>
    </Sheet>
  );
}

export const listeBadge = () => openItems.value.length;
