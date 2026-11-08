#!/bin/sh
# First start: the home game is a copy of the sample world, kept in /data so
# edits survive new images.
set -e
if [ ! -f "$VTT_GAME/game.json" ]; then
  echo "[deploy] no home game in $VTT_GAME, copying the sample world"
  mkdir -p "$VTT_GAME"
  cp -r /app/world/. "$VTT_GAME/"
fi
exec "$@"
