# Credits

Everything in *Pencil & Paint* is drawn at runtime and there are no image files.
Almost everything it makes a noise with is a handful of oscillators, too — the
pot chimes still are. Two sounds are recordings.

## Sound

Two recordings, both public domain, both from Wikimedia Commons.

### `src/assets/purr.mp3`

The cat, when you stroke her.

- Source: *Purr (10 sec loopable)*, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Purr_(10_sec_loopable).ogg)
- Licence: **Public domain**

Changes made: trimmed to a six-second loop with the ends crossfaded so it runs
without a seam, gently shelved at 320 Hz to bring out the rasp a small speaker
can actually reproduce, low-passed at 1.2 kHz — a purr has nothing above that,
so everything up there was the recording's own hiss — levelled to a fixed peak
and encoded as mono MP3.

This replaced a synthesiser: an oscillator carrying a harmonic series, two more
drifting its pitch, two wobbling its loudness, a fifth chopping it at five hertz,
a filtered noise layer for breath, and a hand-built envelope phrasing the whole
thing into three swells. It was an interesting piece of work and it never once
sounded like a cat.

### `src/assets/birdsong.mp3`

The bird on the tree by the hammock, once the valley is finished.

- Source: *Birds singing in garden*, by **ezwa**, via
  [pdsounds.org](http://www.pdsounds.org/) and
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Birds_singing_in_garden.ogg)
- Recorded: 18 April 2007
- Licence: **Public domain** — no conditions attached; credited here because it
  is somebody's morning and somebody's recording of it.

Changes made: trimmed to a fifteen-second loop from two passages of song,
high-passed at 250 Hz to remove the traffic rumble under the original, levelled,
and re-encoded as mono MP3.

Recordings rather than synthesis, in both cases for the same reason. A whistle
is easy and a blackbird answering another blackbird across a garden is not; a low
rumble is easy and a cat is not.
