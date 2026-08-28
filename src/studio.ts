import { PAINTINGS } from './assets/paintings/index';
import { t } from './i18n';

/**
 * The easel's drawing board.
 *
 * A small painting program that opens when you press E at the easel, keeps what
 * you make in the browser, and puts the last thing you kept on the easel out in
 * the valley. The whole point of the game is that somebody left this world
 * half-drawn; this is where you get to be that somebody.
 *
 * Deliberately small. Six colours, three nibs, a rubber, and paper the size of
 * a postcard — enough to draw a house or a cat, and not enough to be a job.
 */

/**
 * The paper, in its own pixels. Everything is drawn and stored at this size.
 *
 * Bigger than the box it is shown in, and deliberately: the board stretches to
 * fill whatever screen it is on, and on a desktop that is most of it. At the
 * old 360 across, a full-screen board was a 360-pixel drawing blown up to a
 * thousand, which looked exactly as soft as it sounds.
 */
const PAPER_W = 800;
const PAPER_H = 600;

const STORE = 'pencil:drawings';

/**
 * How many are kept.
 *
 * `localStorage` is a few megabytes and shared with everything else this origin
 * stores, so this is a gallery rather than an archive. The oldest falls off the
 * end when a new one arrives.
 */
const KEEP = 12;

/**
 * Graphite, which you always have.
 *
 * Everything else on the palette is a pot you went and found. Starting with
 * nothing but a pencil is the whole conceit of the place: the valley is in
 * graphite until somebody colours it in, and so is whatever you draw here.
 */
const GRAPHITE = '#3a352e';

/** The paper itself, which is what a rubber actually is. */
const PAPER_INK = '#fdfaf2';
/** Nibs, in paper pixels — so they look the same size whatever the screen. */
const NIBS = [6, 14, 32] as const;

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
}

/** Everything kept, oldest first. Returns an empty list if storage is closed. */
export function keptDrawings(): string[] {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is string => typeof d === 'string' && d.startsWith('data:'));
  } catch {
    // Private browsing, a full quota, or somebody else's key. Either way there
    // is nothing to show, and that is not worth an error.
    return [];
  }
}

function store(drawings: string[]): boolean {
  try {
    localStorage.setItem(STORE, JSON.stringify(drawings));
    return true;
  } catch {
    return false;
  }
}

/** The most recent one, which is what stands on the easel. */
export function latestDrawing(): string | undefined {
  const all = keptDrawings();
  return all[all.length - 1];
}

export class Studio {
  private readonly root = element('studio');
  private readonly canvas = element<HTMLCanvasElement>('paper');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly gallery = element('gallery');
  private readonly galleryEmpty = element('galleryEmpty');
  private readonly collection = element('collection');
  private readonly collectionTitle = element('collectionTitle');

  private ink: string = GRAPHITE;

  /** The pot colours found so far. Refreshed every time the board opens. */
  private inks: string[] = [];
  private nib: number = NIBS[1];
  private drawing = false;
  private last: { x: number; y: number } | null = null;

  /** Whether anything has been drawn since the paper was last blank. */
  private touched = false;

  open = false;

  constructor(private readonly onClose: (kept: boolean) => void) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context for the drawing board');
    this.ctx = ctx;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.blank();

    this.buildPalette();
    this.buildNibs();

    element('studioClear').addEventListener('click', () => this.blank());
    element('studioClose').addEventListener('click', () => this.finish());

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    addEventListener('keydown', this.onKey);
  }

  private buildPalette(): void {
    const row = element('palette');
    row.replaceChildren();
    for (const colour of [GRAPHITE, ...this.inks, PAPER_INK]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.style.background = colour;
      button.setAttribute('aria-pressed', String(colour === this.ink));
      button.setAttribute(
        'aria-label',
        colour === PAPER_INK ? t('studio.rubber') : t('studio.colour'),
      );
      button.addEventListener('click', () => {
        this.ink = colour;
        for (const other of row.children) {
          other.setAttribute('aria-pressed', String(other === button));
        }
        button.blur();
      });
      row.append(button);
    }
  }

  private buildNibs(): void {
    const row = element('nibs');
    row.replaceChildren();
    for (const size of NIBS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nib';
      button.setAttribute('aria-pressed', String(size === this.nib));
      button.setAttribute('aria-label', t('studio.nib'));
      const dot = document.createElement('span');
      // The swatch is a button, not the paper: show the nib to scale, not to size.
      const shown = Math.max(4, Math.round(size / 2.2));
      dot.style.width = `${shown}px`;
      dot.style.height = `${shown}px`;
      button.append(dot);
      button.addEventListener('click', () => {
        this.nib = size;
        for (const other of row.children) {
          other.setAttribute('aria-pressed', String(other === button));
        }
        button.blur();
      });
      row.append(button);
    }
  }

  /** Where on the paper a pointer is, in the paper's own pixels. */
  private at(e: PointerEvent): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * PAPER_W,
      y: ((e.clientY - box.top) / box.height) * PAPER_H,
    };
  }

  private onDown = (e: PointerEvent): void => {
    this.drawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.last = this.at(e);
    // A tap should leave a dot, not nothing.
    this.stroke(this.last, this.last);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drawing || !this.last) return;
    const next = this.at(e);
    this.stroke(this.last, next);
    this.last = next;
  };

  private onUp = (): void => {
    this.drawing = false;
    this.last = null;
  };

  private stroke(from: { x: number; y: number }, to: { x: number; y: number }): void {
    this.ctx.strokeStyle = this.ink;
    this.ctx.lineWidth = this.nib;
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
    this.touched = true;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    const code = e.code ?? '';
    if (code === 'Escape' || code === 'KeyQ' || code === 'KeyE') {
      e.preventDefault();
      this.finish();
    }
  };

  private blank(): void {
    this.ctx.fillStyle = PAPER_INK;
    this.ctx.fillRect(0, 0, PAPER_W, PAPER_H);
    this.touched = false;
  }

  /**
   * Finish: keep whatever is on the paper, and put the brush down.
   *
   * One button rather than two. Somebody who has drawn something and is done
   * with it wants both of those things, and a separate "keep" is a trap for
   * anybody who presses the other one first — which was every way out of here
   * except the one button, including the escape key.
   */
  private finish(): void {
    this.close(this.keep());
  }

  /**
   * Keep what is on the paper. True if there was anything to keep.
   *
   * PNG, because a drawing is flat colour and a few lines — exactly what PNG is
   * good at, and a photograph is exactly what it is not.
   */
  private keep(): boolean {
    if (!this.touched) return false;
    const kept = keptDrawings();
    kept.push(this.canvas.toDataURL('image/png'));
    while (kept.length > KEEP) kept.shift();
    if (!store(kept)) {
      // Out of room. Drop the oldest half and try once more, rather than
      // silently losing what somebody just drew.
      const half = kept.slice(Math.floor(kept.length / 2));
      store(half);
    }
    this.showGallery();
    this.touched = false;
    return true;
  }

  private showGallery(): void {
    const kept = keptDrawings();
    this.gallery.replaceChildren();
    this.galleryEmpty.style.display = kept.length ? 'none' : '';
    // Newest first: the one you just made should not be off the end of a scroll.
    for (const [index, data] of [...kept.entries()].reverse()) {
      const holder = document.createElement('div');
      holder.className = 'kept';

      const img = document.createElement('img');
      img.src = data;
      img.alt = t('studio.kept');
      img.addEventListener('click', () => this.load(data));

      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'drop';
      drop.textContent = '×';
      drop.setAttribute('aria-label', t('studio.delete'));
      drop.addEventListener('click', () => {
        const all = keptDrawings();
        all.splice(index, 1);
        store(all);
        this.showGallery();
        this.onClose(true); // the easel may now be showing a different one
      });

      holder.append(img, drop);
      this.gallery.append(holder);
    }
  }

  /** Put a drawing back on the paper — one of yours, or one of theirs. */
  private load(data: string): void {
    const image = new Image();
    image.addEventListener('load', () => {
      this.blank();
      // Fitted, not stretched: the portraits among them are not this shape.
      const scale = Math.min(PAPER_W / image.width, PAPER_H / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      this.ctx.drawImage(image, (PAPER_W - w) / 2, (PAPER_H - h) / 2, w, h);
      // Loaded, not drawn: keeping it again without a mark would only make a
      // second copy of something already kept.
      this.touched = false;
    });
    image.src = data;
  }

  /**
   * Everything at once, once the valley is finished.
   *
   * Not a picker. Somebody who has walked past the frogs on the pond and the owl
   * up its tree should get to see, at the end, the paintings they came out of —
   * and the connecting of the two is the whole point, so they all appear
   * together rather than one at a time.
   */
  private showCollection(showing: boolean): void {
    this.collection.classList.toggle('hidden', !showing);
    this.collectionTitle.classList.toggle('hidden', !showing);
    // The board gives up the height the extra row needs.
    this.root.classList.toggle('collected', showing);
    if (!showing || this.collection.childElementCount > 0) return;
    for (const painting of PAINTINGS) {
      const img = document.createElement('img');
      img.src = painting.thumb;
      img.alt = t(`painting.${painting.id}`);
      img.title = t(`painting.${painting.id}`);
      // The full one is only fetched when somebody wants to look at it.
      img.addEventListener('click', () => this.load(painting.full));
      this.collection.append(img);
    }
  }

  show(inks: string[], collected: boolean): void {
    this.open = true;
    this.inks = inks;
    this.showCollection(collected);
    // A colour you had selected and have since restarted away from should not
    // stay on the brush.
    if (this.ink !== GRAPHITE && this.ink !== PAPER_INK && !inks.includes(this.ink)) {
      this.ink = GRAPHITE;
    }
    this.buildPalette();
    this.blank();
    this.showGallery();
    this.root.classList.remove('hidden');
  }

  private close(kept: boolean): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('hidden');
    this.onClose(kept);
  }
}
