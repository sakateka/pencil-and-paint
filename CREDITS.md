# Credits

Everything in *Pencil & Paint* is drawn at runtime and there are no image files.
Almost everything it makes a noise with is a handful of oscillators, too — the
pot chimes still are. Three sounds are recordings.

## Sound

Three recordings, all from Wikimedia Commons. Two are public domain. The third
is CC BY, which is free to use and charges nothing — its one condition is the
credit below, which was going to be here regardless.

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

- Source: *Nature sounds ambience in a Dordogne pond*, by **Glaneur de sons**,
  2 May 2007, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Nature_sounds_ambience_in_a_Dordogne_pond.ogg)
- Licence: **[CC BY 3.0](https://creativecommons.org/licenses/by/3.0)** — free
  for any use including commercial, no royalties; the one condition is this
  credit.

Changes made: mixed to mono, high-passed at 100 Hz to take out the handling
rumble, low-passed at 3.8 kHz, brought *down* a couple of decibels, and looped by
crossfading its tail back over its head. Fifty-four seconds, nearly all there
was.

The low-pass is not for tidiness. A sound gets its presence as much from its top
end as from its level, so taking the highs off is what makes it read as *further
away* rather than merely quieter — and further away is what this wants to be. It
is mixed at a twentieth, the quietest thing in the valley.

It took three goes. The first was a pebble beach, which turned out to be waves
breaking on stones. The second was a shallow river, which turned out to sound
exactly like rain — broadband hiss is broadband hiss, whatever the filename
says, and the spectrum alone cannot tell them apart. What a calm pond actually
sounds like is barely water: birds, insects, a breeze, the odd small movement.

This is the only recording of that I could find under any free licence. If the
credit line is unwelcome, the pebble beach and the river are both public domain
and both wrong.

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
