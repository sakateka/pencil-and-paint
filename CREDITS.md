# Credits

Everything in *Pencil & Paint* is drawn at runtime; the only pictures in it are
the ones on the easel. Almost everything it makes a noise with is a handful of
oscillators, too — the pot chimes still are. Five sounds are recordings.

## Paintings

`src/assets/paintings/` — our own drawings, photographed and resized. Nothing
here is stock artwork or taken from the internet. They may be saved, shared,
and adapted for noncommercial purposes under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/); commercial use
requires separate written permission from their copyright holders. See
[`LICENSE`](LICENSE) for the attribution requested by the artists.

## Sound

Three recordings come from Wikimedia Commons; the forest heard from the
haystack comes from Freesound. The owl recording was supplied by the project
owner as public domain, but arrived without source metadata, so that provenance
has not been independently verified. The pond is CC BY, which is free to use
and charges nothing — its one condition is the credit below, which was going to
be here regardless.

### `src/assets/owl-great-horned.mp3`

The owl's great horned owl call, when it is clicked.

- Source: supplied by the project owner; original archive unknown
- Licence: represented as **Public domain**;

Changes made: the original MP3 stream is kept without re-encoding and its two
seconds of trailing noise and silence are removed. 2.7 seconds, 44 KiB.

### `src/assets/cuckoo-intro.mp3`

The distant forest while you are lying on the haystack, once every colour has
been found.

- Main source: *Dawn chorus Ashdown Forrest Distact Cuckoo.wav*, by **Simon
  Spiers**, via
  [Freesound](https://freesound.org/people/Simon%20Spiers/sounds/344880/)
- Cuckoos and continuing ambience: *AMBForst_Late Spring.Forest
  Edge.Morning.Byrds.The Cuckoo.A Light Wind In The Trees 2_EM*, by
  **newlocknew**, via
  [Freesound](https://freesound.org/people/newlocknew/sounds/866207/)
- Licences: main forest **[CC0](https://creativecommons.org/publicdomain/zero/1.0/)**;
  cuckoos and continuing ambience **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**

Changes made: the first eighteen seconds of the 48 kHz stereo main forest are
kept locally. The complete, unfiltered stereo excerpt from 1:56 to 2:14 of
newlocknew's recording is laid over it at 70%, preserving its full collection
of birds, wind, and two cuckoos. The stereo mix is encoded as a high-quality MP3
at about 190 kbit/s.

When the walker lies down, the full 3:13 newlocknew preview starts streaming
directly from Freesound at zero volume and seeks to 1:56. During seconds 13–18,
the local mix fades away while the aligned stream rises to 70% of the pond's
0.05 level. It then continues from 2:14 and loops when the full recording ends.
The local intro is 418 KiB; the 4.2 MiB recording is not shipped with the game.

### `src/assets/purr.mp3`

The cat, when you stroke her.

- Source: *Purr (10 sec loopable)*, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Purr_(10_sec_loopable).ogg)
- Licence: **Public domain**

Changes made: cut to one four-second phrase, starting where a murrr begins
and settling before it ends, with the swell at the start and the fade at the
end recorded into the file itself. Encoded as mono MP3 at 64 kbit/s — small,
and the baked-in edges hide whatever the codec does at the ends of a file.

It plays once per stroke and nothing touches its volume afterwards. That is
the fix for a stubborn bug: fading it through the browser stepped audibly (a
fizz of tiny clicks whenever the level moved, which was whenever you walked),
and looping it clicked at the seam in every codec it was tried as, lossless
included. A purr that is a phrase needs neither — it starts when she is
stroked and plays itself out, wherever the walker has got to by then.

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
