# Monster token art

Every SRD monster can have a painted, top-down token: a cut-out with a
transparent background, drawn on the map as it is (no circle frame). Tokens
with a `monster` and no `img` of their own pick it up automatically; a token's
own `img` always wins.

- [prompts.md](prompts.md): one ready-to-paste prompt per picture, grouped by
  creature type. ★ marks the 40 most common ones; make those first.
- [creatures.json](creatures.json): the source for the prompts. Each entry has
  the file name (`id`), the description (`look`), any 2014/2024 names that
  share the picture (`aliases`) and the key colour (`background`).
- `scripts/token-art.py`: writes the prompts and imports the pictures.

## Making the pictures

1. Paste a prompt into the image generator. Image generators can't make real
   transparency, so every prompt asks for a flat green (`#00FF00`) background;
   green creatures (goblins, trolls, green dragons, plants…) ask for magenta
   (`#FF00FF`) instead. If a picture comes back with a floor, a shadow or a
   vignette, ask again for "the same creature on a perfectly flat background".
2. For a consistent set, keep one good result as a style reference and attach
   it to each new prompt ("same style as this image").
3. Save each picture under the name on its `File:` line, e.g. `goblin.png`,
   `adult-red-dragon.png`. Any 2014 or 2024 name of the monster works too
   (`goblin-warrior.png` lands on the goblin). PNG, JPG and WebP are fine.
   A picture that already has a transparent background works as well.

## Importing

Put the files in one folder (in the project chat they go in the project files
under `tokens/`) and run:

```sh
python3 scripts/token-art.py import path/to/folder
```

It keys out the background (the colour is read from the image border, so
either green or magenta works), trims it, centres it on a 512×512 transparent
square, saves `packages/client/public/art/tokens/<id>.webp` and rewrites
`packages/system-dnd5e/content/token-art.json`, which maps every monster id and its
aliases to a picture. Re-run it whenever new pictures arrive; replacing a
picture is just importing the new file under the same name.

To change a description, edit `creatures.json` and run
`python3 scripts/token-art.py prompts`.

The script needs Pillow and numpy (`pip install pillow numpy`).
