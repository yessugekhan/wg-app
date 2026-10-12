import { useEffect, useState } from 'preact/hooks';
import {
  ctx, wg, activeMembers, members, chores, sync, selectMe, joinWith, go, run, toast,
} from '../state.js';
import { parseMoney, normalizeText } from '../model.js';
import { seedDemo } from '../demo.js';
import { Headline, Field, MoneyInput, Magnet } from './kit.jsx';
import { IPlus, IX } from './icons.jsx';

const STARTER = [
  { name: 'Bad', icon: '🚿', everyWeeks: 1, hint: 'jede Woche' },
  { name: 'Küche', icon: '🍳', everyWeeks: 1, hint: 'jede Woche' },
  { name: 'Müll & Pfand', icon: '🗑️', everyWeeks: 1, hint: 'jede Woche' },
  { name: 'Flur & Boden', icon: '🧹', everyWeeks: 2, hint: 'alle 2 Wochen' },
];

export function Start({ screen }) {
  return (
    <main class="start">
      {screen === 'loading' && <Loading />}
      {screen === 'join' && <Join />}
      {screen === 'demo' && <Demo />}
      {screen === 'setup' && <Setup />}
      {screen === 'who' && <Who />}
    </main>
  );
}

function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const { error, offline } = sync.value;
  if (error === 'permission-denied') {
    return (
      <Headline sub="Der Einladungslink stimmt nicht, oder die Datenbank lässt noch niemanden rein. Frag die Person, die die App eingerichtet hat.">
        Kein Zugriff auf diese WG.
      </Headline>
    );
  }
  if (error) {
    return <Headline sub={`Die Datenbank antwortet nicht (${error}). Versuch es gleich noch mal.`}>Verbindung klappt gerade nicht.</Headline>;
  }
  return (
    <Headline sub={offline || slow ? 'Beim ersten Öffnen braucht die App Internet. Danach geht vieles auch offline.' : null}>
      Verbinde mit eurer WG …
    </Headline>
  );
}

function Join() {
  const [v, setV] = useState('');
  const [err, setErr] = useState(null);
  return (
    <>
      <Headline sub="Öffne den Einladungslink aus eurem Gruppenchat. Oder füg ihn hier ein.">Diese App gehört zu einer WG.</Headline>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!joinWith(v)) setErr('Das ist kein Einladungslink. Er endet auf #wg= und einen langen Code.');
        }}
      >
        <Field label="Einladungslink oder WG-Code" error={err}>
          <input class="input" type="text" value={v} autocomplete="off" onInput={(e) => setV(e.currentTarget.value)} data-autofocus />
        </Field>
        <button type="submit" class="btn btn--primary btn--block btn--tall" disabled={!v.trim()}>
          Beitreten
        </button>
      </form>
    </>
  );
}

function Demo() {
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  if (setup) return <Setup onBack={() => setSetup(false)} />;
  return (
    <>
      <Headline sub="Einkaufsliste, Geld, Putzplan und Pinnwand für eure WG. In der Demo bleibt alles auf diesem Gerät.">
        Probier die WG-App aus.
      </Headline>
      <div class="stack">
        <button
          type="button"
          class="btn btn--primary btn--block btn--tall"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await seedDemo(ctx.api, ctx.store);
          }}
        >
          Beispiel-WG ansehen
        </button>
        <button type="button" class="btn btn--block btn--tall" onClick={() => setSetup(true)}>
          Eigene WG anlegen
        </button>
      </div>
    </>
  );
}

function Setup({ onBack }) {
  const [wgName, setWgName] = useState('');
  const [names, setNames] = useState(['', '']);
  const [monthly, setMonthly] = useState('10,00');
  const [picked, setPicked] = useState(STARTER.map((s) => s.name));
  const [err, setErr] = useState({});

  const submit = (e) => {
    e.preventDefault();
    const list = names.map(normalizeText);
    const errors = {};
    if (!list[0]) errors.me = 'Trag zuerst deinen Namen ein.';
    const filled = list.filter(Boolean);
    const lower = filled.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) errors.names = 'Zwei Leute heißen gleich. Hängt einen Buchstaben an, zum Beispiel Anna K.';
    const cents = monthly.trim() ? parseMoney(monthly) : 0;
    if (cents === null || cents < 0) errors.monthly = 'Bitte einen Betrag wie 10,00 eingeben.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    const { meId, done } = ctx.api.setupWg({
      wgName,
      names: filled,
      meIndex: 0,
      kasseMonthly: cents,
      chores: STARTER.filter((s) => picked.includes(s.name)),
    });
    run(done, 'Anlegen');
    selectMe(meId);
    go('liste');
    toast('Eure WG ist angelegt. Schick jetzt den Einladungslink rum.');
  };

  return (
    <>
      <Headline sub="Ein paar Angaben, dann kann es losgehen. Alles lässt sich später ändern.">Neue WG anlegen</Headline>
      <form onSubmit={submit} class="setup">
        <Field label="Wie heißt eure WG?">
          <input class="input" type="text" value={wgName} placeholder="z. B. WG Martinsviertel" onInput={(e) => setWgName(e.currentTarget.value)} data-autofocus />
        </Field>

        <fieldset class="fieldset">
          <legend class="field__label">Wer wohnt hier?</legend>
          {names.map((n, i) => (
            <div class="name-row" key={i}>
              <input
                class="input"
                type="text"
                value={n}
                placeholder={i === 0 ? 'Dein Name' : `Mitbewohner ${i}`}
                aria-label={i === 0 ? 'Dein Name' : `Mitbewohner ${i}`}
                onInput={(e) => setNames(names.map((x, j) => (j === i ? e.currentTarget.value : x)))}
              />
              {i > 0 && (
                <button type="button" class="icon-btn" aria-label="Zeile entfernen" onClick={() => setNames(names.filter((_, j) => j !== i))}>
                  <IX />
                </button>
              )}
            </div>
          ))}
          {(err.me || err.names) && <span class="field__error">{err.me || err.names}</span>}
          <button type="button" class="btn btn--quiet btn--left" onClick={() => setNames([...names, ''])}>
            <IPlus size={20} /> Weitere Person
          </button>
          <span class="field__hint">Wer noch fehlt, kann sich später selbst eintragen.</span>
        </fieldset>

        <Field label="WG-Kasse: Beitrag pro Person und Monat" hint="Leer lassen, wenn ihr keine feste Kasse habt." error={err.monthly}>
          <MoneyInput value={monthly} onInput={setMonthly} label="Monatsbeitrag" />
        </Field>

        <fieldset class="fieldset">
          <legend class="field__label">Putzplan zum Start</legend>
          {STARTER.map((s) => (
            <label class="check check--row" key={s.name}>
              <input
                type="checkbox"
                checked={picked.includes(s.name)}
                onChange={(e) => setPicked(e.currentTarget.checked ? [...picked, s.name] : picked.filter((x) => x !== s.name))}
              />
              <span>
                <span aria-hidden="true">{s.icon}</span> {s.name} <span class="muted">{s.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <button type="submit" class="btn btn--primary btn--block btn--tall">
          WG anlegen
        </button>
        {onBack && (
          <button type="button" class="btn btn--quiet btn--block" onClick={onBack}>
            Zurück
          </button>
        )}
      </form>
    </>
  );
}

function Who() {
  const [v, setV] = useState('');
  const list = activeMembers.value;
  const add = (e) => {
    e.preventDefault();
    const n = normalizeText(v);
    if (!n) return;
    const existing = list.find((m) => m.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      selectMe(existing.id);
      return;
    }
    const { id, done } = ctx.api.addMember(n, { members: members.value, chores: chores.value });
    run(done, 'Eintragen');
    selectMe(id);
    toast(`Willkommen, ${n}. Du stehst jetzt im Putzplan.`);
  };
  return (
    <>
      <Headline sub={`${wg.value?.name}. Tipp deinen Namen an, dieses Handy merkt sich das.`}>Wer bist du?</Headline>
      <div class="who-list">
        {list.map((m) => (
          <button type="button" class="who-btn" key={m.id} onClick={() => selectMe(m.id)}>
            <Magnet id={m.id} size={44} />
            <span>{m.name}</span>
          </button>
        ))}
      </div>
      <form class="who-new" onSubmit={add}>
        <Field group label="Nicht dabei? Trag dich ein.">
          <div class="inline-form">
            <input class="input" type="text" value={v} placeholder="Dein Name" onInput={(e) => setV(e.currentTarget.value)} aria-label="Dein Name" />
            <button type="submit" class="btn" disabled={!v.trim()}>
              Ich bin neu
            </button>
          </div>
        </Field>
      </form>
    </>
  );
}
