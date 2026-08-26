import { exposeForTests } from './debug';
import { WALK_CYCLE } from './entities/player';
import { Game } from './game';
import { tickBoil } from './media/ink';
import { Renderer } from './render/renderer';
import { Input } from './systems/input';
import { drawPerfOverlay, Performance } from './systems/perf';
import { Ui } from './ui';
import { World } from './world/world';

/** Longest step the simulation will take, so a stall does not teleport anyone. */
const MAX_STEP = 0.05;

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('missing #game canvas');

  const world = World.generate();
  const renderer = new Renderer(canvas);
  const perf = new Performance();
  let showPerf = false;

  const ui = new Ui({
    onStart: () => start(),
    onRestart: () => {
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
      game.running = true;
    },
  });

  const game = new Game(world, {
    onPotFound: (found, total) => {
      ui.setProgress(found, total, game.litRadius);
      ui.setPotHint(found, total);
      chime(found - 1);
    },
    onComplete: (seconds) => ui.announceCompletion(seconds),
  });

  const input = new Input(canvas, {
    onEngage: () => start(),
    onRestart: () => {
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
    },
    onTogglePerf: () => {
      showPerf = !showPerf;
    },
  });

  function start(): void {
    if (!ui.dismissIntro()) return;
    game.running = true;
    // Building the world and baking the first sprites is a one-off cost and
    // must not be mistaken for a slow machine.
    perf.pardonWarmUp(game.elapsed);
  }

  function resize(): void {
    renderer.resize(innerWidth, innerHeight, perf.scale, game.field);
  }

  addEventListener('resize', () => {
    resize();
    renderer.render(game.scene);
  });
  resize();
  ui.setProgress(0, game.pots.length, game.litRadius);

  exposeForTests({
    game,
    walkCycle: WALK_CYCLE,
    renderer,
    perf,
    renderOnce: () => renderer.render(game.scene),
  });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(MAX_STEP, (now - last) / 1000);
    last = now;

    tickBoil(game.elapsed + dt);
    game.advance(dt, input);

    const drawStart = performance.now();
    renderer.render(game.scene);
    if (showPerf) {
      const awake = game.herd.animals.reduce((n, a) => n + (a.awake ? 1 : 0), 0);
      drawPerfOverlay(renderer.context, perf.snapshot(), renderer.width, renderer.height, [
        `awake ${awake}/${game.herd.animals.length}   zoom ${game.camera.zoom.toFixed(2)}`,
      ]);
    }
    perf.recordDraw(performance.now() - drawStart);

    // Resizing wipes the canvas, so redraw at once — otherwise the browser can
    // composite the blank one and you see a flash.
    if (perf.recordFrame(dt * 1000, game.elapsed)) {
      resize();
      renderer.render(game.scene);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** A small kalimba note per pot, tuned up a pentatonic scale as you go. */
let audio: AudioContext | undefined;
function chime(index: number): void {
  try {
    audio ??= new AudioContext();
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    const frequency = 261.6 * Math.pow(2, scale[index % scale.length] / 12);
    const now = audio.currentTime;
    for (const [harmonic, gain] of [
      [1, 0.18],
      [2, 0.06],
    ]) {
      const osc = audio.createOscillator();
      const envelope = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency * harmonic;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      osc.connect(envelope).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    }
  } catch {
    // Audio is a nicety; a browser that refuses it should not stop the game.
  }
}

boot();
