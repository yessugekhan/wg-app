import { useMemo, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import {
  ctx, wg, activeMembers, formerMembers, chores, members, memberMap, meId, forgetMe, inviteLink, run, toast,
  theme, installPrompt, go,
} from '../state.js';
import { formatMoney, parseMoney, normalizeText, KASSE } from '../model.js';
import { Headline, Section, Sheet, Magnet, MoneyInput, Field, Segmented, Confirm, People as PeoplePicker } from './kit.jsx';
import { KasseFixSheet } from './Geld.jsx';
import { IShare, ICopy, IQr, IPencil, IPlus, IDownload, IRefresh, IJar } from './icons.jsx';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function WG() {
  const me = meId.value;
  const w = wg.value || {};
  const local = ctx.kind === 'local';
  return (
    <>
      <Headline sub={`${activeMembers.value.length} Leute wohnen hier.`}>{w.name}</Headline>

      <Section title="Du" id="du">
        <div class="me-row">
          <Magnet id={me} size={46} />
          <div class="me-row__text">
            <strong>{memberMap.value[me]?.name}</strong>
            <span class="muted">So kennt dich die App auf diesem Handy.</span>
          </div>
          <button type="button" class="btn btn--small" onClick={forgetMe}>
            Wechseln
          </button>
        </div>
      </Section>

      <Invite local={local} />
      <People />
      <KasseSettings />
      <WgName />

      <Section title="Darstellung" id="darstellung">
        <Segmented
          label="Darstellung"
          value={theme.value}
          onChange={(v) => (theme.value = v)}
          options={[
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
            { value: 'system', label: 'Wie das Handy' },
          ]}
        />
      </Section>

      <Install />
      <Data local={local} />

      <p class="fineprint footer-note">
        {local ? 'Demo-Modus: Alles bleibt auf diesem Gerät.' : `WG-Code ${ctx.wgId}`}
        <br />
        Version {__VERSION__}
      </p>
    </>
  );
}

function Invite({ local }) {
  const [qr, setQr] = useState(false);
  const link = inviteLink();
  const svg = useMemo(() => {
    if (!qr) return '';
    const q = qrcode(0, 'M');
    q.addData(link);
    q.make();
    return q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }, [qr, link]);
  if (local) {
    return (
      <Section title="Einladen" id="einladen">
        <p class="section__text">Im Demo-Modus gibt es keinen Einladungslink. Sobald die App mit eurer Datenbank verbunden ist, steht hier der Link für die WG-Gruppe.</p>
      </Section>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link kopiert.');
    } catch {
      toast('Kopieren ging nicht. Halte den Link gedrückt und kopiere ihn von Hand.');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: wg.value?.name || 'Unsere WG', text: 'Hier ist unsere WG-App:', url: link });
    } catch {
      /* closed share sheet */
    }
  };
  return (
    <Section title="Einladen" id="einladen">
      <p class="section__text">Schick diesen Link in eure WG-Gruppe. Wer ihn öffnet, ist dabei. Gebt ihn nicht weiter, der Link ist der Schlüssel zu euren Daten.</p>
      <input class="input input--mono" readOnly value={link} aria-label="Einladungslink" onFocus={(e) => e.currentTarget.select()} />
      <div class="btn-row">
        {navigator.share && (
          <button type="button" class="btn btn--primary" onClick={share}>
            <IShare size={20} /> Teilen
          </button>
        )}
        <button type="button" class="btn" onClick={copy}>
          <ICopy size={20} /> Kopieren
        </button>
        <button type="button" class="btn" aria-pressed={qr} onClick={() => setQr(!qr)}>
          <IQr size={20} /> QR-Code
        </button>
      </div>
      {qr && <div class="qr" role="img" aria-label="QR-Code mit dem Einladungslink" dangerouslySetInnerHTML={{ __html: svg }} />}
    </Section>
  );
}

function People() {
  const me = meId.value;
  const [edit, setEdit] = useState(null);
  const [newName, setNewName] = useState('');
  const add = (e) => {
    e.preventDefault();
    const n = normalizeText(newName);
    if (!n) return;
    const { done } = ctx.api.addMember(n, { members: members.value, chores: chores.value });
    run(done);
    toast(`${n} ist jetzt dabei und steht im Putzplan.`);
    setNewName('');
  };
  return (
    <Section title="Mitbewohner" id="leute">
      <ul class="list">
        {activeMembers.value.map((m) => (
          <li class="row" key={m.id}>
            <Magnet id={m.id} size={32} />
            <span class="row__main">
              <strong>{m.name}</strong>
              {m.id === me && <span class="muted"> (du)</span>}
            </span>
            <button type="button" class="icon-btn" aria-label={`${m.name} bearbeiten`} onClick={() => setEdit(m)}>
              <IPencil />
            </button>
          </li>
        ))}
      </ul>
      <form class="inline-form" onSubmit={add}>
        <input class="input" type="text" placeholder="Name der neuen Person" value={newName} onInput={(e) => setNewName(e.currentTarget.value)} aria-label="Name der neuen Person" />
        <button type="submit" class="btn" disabled={!newName.trim()}>
          <IPlus size={20} /> Hinzufügen
        </button>
      </form>
      {formerMembers.value.length > 0 && (
        <details class="history">
          <summary>Ehemalige ({formerMembers.value.length})</summary>
          <ul class="list">
            {formerMembers.value.map((m) => (
              <li class="row" key={m.id}>
                <Magnet id={m.id} size={28} />
                <span class="row__main">{m.name}</span>
                <button type="button" class="btn btn--small" onClick={() => (run(ctx.api.setMemberActive(m, true, { chores: chores.value })), toast(`${m.name} ist wieder da.`))}>
                  Wieder eingezogen
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {edit && <MemberSheet member={edit} isMe={edit.id === me} onClose={() => setEdit(null)} />}
    </Section>
  );
}

function MemberSheet({ member, isMe, onClose }) {
  const [v, setV] = useState(member.name);
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <Sheet
        open={!leaving}
        title={member.name}
        onClose={onClose}
        footer={
          <>
            <button type="button" class="btn btn--quiet" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="button"
              class="btn btn--primary"
              disabled={!v.trim() || normalizeText(v) === member.name}
              onClick={() => {
                run(ctx.api.renameMember(member.id, v));
                toast('Name gespeichert.');
                onClose();
              }}
            >
              Speichern
            </button>
          </>
        }
      >
        <Field label="Name">
          <input class="input" type="text" value={v} data-autofocus onInput={(e) => setV(e.currentTarget.value)} />
        </Field>
        {!isMe && (
          <button type="button" class="btn btn--danger btn--block" onClick={() => setLeaving(true)}>
            {member.name} ist ausgezogen
          </button>
        )}
      </Sheet>
      <Confirm
        open={leaving}
        title={`${member.name} ausgezogen?`}
        text="Die Person verschwindet aus Putzplan und Aufteilungen. Buchungen und offene Salden bleiben erhalten."
        confirm="Als ausgezogen eintragen"
        onConfirm={() => {
          run(ctx.api.setMemberActive(member, false, { chores: chores.value }));
          toast(`${member.name} ist als ausgezogen eingetragen.`);
          onClose();
        }}
        onClose={() => setLeaving(false)}
      />
    </>
  );
}

function KasseSettings() {
  const current = wg.value?.kasseMonthly || 0;
  const [v, setV] = useState(current ? (current / 100).toFixed(2).replace('.', ',') : '');
  const [fix, setFix] = useState(false);
  const cents = v.trim() ? parseMoney(v) : 0;
  const invalid = cents === null || cents < 0;
  return (
    <Section title="WG-Kasse" id="kasse-einstellungen">
      <Field group label="Wer hat die Kasse?" hint="Diese Person bewahrt das Geld auf und zahlt zurück, was jemand für die Kasse ausgelegt hat.">
        <PeoplePicker
          kasse
          kasseLabel="Niemand Bestimmtes"
          list={activeMembers.value}
          value={wg.value?.kasseHolder || KASSE}
          label="Wer hat die Kasse?"
          onChange={(id) => {
            run(ctx.api.updateWg({ kasseHolder: id === KASSE ? null : id }));
            toast(id === KASSE ? 'Die Kasse hat jetzt niemand Bestimmtes.' : id === meId.value ? 'Du hast jetzt die Kasse.' : `${memberMap.value[id]?.name} hat jetzt die Kasse.`);
          }}
        />
      </Field>
      <Field label="Monatsbeitrag pro Person" hint="Leer lassen, wenn ihr keine festen Beiträge habt." error={invalid && 'Bitte einen Betrag wie 10,00 eingeben.'}>
        <MoneyInput value={v} onInput={setV} label="Monatsbeitrag pro Person" placeholder="z. B. 10,00" />
      </Field>
      <div class="btn-row">
        <button
          type="button"
          class="btn btn--primary"
          disabled={invalid || cents === current}
          onClick={() => {
            run(ctx.api.updateWg({ kasseMonthly: cents }));
            toast(cents ? `Monatsbeitrag ist jetzt ${formatMoney(cents)}.` : 'Keine Monatsbeiträge mehr.');
          }}
        >
          Beitrag speichern
        </button>
        <button type="button" class="btn" onClick={() => setFix(true)}>
          <IJar size={20} /> Kassenstand korrigieren
        </button>
      </div>
      {fix && <KasseFixSheet onClose={() => setFix(false)} />}
    </Section>
  );
}

function WgName() {
  const [v, setV] = useState(wg.value?.name || '');
  const changed = normalizeText(v) && normalizeText(v) !== wg.value?.name;
  return (
    <Section title="Name der WG" id="wg-name">
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed) return;
          run(ctx.api.updateWg({ name: normalizeText(v) }));
          toast('Name gespeichert.');
        }}
      >
        <input class="input" type="text" value={v} onInput={(e) => setV(e.currentTarget.value)} aria-label="Name der WG" />
        <button type="submit" class="btn" disabled={!changed}>
          Speichern
        </button>
      </form>
    </Section>
  );
}

function Install() {
  const standalone = matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || __PREVIEW__) return null;
  const prompt = installPrompt.value;
  return (
    <Section title="Als App auf den Startbildschirm" id="installieren">
      {prompt ? (
        <button
          type="button"
          class="btn btn--primary"
          onClick={async () => {
            prompt.prompt();
            await prompt.userChoice.catch(() => null);
            installPrompt.value = null;
          }}
        >
          Installieren
        </button>
      ) : isIOS() ? (
        <p class="section__text">In Safari unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach startet die WG-App wie jede andere App.</p>
      ) : (
        <p class="section__text">Im Browser-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.</p>
      )}
    </Section>
  );
}

function Data({ local }) {
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  // the demo build drops this entirely: the artifact frame cannot save files anyway
  const backup = __PREVIEW__ ? null : async () => {
    setBusy(true);
    try {
      const out = { exportedAt: new Date().toISOString(), wgId: ctx.wgId };
      for (const c of ['meta', 'members', 'items', 'tx', 'chores', 'choreLog', 'posts']) out[c] = await ctx.store.getCollection(c);
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `wg-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    } catch (e) {
      toast('Backup ging nicht. Bist du online?');
    }
    setBusy(false);
  };
  const recompute = async () => {
    setBusy(true);
    try {
      await ctx.api.recomputeSummary();
      toast('Salden neu berechnet.');
    } catch {
      toast('Neu berechnen geht nur mit Internet.');
    }
    setBusy(false);
  };
  return (
    <Section title="Daten" id="daten">
      <div class="btn-row">
        {backup && (
          <button type="button" class="btn" disabled={busy} onClick={backup}>
            <IDownload size={20} /> Backup herunterladen
          </button>
        )}
        <button type="button" class="btn" disabled={busy} onClick={recompute}>
          <IRefresh size={20} /> Salden neu berechnen
        </button>
        {local && (
          <button type="button" class="btn btn--danger" onClick={() => setReset(true)}>
            Demo zurücksetzen
          </button>
        )}
      </div>
      <Confirm
        open={reset}
        title="Demo zurücksetzen?"
        text="Alle Demo-Daten auf diesem Gerät werden gelöscht."
        confirm="Zurücksetzen"
        onConfirm={async () => {
          forgetMe();
          await ctx.store.reset();
          go('liste');
        }}
        onClose={() => setReset(false)}
      />
    </Section>
  );
}
