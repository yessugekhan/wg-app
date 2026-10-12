import { useState } from 'preact/hooks';
import { screen, route, go, wg, meId, sync, openItems, ctx, toast, updateReady } from '../state.js';
import { Magnet, Toasts } from './kit.jsx';
import { IX } from './icons.jsx';
import { Start } from './Start.jsx';
import { Liste } from './Liste.jsx';
import { Geld } from './Geld.jsx';
import { Putzen, putzenDot } from './Putzen.jsx';
import { Pinnwand, pinnwandBadge } from './Pinnwand.jsx';
import { WG } from './WG.jsx';

const TAB_UI = [
  { id: 'liste', label: 'Liste' },
  { id: 'geld', label: 'Geld' },
  { id: 'putzen', label: 'Putzen' },
  { id: 'pinnwand', label: 'Pinnwand' },
];

export function App() {
  const s = screen.value;
  return (
    <>
      {s === 'app' ? <Shell /> : <Start screen={s} />}
      <UpdateBar />
      <Toasts />
    </>
  );
}

/** "Neue Version ist da": one tap loads it. Dismissable, e.g. while someone is typing. */
function UpdateBar() {
  const [later, setLater] = useState(false);
  if (!updateReady.value || later) return null;
  return (
    <div class="update-bar" role="status">
      <span class="update-bar__text">Eine neue Version der App ist da.</span>
      <button type="button" class="update-bar__go" onClick={() => location.reload()}>
        Neu laden
      </button>
      <button type="button" class="update-bar__x" aria-label="Später" onClick={() => setLater(true)}>
        <IX size={18} />
      </button>
    </div>
  );
}

function Shell() {
  const tab = route.value;
  return (
    <div class={`app app--${tab}`}>
      <TopBar />
      <main class="main" id="main">
        {tab === 'liste' && <Liste />}
        {tab === 'geld' && <Geld />}
        {tab === 'putzen' && <Putzen />}
        {tab === 'pinnwand' && <Pinnwand />}
        {tab === 'wg' && <WG />}
      </main>
      <TabBar />
    </div>
  );
}

/** The dot next to the WG name. Tapping it explains what the color means. */
export function syncState({ error, offline, pending, fromCache }, kind) {
  if (error === 'permission-denied') {
    return { text: 'Kein Zugriff', tone: 'is-bad', help: 'Rot: Dieser Link hat keinen Zugriff auf die Daten. Frag in der WG-Gruppe nach dem aktuellen Einladungslink.' };
  }
  if (error) {
    return { text: 'Verbindungsproblem', tone: 'is-bad', help: 'Rot: Die App erreicht den Server gerade nicht. Lade die Seite neu. Was du einträgst, bleibt auf dem Handy.' };
  }
  if (offline) {
    return { text: 'Offline, sendet später', tone: 'is-warn', help: 'Gelb: Kein Internet. Du kannst weiter eintragen, alles bleibt auf dem Handy und wird gesendet, sobald du wieder online bist.' };
  }
  if (kind === 'local') return { text: 'Demo, nur auf diesem Gerät', tone: 'is-quiet', help: 'Grau: Das ist die Demo. Alles bleibt auf diesem Gerät, niemand sonst sieht es.' };
  if (pending) return { text: 'Speichert …', tone: 'is-busy', help: 'Grün blinkend: Deine letzte Änderung wird gerade gesendet.' };
  if (fromCache) return { text: 'Verbinde …', tone: 'is-quiet', help: 'Grau: Die App verbindet sich gerade und zeigt so lange den zuletzt gespeicherten Stand.' };
  return { text: 'Alles gespeichert', tone: '', help: 'Grün: Alles ist gespeichert und alle in der WG sehen denselben Stand.' };
}

function SyncLine() {
  const { text, tone, help } = syncState(sync.value, ctx.kind);
  return (
    <span role="status" class="sync-wrap">
      <button type="button" class={`sync ${tone}`} title="Was heißt das?" onClick={() => toast(help, { ms: 6000 })}>
        {text}
      </button>
    </span>
  );
}

function TopBar() {
  const onWg = route.value === 'wg';
  return (
    <header class="topbar">
      <div class="topbar__in">
        <div class="topbar__title">
          <span class="topbar__wg">{wg.value?.name}</span>
          <SyncLine />
        </div>
        <button
          type="button"
          class={`topbar__me${onWg ? ' is-on' : ''}`}
          aria-label={onWg ? 'Zurück zur Liste' : 'WG und Einstellungen'}
          onClick={() => go(onWg ? 'liste' : 'wg')}
        >
          <Magnet id={meId.value} size={36} />
        </button>
      </div>
    </header>
  );
}

function TabBar() {
  const cur = route.value;
  const listCount = openItems.value.filter((i) => i.state === 'open').length;
  const newPosts = pinnwandBadge();
  const dot = putzenDot();
  return (
    <nav class="tabbar" aria-label="Bereiche">
      <div class="tabbar__in">
        <span class="screw screw--l" aria-hidden="true" />
        <span class="screw screw--r" aria-hidden="true" />
        {TAB_UI.map(({ id, label }) => {
          let badge = null;
          let sr = '';
          if (id === 'liste' && listCount) {
            badge = <span class="badge">{listCount > 99 ? '99+' : listCount}</span>;
            sr = `, ${listCount} offen`;
          }
          if (id === 'pinnwand' && newPosts && cur !== 'pinnwand') {
            badge = <span class="badge badge--new">{newPosts}</span>;
            sr = `, ${newPosts} neu`;
          }
          if (id === 'putzen' && dot) {
            badge = <span class="badge badge--dot">!</span>;
            sr = ', du bist dran';
          }
          return (
            <button
              type="button"
              key={id}
              class={`tab${cur === id ? ' is-on' : ''}`}
              aria-current={cur === id ? 'page' : undefined}
              aria-label={label + sr}
              onClick={() => go(id)}
            >
              <span class="tab__led" aria-hidden="true" />
              <span class="tab__tape" aria-hidden="true">
                {label}
                {badge}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
