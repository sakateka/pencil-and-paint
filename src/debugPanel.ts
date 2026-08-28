import type { Game } from './game';

/**
 * A development panel, available only when the page is served locally.
 *
 * Off localhost `install` returns immediately and nothing is built, so the
 * panel cannot be opened on the published site by anyone who guesses the key.
 * It is not a secret worth defending — there is nothing here but shortcuts
 * through a game about walking — but a stray debug menu on a public page looks
 * like something left behind by accident.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '']);

export function isLocalhost(): boolean {
  return LOCAL_HOSTS.has(location.hostname);
}

interface Action {
  label: string;
  hint?: string;
  run(): void;
  /** Rendered as a toggle, reflecting this state. */
  isOn?(): boolean;
}

const STYLES = `
#devpanel {
  position: fixed; top: 62px; right: 14px; z-index: 20;
  width: 208px; padding: 10px 12px 12px;
  background: rgba(20,18,15,.88); color: #d8f0c0;
  border: 1px solid rgba(216,240,192,.35); border-radius: 8px;
  font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace;
  box-shadow: 0 6px 18px rgba(0,0,0,.35);
}
#devpanel[hidden] { display: none; }
#devpanel h2 {
  font: inherit; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; opacity: .55; margin-bottom: 8px;
}
#devpanel button {
  display: block; width: 100%; margin: 0 0 5px; padding: 5px 8px;
  font: inherit; text-align: left; cursor: pointer; color: inherit;
  background: rgba(216,240,192,.08);
  border: 1px solid rgba(216,240,192,.28); border-radius: 5px;
  box-shadow: none; transform: none;
}
#devpanel button:hover  { background: rgba(216,240,192,.18); }
#devpanel button:active { transform: translateY(1px); }
#devpanel button.on {
  background: rgba(216,240,192,.85); color: #14120f; border-color: transparent;
}
#devpanel .row { display: flex; gap: 5px; flex-wrap: wrap; }
#devpanel .row button {
  flex: 1 1 44%; width: auto; min-width: 0;
  margin-bottom: 0; padding: 5px 4px; text-align: center;
}
#devpanel .note { opacity: .5; margin-top: 8px; }
`;

/**
 * Build the panel and wire the backquote key to it.
 *
 * Returns a no-op off localhost.
 */
export function installDebugPanel(game: Game, extras: {
  togglePerf(): void;
  isPerfOn(): boolean;
  restart(): void;
}): void {
  if (!isLocalhost()) return;

  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.append(style);

  const panel = document.createElement('aside');
  panel.id = 'devpanel';
  panel.hidden = true;
  panel.innerHTML = '<h2>dev</h2>';

  const actions: Action[] = [
    {
      label: 'Collect all pots',
      run: () => game.collectAll(),
    },
    {
      label: 'Summon the elephant',
      hint: 'sits you on the stump and skips the two minutes',
      run: () => {
        game.teleport(game.vigil.x, game.vigil.y + 30);
        game.summonElephant();
      },
    },
    {
      label: 'Flood colour',
      hint: 'full colour, pots left alone',
      run: () => {
        game.floodColour = !game.floodColour;
      },
      isOn: () => game.floodColour,
    },
    {
      label: 'Performance readout',
      run: () => extras.togglePerf(),
      isOn: () => extras.isPerfOn(),
    },
    {
      label: 'New world',
      hint: 'rescatters the pots',
      run: () => extras.restart(),
    },
  ];

  const places: [string, number, number][] = [
    ['farm', 2180, 900],
    ['garden', 1900, 1150],
    ['pond', 790, 900],
    ['home', 1300, 1330],
  ];

  const buttons: { el: HTMLButtonElement; action: Action }[] = [];

  const refresh = () => {
    for (const { el, action } of buttons) {
      if (action.isOn) el.classList.toggle('on', action.isOn());
    }
  };

  for (const action of actions) {
    const el = document.createElement('button');
    el.textContent = action.label;
    if (action.hint) el.title = action.hint;
    el.addEventListener('click', () => {
      action.run();
      refresh();
      el.blur(); // give the keyboard back to the walker
    });
    panel.append(el);
    buttons.push({ el, action });
  }

  const row = document.createElement('div');
  row.className = 'row';
  for (const [label, x, y] of places) {
    const el = document.createElement('button');
    el.textContent = label;
    el.title = `go to ${label}`;
    el.addEventListener('click', () => {
      game.teleport(x, y);
      el.blur();
    });
    row.append(el);
  }
  panel.append(row);

  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = '` to hide · F for stats';
  panel.append(note);

  document.body.append(panel);

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== '`' && e.key !== '~') return;
    e.preventDefault();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refresh();
  });
}
