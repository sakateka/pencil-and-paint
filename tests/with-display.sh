#!/usr/bin/env bash
#
# Run something that needs to draw.
#
#   bash tests/with-display.sh node tests/tools/look.mjs herd
#
# The frame is WebGL, and a browser with no display cannot make a WebGL context
# on this kind of machine — ANGLE goes looking for an X server, finds none, and
# every suite that reads pixels times out waiting for a game that never appears.
# A display fixes it and it does not have to be a screen, so this puts a
# throwaway one behind the command and takes it away afterwards.
#
# Most tests do not need any of this: `npm test` runs them headless in a couple
# of seconds. This is for the ones that look at pixels, and for the instruments.
set -euo pipefail

# Do not take the whole machine.
#
# There is no GPU behind this display, so Mesa draws with llvmpipe — on the
# processor, across every core it can find. Measured with tmp/cpu.mjs: one
# browser at 1864x913 sat on **ten cores**, and the person whose machine it is
# felt it as their own game dropping frames while a suite ran beside it.
#
# Two brakes, both overridable:
#   LP_NUM_THREADS  how many threads llvmpipe rasterises with
#   PENCIL_NICE     the priority the whole run is given
#
# Neither changes what is drawn, and the pixel suites do not care how long they
# take. Raise LP_NUM_THREADS when the run is the only thing on the box and you
# want it over with.
export LP_NUM_THREADS="${LP_NUM_THREADS:-3}"
NICE="${PENCIL_NICE:-15}"

# A display of our own by default, even when DISPLAY is already set.
#
# Trusting an inherited one looked tidier and was wrong: this box exports
# DISPLAY=:0 with a socket behind it that no X server answers, so the browser
# launched, failed, and reported the game as broken rather than the display.
# Set PENCIL_KEEP_DISPLAY=1 to use the one you have — on a workstation with a
# real desktop, that shows you the browser.
if [ -n "${PENCIL_KEEP_DISPLAY:-}" ] && [ -n "${DISPLAY:-}" ]; then
  PENCIL_HEADED=1 exec nice -n "${NICE}" "$@"
fi
unset DISPLAY

# Xvfb and the graphics driver come from the shell, not from the repository.
# Without mesa Chromium falls back to a software renderer, which works and is
# slower; without Xvfb nothing works at all.
if ! command -v Xvfb >/dev/null 2>&1; then
  if [ -n "${PENCIL_NIX:-}" ]; then
    echo "no Xvfb on PATH, and nix-shell did not provide one" >&2
    exit 1
  fi
  export PENCIL_NIX=1
  exec nix-shell -p xorg-server mesa --run "$(printf '%q ' "$0" "$@")"
fi

# A display number of our own, so two runs at once do not collide.
for try in 1 2 3 4 5; do
  number=$((90 + RANDOM % 9))
  if [ ! -e "/tmp/.X11-unix/X${number}" ]; then break; fi
done

Xvfb ":${number}" -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 &
server=$!
trap 'kill "${server}" 2>/dev/null || true' EXIT
# Xvfb is ready when its socket appears; polling beats guessing at a sleep.
for _ in $(seq 1 100); do
  [ -e "/tmp/.X11-unix/X${number}" ] && break
  sleep 0.05
done

DISPLAY=":${number}" PENCIL_HEADED=1 nice -n "${NICE}" "$@"
