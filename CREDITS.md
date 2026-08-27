# Credits

Everything in *Pencil & Paint* is drawn at runtime and there are no image files.
Almost everything it makes a noise with is a handful of oscillators, too — the
pot chimes still are. Three sounds are recordings.

## Sound

Three recordings, all from Wikimedia Commons, all **public domain** — no
attribution required, no royalties, no conditions of any kind. Credited anyway,
because each one is somebody's afternoon and somebody's microphone.

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

### `src/assets/pond.mp3`

The water, while you are fishing.

- Source: *Shallow small river with stony riverbed*, by **stephan**, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Shallow_small_river_with_stony_riverbed.ogg)
- Licence: **Public domain**

Changes made: mixed to mono, high-passed at 90 Hz to take out the handling
rumble, low-passed at 9 kHz, brought up 8 dB to a fixed peak, and looped by
crossfading its own tail back over its head.

It took two goes to get here. The first was a pebble beach, which turned out to
be waves breaking on stones — busy, and the exact opposite of what sitting with
a rod is supposed to feel like. The second was a lovely Dordogne pond, but under
CC BY: free and royalty-free, though it did carry one condition. This one is
water, holds the same level from end to end, and carries nothing at all.

Sixteen seconds, where the others are three quarters of a minute. Length matters
for the birds, where a repeated call gives the loop away; running water has no
landmarks in it, so there is nothing to recognise coming round again.

### `src/assets/birdsong.mp3`

The bird on the tree by the hammock, once the valley is finished.

- Source: *Birds singing in garden*, by **ezwa**, via
  [pdsounds.org](http://www.pdsounds.org/) and
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Birds_singing_in_garden.ogg)
- Recorded: 18 April 2007
- Licence: **Public domain** — no conditions attached; credited here because it
  is somebody's morning and somebody's recording of it.

Changes made: high-passed at 250 Hz to remove the traffic rumble under the
original, levelled, looped by crossfading its tail back over its head, and
re-encoded as mono MP3. Forty-six seconds — very nearly all of the recording —
so that lying in the hammock does not turn into listening to a loop.

Recordings rather than synthesis, in both cases for the same reason. A whistle
is easy and a blackbird answering another blackbird across a garden is not; a low
rumble is easy and a cat is not.
