import { readFile } from 'node:fs/promises';
import { Suite } from './assert.js';
import { openGame } from './harness.js';

const FOREST_URL = 'https://cdn.freesound.org/previews/866/866207_5828667-hq.mp3';

/** The haystack has a short local opening and hands off to a remote forest. */
export async function run(url) {
  const suite = new Suite('cuckoo');
  const game = await openGame(url);
  const fixture = await readFile(new URL('../src/assets/cuckoo-intro.mp3', import.meta.url));
  let forestRequests = 0;

  // Keep the test deterministic and offline. The production URL is still the
  // one requested; its response is replaced with the matching local opening.
  await game.page.route(FOREST_URL, async (route) => {
    forestRequests++;
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: fixture });
  });

  try {
    const before = await game.evaluate(() =>
      [...document.querySelectorAll('audio')].filter((a) => a.dataset.sound === 'cuckoo-forest')
        .length,
    );
    suite.equal(before, 0, 'the three-minute forest is not requested at startup');

    // The other perch must remain quiet.
    await game.evaluate((pencil) => {
      const { game } = pencil;
      const bench = game.perches[0];
      game.teleport(bench.x, bench.y + 34);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
    });
    await game.page.waitForTimeout(100);
    suite.equal(forestRequests, 0, 'sitting on the bench does not start it');

    // Like the hammock's birds, the forest belongs to the finished valley.
    await game.evaluate((pencil) => {
      const { game } = pencil;
      game.cancel();
      const hay = game.perches[1];
      game.teleport(hay.x, hay.y + 34);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
    });
    await game.page.waitForTimeout(100);
    const unfinished = await game.evaluate(() => {
      const intro = [...document.querySelectorAll('audio')].find(
        (a) => a.dataset.sound === 'cuckoo-intro',
      );
      return { paused: intro?.paused ?? true, volume: intro?.volume ?? 0 };
    });
    suite.equal(forestRequests, 0, 'an unfinished valley keeps the haystack quiet');
    suite.ok(unfinished.paused, 'the local call stays stopped too');
    suite.equal(unfinished.volume, 0, 'with no inaudible playback underneath');

    await game.evaluate((pencil) => {
      const { game } = pencil;
      game.cancel();
      game.collectAll();
      const hay = game.perches[1];
      game.teleport(hay.x, hay.y + 34);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
    });
    await game.page.waitForFunction(
      () =>
        [...document.querySelectorAll('audio')].some(
          (a) => a.dataset.sound === 'cuckoo-intro' && a.readyState >= 1,
        ) &&
        [...document.querySelectorAll('audio')].some(
          (a) => a.dataset.sound === 'cuckoo-forest' && a.readyState >= 1,
        ),
      null,
      { timeout: 20000 },
    );

    const started = await game.evaluate(async () => {
      const intro = [...document.querySelectorAll('audio')].find(
        (a) => a.dataset.sound === 'cuckoo-intro',
      );
      const forest = [...document.querySelectorAll('audio')].find(
        (a) => a.dataset.sound === 'cuckoo-forest',
      );
      const response = await fetch(intro.src);
      const encoded = await response.arrayBuffer();
      const decoded = await new AudioContext().decodeAudioData(encoded.slice(0));
      const rms = (from, to) => {
        const first = Math.floor(from * decoded.sampleRate);
        const last = Math.floor(to * decoded.sampleRate);
        let sum = 0;
        let samples = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const data = decoded.getChannelData(channel);
          for (let i = first; i < last; i++) {
            sum += data[i] * data[i];
            samples++;
          }
        }
        return Math.sqrt(sum / samples);
      };
      return {
        bytes: encoded.byteLength,
        seconds: decoded.duration,
        channels: decoded.numberOfChannels,
        introPlaying: !intro.paused,
        introLevel: Number(intro.dataset.level),
        forestLevel: Number(forest.dataset.level),
        forestUrl: forest.src,
        forestVolume: forest.volume,
        earlyBouquetRms: rms(2, 5),
        middleQuietRms: rms(5, 9),
        lateBouquetRms: rms(9, 13),
        forestStartAt: Number(forest.dataset.startAt),
      };
    });
    suite.ok(
      started.bytes > 350000 && started.bytes < 550000,
      'only a compact opening is bundled',
      `${Math.round(started.bytes / 1024)}KiB`,
    );
    suite.equal(Math.round(started.seconds), 18, 'the local opening lasts eighteen seconds');
    suite.equal(started.channels, 2, 'and keeps the stereo forest');
    suite.ok(started.introPlaying, 'lying on the hay starts it immediately');
    suite.equal(started.introLevel, 0.05, 'the opening is mixed at pond level');
    suite.equal(started.forestLevel, 0.035, 'the continuation keeps the 70% mix level');
    suite.equal(started.forestStartAt, 116, 'and begins at the local excerpt timestamp');
    suite.equal(started.forestUrl, FOREST_URL, 'the full recording comes from Freesound');
    suite.equal(started.forestVolume, 0, 'it buffers silently behind the opening');
    suite.equal(forestRequests, 1, 'the stream is requested only once');
    suite.ok(
      started.earlyBouquetRms > started.middleQuietRms * 2,
      'the first full bouquet rises naturally from the forest',
      `${(started.earlyBouquetRms / started.middleQuietRms).toFixed(1)}x`,
    );
    suite.ok(
      started.lateBouquetRms > started.middleQuietRms * 1.3,
      'later birds and wind are retained rather than gated away',
      `${(started.lateBouquetRms / started.middleQuietRms).toFixed(1)}x`,
    );
    suite.ok(
      started.middleQuietRms < 0.012,
      'the complete excerpt still leaves room for quiet',
      `${started.middleQuietRms.toFixed(4)} rms`,
    );

    // Let the real media clock make the handoff. Chromium cannot seek in the
    // tiny test server's responses because it deliberately has no Range
    // support; waiting also exercises the exact path a player hears.
    await game.page.waitForFunction(
      () => {
        const intro = [...document.querySelectorAll('audio')].find(
          (a) => a.dataset.sound === 'cuckoo-intro',
        );
        const forest = [...document.querySelectorAll('audio')].find(
          (a) => a.dataset.sound === 'cuckoo-forest',
        );
        return intro?.paused && intro.volume === 0 && forest && forest.volume > 0.032;
      },
      null,
      { timeout: 25000 },
    );
    const handedOff = await game.evaluate(() => {
      const intro = [...document.querySelectorAll('audio')].find(
        (a) => a.dataset.sound === 'cuckoo-intro',
      );
      const forest = [...document.querySelectorAll('audio')].find(
        (a) => a.dataset.sound === 'cuckoo-forest',
      );
      return {
        introPaused: intro.paused,
        introVolume: intro.volume,
        forestPaused: forest.paused,
        forestVolume: forest.volume,
      };
    });
    suite.ok(handedOff.introPaused, 'the local opening retires after the crossfade');
    suite.equal(handedOff.introVolume, 0, 'without leaving a second forest underneath');
    suite.ok(!handedOff.forestPaused, 'the long recording carries on');
    suite.ok(
      handedOff.forestVolume > 0.032 && handedOff.forestVolume <= 0.035,
      'at seventy percent of the quiet local level',
      `${handedOff.forestVolume.toFixed(3)}`,
    );

    await game.evaluate((pencil) => pencil.game.cancel());
    await game.page.waitForTimeout(3000);
    const stopped = await game.evaluate(() => {
      const forest = [...document.querySelectorAll('audio')].find(
        (a) => a.dataset.sound === 'cuckoo-forest',
      );
      return { paused: forest.paused, volume: forest.volume };
    });
    suite.ok(stopped.paused, 'standing up stops the stream');
    suite.equal(stopped.volume, 0, 'and fades it all the way out');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
