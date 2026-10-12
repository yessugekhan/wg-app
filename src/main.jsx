import { render } from 'preact';
import { effect } from '@preact/signals';
import { App } from './ui/App.jsx';
import { boot, installPrompt, wg, ctx, meId, selectMe, updateReady } from './state.js';
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
    navigator.serviceWorker.register('./sw.js').then(watchForUpdates).catch(() => {});
  });
}

/**
 * Apps left open in the background keep running old code. Look for a new version whenever the
 * app comes back to the front (and every half hour); when one has taken over, offer a reload.
 */
function watchForUpdates(reg) {
  const sw = navigator.serviceWorker;
  let hadController = !!sw.controller;
  sw.addEventListener('message', (e) => {
    if (e.data?.type === 'version' && e.data.version !== `wg-${__VERSION__}`) updateReady.value = true;
  });
  sw.addEventListener('controllerchange', () => {
    // the very first install also "changes" the controller; only a replacement can be a newer version
    if (hadController) sw.controller?.postMessage({ type: 'version?' });
    hadController = true;
  });
  const check = () => document.visibilityState === 'visible' && reg.update().catch(() => {});
  document.addEventListener('visibilitychange', check);
  setInterval(check, 30 * 60 * 1000);
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
