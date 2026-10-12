import { useMemo, useState } from 'preact/hooks';
import { ctx, chores, choreLog, choreWeeks, activeMembers, meId, currentWeek, clock, name, nameDat, joinNames, run, toast } from '../state.js';
import { choreDue, choreAssignee, choreLogId, weekInfo, weekIndex, nextDueWeek, relWeek, dayKey, dayLabelInline } from '../model.js';
import { Headline, Section, Sheet, Magnet, People, Field, Segmented, Confirm, Check, Strike } from './kit.jsx';
import { ICheck, IUndo, IPencil, IPlus } from './icons.jsx';

const ICONS = ['🚿', '🛁', '🚽', '🍳', '🧽', '🗑️', '♻️', '🧹', '🪟', '🧺', '🪴', '📦'];
const intervalText = (n) => (n === 1 ? 'jede Woche' : `alle ${n} Wochen`);

function useChoreData() {
  const log = useMemo(() => Object.fromEntries(choreLog.value.map((d) => [d.id, d])), [choreLog.value]);
  const list = chores.value
    .filter((c) => c.active !== false)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.name).localeCompare(String(b.name), 'de'));
  const entry = (c, w) => log[choreLogId(c.id, w)];
  const who = (c, w) => entry(c, w)?.assignee || choreAssignee(c, w);
  const doneBy = (c, w) => entry(c, w)?.doneBy || null;
  const existedIn = (c, w) => w >= weekIndex(new Date(c.createdAt || 0));
  return { list, entry, who, doneBy, existedIn, log };
}

/** For the tab bar: does the current person still have something to do this week? */
export function putzenDot() {
  const me = meId.value;
  const w = currentWeek.value;
  const log = Object.fromEntries(choreLog.value.map((d) => [d.id, d]));
  return chores.value.some((c) => {
    if (c.active === false || !choreDue(c, w)) return false;
    const e = log[choreLogId(c.id, w)];
    return (e?.assignee || choreAssignee(c, w)) === me && !e?.doneBy;
  });
}

export function Putzen() {
  const me = meId.value;
  const week = currentWeek.value;
  const { list, entry, who, doneBy, existedIn, log } = useChoreData();
  const [sheet, setSheet] = useState(null); // { chore, week }
  const [manage, setManage] = useState(false);

  const due = list.filter((c) => choreDue(c, week));
  const notDue = list.filter((c) => !choreDue(c, week));
  const myDue = due.filter((c) => who(c, week) === me);
  const myOpen = myDue.filter((c) => !doneBy(c, week));
  const lastWeekOpen = list.filter((c) => existedIn(c, week - 1) && choreDue(c, week - 1) && !doneBy(c, week - 1));
  const info = weekInfo(week);

  let head;
  if (!list.length) head = 'Noch kein Putzplan.';
  else if (myOpen.length) head = `${myOpen.length === 1 ? 'Deine Aufgabe' : 'Deine Aufgaben'} diese Woche: ${joinNames(myOpen.map((c) => c.name))}.`;
  else if (myDue.length) head = 'Du hast diese Woche alles erledigt.';
  else head = 'Diese Woche hast du frei.';

  const sub = [`${info.title}, ${info.range}.`];
  if (lastWeekOpen.length) sub.push(`Von letzter Woche ist noch offen: ${joinNames(lastWeekOpen.map((c) => c.name))}.`);

  const markDone = (c, w) => {
    run(ctx.api.markChoreDone(c, w, me));
    toast(`${c.name} ist erledigt.`, { action: 'Rückgängig', onAction: () => run(ctx.api.undoChoreDone(c, w)) });
  };

  if (!list.length) {
    return (
      <>
        <Headline sub="Legt fest, wer wann Bad, Küche und Müll übernimmt. Die App rotiert jede Woche weiter.">{head}</Headline>
        <button type="button" class="btn btn--primary btn--block btn--tall" onClick={() => setManage('new')}>
          <IPlus /> Erste Aufgabe anlegen
        </button>
        {manage && <ChoreEditor chore={null} onClose={() => setManage(false)} />}
      </>
    );
  }

  return (
    <>
      <Headline sub={sub.join(' ')}>{head}</Headline>

      <Section title="Diese Woche" id="woche">
        <ul class="list">
          {due.map((c) => {
            const a = who(c, week);
            const d = doneBy(c, week);
            const swapped = !!entry(c, week)?.assignee;
            return (
              <li class={`chore${a === me ? ' is-mine' : ''}${d ? ' is-done' : ''}`} key={c.id}>
                <span class="chore__icon" aria-hidden="true">{c.icon}</span>
                <button type="button" class="chore__main" onClick={() => setSheet({ chore: c, week })}>
                  <span class="chore__name">
                    {c.name}
                    {d && <Strike />}
                  </span>
                  <span class="chore__who">
                    {d
                      ? d === a
                        ? `Erledigt von ${nameDat(d)}`
                        : `Erledigt von ${nameDat(d)} für ${a === me ? 'dich' : name(a)}`
                      : a === me
                        ? 'Du bist dran'
                        : `${name(a)} ist dran`}
                    {swapped && !d ? ', getauscht' : ''}
                  </span>
                </button>
                <Magnet id={a} size={30} />
                {d ? (
                  <span class="done-mark" role="img" aria-label="erledigt">
                    <Check size={32} />
                  </span>
                ) : (
                  <button type="button" class={`btn btn--small${a === me ? ' btn--primary' : ''}`} onClick={() => markDone(c, week)}>
                    Erledigt
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {notDue.length > 0 && (
          <p class="fineprint">
            Nicht diese Woche:{' '}
            {notDue.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ', '}
                {c.name} (wieder in der Woche ab {weekInfo(nextDueWeek(c, week)).from})
              </span>
            ))}
            .
          </p>
        )}
      </Section>

      {lastWeekOpen.length > 0 && (
        <Section title="Noch offen von letzter Woche" id="offen">
          <ul class="list">
            {lastWeekOpen.map((c) => {
              const a = who(c, week - 1);
              return (
                <li class="chore" key={c.id}>
                  <span class="chore__icon" aria-hidden="true">{c.icon}</span>
                  <button type="button" class="chore__main" onClick={() => setSheet({ chore: c, week: week - 1 })}>
                    <span class="chore__name">{c.name}</span>
                    <span class="chore__who">{a === me ? 'Du warst dran' : `${name(a)} war dran`}</span>
                  </button>
                  <Magnet id={a} size={30} />
                  <button type="button" class="btn btn--small" onClick={() => markDone(c, week - 1)}>
                    Nachtragen
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Plan für die nächsten Wochen" id="plan">
        <div class="plan-wrap">
          <table class="plan">
            <caption class="sr-only">Putzplan der nächsten vier Wochen</caption>
            <thead>
              <tr>
                <th scope="col">Aufgabe</th>
                {[0, 1, 2, 3].map((k) => {
                  const wi = weekInfo(week + k);
                  return (
                    <th scope="col" class={k === 0 ? 'is-now' : k === 3 ? 'plan__far' : ''} key={k}>
                      <span class="plan__wk">{k === 0 ? 'Jetzt' : wi.short}</span>
                      <span class="plan__date">{wi.dates.split('–')[0]}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <span aria-hidden="true">{c.icon}</span> {c.name}
                  </th>
                  {[0, 1, 2, 3].map((k) => {
                    const w = week + k;
                    const a = choreDue(c, w) ? who(c, w) : null;
                    return (
                      <td class={k === 0 ? 'is-now' : k === 3 ? 'plan__far' : ''} key={k}>
                        {a ? (
                          <span class="plan__cell">
                            <Magnet id={a} size={28} label />
                            {doneBy(c, w) && <span class="plan__done" role="img" aria-label="erledigt"><Check size={18} /></span>}
                          </span>
                        ) : (
                          <span class="muted" aria-label="nicht dran">–</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <History list={list} entry={entry} who={who} doneBy={doneBy} existedIn={existedIn} week={week} onOpen={(c, w) => setSheet({ chore: c, week: w })} />

      <Stats log={log} week={week} />

      <button type="button" class="btn btn--block" onClick={() => setManage(true)}>
        <IPencil size={20} /> Aufgaben bearbeiten
      </button>

      {sheet && <ChoreSheet {...sheet} who={who} doneBy={doneBy} entry={entry} onClose={() => setSheet(null)} />}
      {manage && <ChoreManager startNew={manage === 'new'} onClose={() => setManage(false)} />}
    </>
  );
}

/** Week by week: who cleaned what, and what was left undone. */
function History({ list, entry, who, doneBy, existedIn, week, onOpen }) {
  const me = meId.value;
  const now = new Date(clock.value);
  const [shown, setShown] = useState(4);
  const loaded = choreWeeks.value - 1; // weeks before this one that are in memory
  const weeks = [];
  for (let k = 1; k <= Math.min(shown, loaded); k++) {
    const w = week - k;
    const rows = list.filter((c) => existedIn(c, w) && choreDue(c, w));
    if (rows.length) weeks.push({ w, rows });
  }
  const anyOlder = list.some((c) => existedIn(c, week - shown - 1));
  return (
    <Section title="Wer hat wann geputzt?" id="verlauf">
      {!weeks.length && <p class="section__text">Ab nächster Woche steht hier, wer in welcher Woche was erledigt hat.</p>}
      {weeks.map(({ w, rows }) => {
        const info = weekInfo(w);
        const rel = relWeek(w, week);
        return (
          <div class="week" key={w}>
            <h3 class="week__head">
              <span>{rel[0].toUpperCase() + rel.slice(1)}</span>
              <span class="week__dates">{rel === info.title ? info.dates : `${info.title}, ${info.dates}`}</span>
            </h3>
            <ul class="list">
              {rows.map((c) => {
                const a = who(c, w);
                const d = doneBy(c, w);
                const doneAt = entry(c, w)?.doneAt;
                const at = d && doneAt ? dayLabelInline(dayKey(new Date(doneAt)), now) : '';
                return (
                  <li key={c.id}>
                    <button type="button" class={`hrow${d ? ' is-done' : ' is-missed'}`} onClick={() => onOpen(c, w)}>
                      <span class="chore__icon" aria-hidden="true">{c.icon}</span>
                      <span class="hrow__main">
                        <span class="hrow__name">{c.name}</span>
                        <span class="hrow__who">
                          {d
                            ? `${d === me ? 'Du' : name(d)}${d !== a ? ` für ${a === me ? 'dich' : name(a)}` : ''}${at ? `, ${at}` : ''}`
                            : `${a === me ? 'Du warst' : `${name(a)} war`} dran, nicht erledigt`}
                        </span>
                      </span>
                      <Magnet id={d || a} size={28} />
                      <span class={d ? 'hrow__mark' : 'hrow__mark hrow__mark--miss'} role="img" aria-label={d ? 'erledigt' : 'nicht erledigt'}>
                        {d ? <Check size={22} /> : <Cross />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {anyOlder && (
        <button
          type="button"
          class="btn btn--block more"
          onClick={() => {
            const next = shown + 4;
            setShown(next);
            if (next > loaded) choreWeeks.value = next + 6;
          }}
        >
          Ältere Wochen anzeigen
        </button>
      )}
    </Section>
  );
}

/** A loose red X for chores nobody did. */
function Cross() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 5.5 L19 18.5 M18.5 5 L5.5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  );
}

function Stats({ log, week }) {
  const me = meId.value;
  const people = activeMembers.value;
  const counts = {};
  for (const e of Object.values(log)) if (e.doneBy && e.week > week - 8 && e.week <= week) counts[e.doneBy] = (counts[e.doneBy] || 0) + 1;
  const max = Math.max(1, ...people.map((m) => counts[m.id] || 0));
  return (
    <Section title="Erledigt in den letzten 8 Wochen" id="stats">
      <ul class="stats">
        {people.map((m) => (
          <li key={m.id}>
            <Magnet id={m.id} size={26} />
            <span class="stats__name">{m.id === me ? 'Du' : m.name}</span>
            <span class="stats__track" aria-hidden="true">
              <span class="stats__fill" style={{ width: `${((counts[m.id] || 0) / max) * 100}%` }} />
            </span>
            <span class="stats__n">{counts[m.id] || 0}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ChoreSheet({ chore, week, who, doneBy, entry, onClose }) {
  const me = meId.value;
  const a = who(chore, week);
  const d = doneBy(chore, week);
  const planned = choreAssignee(chore, week);
  const info = weekInfo(week);
  return (
    <Sheet open title={`${chore.icon} ${chore.name}`} onClose={onClose}>
      <p class="sheet__text">
        {info.title}, {info.range}.{' '}
        {d ? `Erledigt von ${nameDat(d)}.` : `${a === me ? 'Du bist' : `${name(a)} ist`} dran.`}
        {entry(chore, week)?.assignee && planned && planned !== a && ` Nach Plan wäre ${name(planned)} dran.`}
      </p>
      {d ? (
        <button type="button" class="btn btn--block" onClick={() => (run(ctx.api.undoChoreDone(chore, week)), onClose())}>
          <IUndo size={20} /> Doch nicht erledigt
        </button>
      ) : (
        <button
          type="button"
          class="btn btn--primary btn--block btn--tall"
          onClick={() => {
            run(ctx.api.markChoreDone(chore, week, me));
            toast(`${chore.name} ist erledigt.`);
            onClose();
          }}
        >
          <ICheck size={20} /> Erledigt
        </button>
      )}
      <Field group label="Wer übernimmt in dieser Woche?" hint="Zum Tauschen einfach jemand anderen antippen.">
        <People
          list={activeMembers.value}
          value={a}
          label="Wer übernimmt?"
          onChange={(id) => {
            run(ctx.api.setChoreOverride(chore, week, id === planned ? null : id));
            toast(id === planned ? 'Wieder nach Plan.' : `${name(id, { cap: true })} ${id === me ? 'übernimmst' : 'übernimmt'} ${chore.name}.`);
            onClose();
          }}
        />
      </Field>
    </Sheet>
  );
}

function ChoreManager({ startNew, onClose }) {
  const [edit, setEdit] = useState(startNew ? 'new' : null);
  const list = chores.value.filter((c) => c.active !== false);
  if (edit) return <ChoreEditor chore={edit === 'new' ? null : edit} onClose={() => (startNew ? onClose() : setEdit(null))} />;
  return (
    <Sheet open title="Aufgaben" onClose={onClose}>
      <ul class="list">
        {list.map((c) => (
          <li class="row" key={c.id}>
            <span class="chore__icon" aria-hidden="true">{c.icon}</span>
            <span class="row__main">
              <strong>{c.name}</strong>
              <span class="muted">
                {' '}
                {intervalText(c.everyWeeks || 1)}, {(c.rotation || []).length} Leute
              </span>
            </span>
            <button type="button" class="icon-btn" aria-label={`${c.name} bearbeiten`} onClick={() => setEdit(c)}>
              <IPencil />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="btn btn--block" onClick={() => setEdit('new')}>
        <IPlus /> Neue Aufgabe
      </button>
    </Sheet>
  );
}

function ChoreEditor({ chore, onClose }) {
  const people = activeMembers.value;
  const week = currentWeek.value;
  const current = chore ? choreAssignee(chore, nextDueWeek(chore, week)) : null;
  const [nameV, setName] = useState(chore?.name || '');
  const [icon, setIcon] = useState(chore?.icon || '🧽');
  const [every, setEvery] = useState(chore?.everyWeeks || 1);
  const [sel, setSel] = useState(chore ? (chore.rotation || []).filter((id) => people.some((m) => m.id === id)) : people.map((m) => m.id));
  const [start, setStart] = useState(current || people[0]?.id);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const ordered = people.map((m) => m.id).filter((id) => sel.includes(id));
  const startId = ordered.includes(start) ? start : ordered[0];
  const errName = !nameV.trim() ? 'Wie heißt die Aufgabe?' : null;
  const errSel = !ordered.length ? 'Mindestens eine Person muss mitmachen.' : null;

  const save = () => {
    setTried(true);
    if (errName || errSel) return;
    if (!chore) {
      run(ctx.api.addChore({ name: nameV, icon, everyWeeks: every, rotation: ordered, startWith: startId }));
      toast(`${nameV.trim()} ist im Putzplan.`);
    } else {
      const old = chore.rotation || [];
      const reschedule =
        every !== (chore.everyWeeks || 1) ||
        startId !== current ||
        old.length !== ordered.length ||
        ordered.some((id) => !old.includes(id));
      run(ctx.api.updateChore(chore, { name: nameV, icon, everyWeeks: every, rotation: ordered, startWith: startId, reschedule }));
      toast('Aufgabe gespeichert.');
    }
    onClose();
  };

  return (
    <>
      <Sheet
        open={!confirm}
        title={chore ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
        onClose={onClose}
        footer={
          <>
            {chore ? (
              <button type="button" class="btn btn--danger" onClick={() => setConfirm(true)}>
                Löschen
              </button>
            ) : (
              <button type="button" class="btn btn--quiet" onClick={onClose}>
                Abbrechen
              </button>
            )}
            <button type="button" class="btn btn--primary" onClick={save}>
              Speichern
            </button>
          </>
        }
      >
        <Field label="Aufgabe" error={tried && errName}>
          <input class="input" type="text" value={nameV} placeholder="z. B. Bad putzen" onInput={(e) => setName(e.currentTarget.value)} data-autofocus />
        </Field>
        <div class="field">
          <span class="field__label">Symbol</span>
          <div class="emoji-row" role="radiogroup" aria-label="Symbol">
            {ICONS.map((e) => (
              <button type="button" key={e} role="radio" aria-checked={icon === e} class={`emoji${icon === e ? ' is-on' : ''}`} onClick={() => setIcon(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Field group label="Wie oft?">
          <Segmented
            label="Wie oft?"
            value={every}
            onChange={setEvery}
            options={[
              { value: 1, label: 'Jede Woche' },
              { value: 2, label: 'Alle 2 Wochen' },
              { value: 4, label: 'Alle 4 Wochen' },
            ]}
          />
        </Field>
        <Field group label="Wer macht mit?" error={tried && errSel}>
          <People multi list={people} value={sel} onChange={setSel} label="Wer macht mit?" />
        </Field>
        {ordered.length > 1 && (
          <Field group label={chore ? 'Wer ist als Nächstes dran?' : 'Wer fängt diese Woche an?'} hint="Danach geht es reihum weiter.">
            <People list={people.filter((m) => ordered.includes(m.id))} value={startId} onChange={setStart} label="Wer fängt an?" />
          </Field>
        )}
      </Sheet>
      <Confirm
        open={confirm}
        title={`${chore?.name} löschen?`}
        text="Die Aufgabe verschwindet aus dem Putzplan. Erledigte Einträge zählen weiter in der Statistik."
        onConfirm={() => {
          run(ctx.api.deleteChore(chore.id), 'Löschen');
          toast('Aufgabe gelöscht.');
          onClose();
        }}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
