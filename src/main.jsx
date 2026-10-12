import { render } from 'preact';
import { effect } from '@preact/signals';
import { App } from './ui/App.jsx';
import { boot, installPrompt, wg, ctx, meId, selectMe } from './state.js';
import { seedDemo } from './demo.js';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt.value = e;
});

boot(window.WG_CONFIG || {}).catch((e) => {
  console.error(e);
  document.getElementById('app').textContent = 'Die App konnte nicht starten. Bitte neu laden.';
});

render(<App />, document.getElementById('app'));

if (!__PREVIEW__ && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// The demo preview opens straight into the example WG (as Anna) instead of an empty start screen.
if (__PREVIEW__) {
  let decided = false;
  effect(() => {
    const w = wg.value;
    if (decided || w === undefined || !ctx.store) return;
    decided = true;
    if (w !== null) return; // this browser already has demo data
    seedDemo(ctx.api, ctx.store).then(async () => {
      const anna = (await ctx.store.getCollection('members')).find((m) => m.name === 'Anna');
      if (anna && !meId.peek()) selectMe(anna.id);
    });
  });
}
