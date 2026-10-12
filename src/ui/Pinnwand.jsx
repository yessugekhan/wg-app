import { useRef, useState } from 'preact/hooks';
import { ctx, posts, pinnedPosts, meId, name, run, toast, clock, visitSeen, seen } from '../state.js';
import { relTime } from '../model.js';
import { Headline, Section, Sheet, Magnet, Confirm, RichText, Empty } from './kit.jsx';
import { IDots, IPin, IPencil, ITrash, IEye } from './icons.jsx';

function merged() {
  const pinned = [...pinnedPosts.value].sort((a, b) => b.createdAt - a.createdAt);
  const ids = new Set(pinned.map((p) => p.id));
  return { pinned, rest: posts.value.filter((p) => !ids.has(p.id) && !p.pinned) };
}

/** New posts by others since this device last opened the Pinnwand. */
export function pinnwandBadge() {
  const me = meId.value;
  const since = seen.value.pinnwand ?? Infinity;
  return posts.value.filter((p) => p.createdAt > since && p.author !== me).length;
}

export function Pinnwand() {
  const me = meId.value;
  const since = visitSeen.value.pinnwand ?? Infinity;
  const { pinned, rest } = merged();
  const fresh = [...pinned, ...rest].filter((p) => p.createdAt > since && p.author !== me).length;
  const [menu, setMenu] = useState(null);

  const head = fresh ? (fresh === 1 ? '1 neue Nachricht.' : `${fresh} neue Nachrichten.`) : pinned.length || rest.length ? 'Nichts Neues.' : 'Noch keine Nachrichten.';
  const sub = !pinned.length && !rest.length ? 'Hier landet, was alle wissen sollten: Handwerkertermine, Müllabfuhr, WLAN.' : null;

  return (
    <>
      <Headline sub={sub}>{head}</Headline>
      <Composer />
      {pinned.length > 0 && (
        <Section title="Angeheftet" id="angeheftet">
          {pinned.map((p) => (
            <Post key={p.id} post={p} isNew={p.createdAt > since && p.author !== me} onMenu={setMenu} />
          ))}
        </Section>
      )}
      {rest.length > 0 && (
        <Section title={pinned.length ? 'Neueste' : null} id="neueste">
          {rest.map((p) => (
            <Post key={p.id} post={p} isNew={p.createdAt > since && p.author !== me} onMenu={setMenu} />
          ))}
        </Section>
      )}
      {menu && <PostMenu post={posts.value.find((p) => p.id === menu.id) || pinnedPosts.value.find((p) => p.id === menu.id) || menu} onClose={() => setMenu(null)} />}
    </>
  );
}

function Composer() {
  const me = meId.value;
  const [text, setText] = useState('');
  const [pin, setPin] = useState(false);
  const ref = useRef(null);
  const grow = (el) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    run(ctx.api.addPost({ text, pinned: pin, author: me }));
    setText('');
    setPin(false);
    if (ref.current) ref.current.style.height = '';
    toast(pin ? 'Nachricht angeheftet.' : 'Nachricht gepostet.');
  };
  return (
    <form class="composer" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={2}
        value={text}
        placeholder="Nachricht an die WG"
        aria-label="Nachricht an die WG"
        onInput={(e) => {
          setText(e.currentTarget.value);
          grow(e.currentTarget);
        }}
      />
      <div class="composer__row">
        <label class="check">
          <input type="checkbox" checked={pin} onChange={(e) => setPin(e.currentTarget.checked)} />
          <span>Oben anheften</span>
        </label>
        <button type="submit" class="btn btn--primary btn--small" disabled={!text.trim()}>
          Posten
        </button>
      </div>
    </form>
  );
}

function Post({ post, isNew, onMenu }) {
  const me = meId.value;
  const acks = Object.keys(post.acks || {}).filter((id) => post.acks[id]);
  const acked = acks.includes(me);
  return (
    <article class={`post${post.pinned ? ' is-pinned' : ''}`}>
      <header class="post__head">
        <Magnet id={post.author} size={30} />
        <span class="post__who">
          <strong>{name(post.author, { cap: true })}</strong>
          <span class="muted"> {relTime(post.createdAt, clock.value)}</span>
          {post.editedAt && <span class="muted">, bearbeitet</span>}
        </span>
        {isNew && <span class="tag tag--new">neu</span>}
        <button type="button" class="icon-btn" aria-label="Optionen" onClick={() => onMenu(post)}>
          <IDots />
        </button>
      </header>
      <RichText text={post.text} />
      <footer class="post__foot">
        {post.author !== me ? (
          <button type="button" class={`ack${acked ? ' is-on' : ''}`} aria-pressed={acked} onClick={() => run(ctx.api.toggleAck(post, me))}>
            <IEye size={18} /> {acked ? 'Gesehen' : 'Als gesehen markieren'}
          </button>
        ) : (
          <span class="muted ack__label">{acks.length ? 'Gesehen von' : 'Noch von niemandem gesehen'}</span>
        )}
        {acks.length > 0 && (
          <span class="ack__who" aria-label={`Gesehen von ${acks.map((id) => name(id)).join(', ')}`}>
            {acks.map((id) => (
              <Magnet id={id} size={22} key={id} />
            ))}
          </span>
        )}
      </footer>
    </article>
  );
}

function PostMenu({ post, onClose }) {
  const me = meId.value;
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Sheet open={!confirm} title="Nachricht" onClose={onClose}>
        {editing !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing.trim()) run(ctx.api.editPost(post.id, editing));
              toast('Nachricht gespeichert.');
              onClose();
            }}
          >
            <textarea class="input input--area" value={editing} rows={5} data-autofocus onInput={(e) => setEditing(e.currentTarget.value)} aria-label="Nachricht" />
            <button type="submit" class="btn btn--primary btn--block">
              Speichern
            </button>
          </form>
        ) : (
          <div class="actions">
            <button
              type="button"
              class="action"
              onClick={() => {
                run(ctx.api.setPinned(post.id, !post.pinned));
                toast(post.pinned ? 'Nicht mehr angeheftet.' : 'Nachricht angeheftet.');
                onClose();
              }}
            >
              <IPin /> {post.pinned ? 'Nicht mehr anheften' : 'Oben anheften'}
            </button>
            {post.author === me && (
              <button type="button" class="action" onClick={() => setEditing(post.text)}>
                <IPencil /> Bearbeiten
              </button>
            )}
            <button type="button" class="action action--danger" onClick={() => setConfirm(true)}>
              <ITrash /> Löschen
            </button>
          </div>
        )}
      </Sheet>
      <Confirm
        open={confirm}
        title="Nachricht löschen?"
        text={post.author === me ? 'Sie verschwindet für alle.' : `Die Nachricht von ${name(post.author)} verschwindet für alle.`}
        onConfirm={() => {
          run(ctx.api.deletePost(post.id), 'Löschen');
          toast('Nachricht gelöscht.');
          onClose();
        }}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
