import { screen, route, go, wg, meId, sync, openItems, ctx } from '../state.js';
import { Magnet, Toasts } from './kit.jsx';
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
      <Toasts />
    </>
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

function SyncLine() {
  const { error, offline, pending, fromCache } = sync.value;
  let text;
  let tone = '';
  if (error === 'permission-denied') {
    text = 'Kein Zugriff auf die Daten';
    tone = 'is-bad';
  } else if (error) {
    text = 'Verbindungsproblem';
    tone = 'is-bad';
  } else if (offline) {
    text = 'Offline, wird später synchronisiert';
    tone = 'is-warn';
  } else if (ctx.kind === 'local') {
    text = 'Demo, nur auf diesem Gerät';
    tone = 'is-quiet';
  } else if (pending) {
    text = 'Speichert …';
  } else if (fromCache) {
    text = 'Verbinde …';
    tone = 'is-quiet';
  } else {
    text = 'Alle synchron';
  }
  return (
    <span class={`sync ${tone}`} role="status">
      {text}
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
