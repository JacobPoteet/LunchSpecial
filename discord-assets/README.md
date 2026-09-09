# Discord Activity art assets

Art for the **Discord Activity** listing (the game itself needs no separate build — see
CLAUDE.md § "Discord Activity"). These files are **uploaded by hand to the Discord
Developer Portal**; they are not served by the Worker and not part of the app bundle.

**Three of the four live in [`public/press/`](../public/press/), not here.** They used to be
built into this folder under Discord-specific names, and were byte-for-byte identical to
the press page's copies — 3.6 MB of duplication that could also silently drift, since the
press copies were hand-copied rather than generated. The press page already labels the
single copies with their Discord roles, and a hand upload can come from any folder, so
there is one set now. Regenerate it with:

```bash
npm run assets -- press     # → public/press/{app-icon.png, key-art.png, backdrop.png, …}
```

The preview video is the only image asset that lives here, because nothing else produces
it — it is a one-off that needs ffmpeg:

```bash
# from the repo root
ffmpeg -y -loop 1 -i public/press/key-art.png -vf "scale=1280:720,zoompan=z='min(zoom+0.0005,1.14)':d=225:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=640x360:fps=25,format=yuv420p" -t 9 -r 25 -c:v libx264 -pix_fmt yuv420p -b:v 700k -movflags +faststart discord-assets/preview.mp4
```

## Where each file goes in the Developer Portal

| File | Portal location | Spec | Source art |
|---|---|---|---|
| `../public/press/app-icon.png` | **Settings → General Information → App Icon** | 1024×1024, circular safe zone | `src/assets/art/app-icon.svg` |
| `../public/press/key-art.png` | **Activities → Art Assets → Cover Art** | ≥1024w, 16:9 (also crops to 13:11) — has the title | `public/og-image.jpg`, the site's social card |
| `../public/press/backdrop.png` | **Activities → Art Assets → Embedded Background** | ≥1024w, 16:9 (Grid-view backdrop) | diner backdrop, cropped to 16:9 |
| `preview.mp4` *(optional)* | **Activities → Art Assets → Video Preview** | 640×360 MP4, <1 MB, ≤10s | slow zoom over the cover |

Output is 1280×720 (16:9) — comfortably above Discord's 1024w minimum and sharp on hi-dpi.
Upload the **PNGs**; the `.jpg` beside each one is the press page's own display copy and is
not a Portal asset.

## Sources

All of it is **derived from existing game art** — `src/assets/art/diner-backdrop.png`, the
cloche mark in `src/assets/art/app-icon.svg`, and `public/og-image.jpg`. Nothing here was
drawn for Discord. Edit a source and re-run `npm run assets -- press` to re-raster.

[`scripts/build-assets.mjs`](../scripts/build-assets.mjs) writes a temp `fonts.conf` (in the
OS temp dir) so librsvg resolves the icon's type against the repo's own font folder and
nothing else, making the raster identical on any machine. That is why the app icon's `?` is
set in Alfa Slab One rather than whatever serif the build machine happens to have.

**The cover art is the site's social card**, fitted to 16:9 by width and edge-extended 24px
top and bottom rather than cropped — so a pasted lunchspecial.app link and the Activity
Shelf show the same picture. Its one-line wordmark is wider than Discord's centered 13:11
crop, which clips the script's opening swash and final tail there; the 16:9 hero is whole.
See ASSETS.md for the full reasoning before changing it.

The wordmark matches the in-game marquee (Yellowtail neon script). These remain
**AI-generated placeholders** in the same spirit as the rest of `ASSETS.md` — swap in
commissioned art by editing the sources and re-running, or by replacing the PNGs directly.
