# Discord Activity art assets

Art for the **Discord Activity** listing (the game itself needs no separate build — see
CLAUDE.md § "Discord Activity"). These files are **uploaded by hand to the Discord
Developer Portal**; they are not served by the Worker and not part of the app bundle.

All of it is **derived from existing game art** (`src/assets/art/diner-backdrop.png`, the
cloche/favicon mark, and `public/og-image.jpg`) — nothing new was drawn. Regenerate any
time with:

```bash
npm run assets:discord     # → app-icon.png, cover-art.png, embedded-background.png
```

The preview video is a separate one-off (needs ffmpeg):

```bash
# from discord-assets/
ffmpeg -y -loop 1 -i cover-art.png -vf "scale=1280:720,zoompan=z='min(zoom+0.0005,1.14)':d=225:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=640x360:fps=25,format=yuv420p" -t 9 -r 25 -c:v libx264 -pix_fmt yuv420p -b:v 700k -movflags +faststart preview.mp4
```

## Where each file goes in the Developer Portal

| File | Portal location | Spec | Source art |
|---|---|---|---|
| `app-icon.png` | **Settings → General Information → App Icon** | 1024×1024, circular safe zone | favicon/cloche mark, rebuilt at scale |
| `cover-art.png` | **Activities → Art Assets → Cover Art** | ≥1024w, 16:9 (also crops to 13:11) — has the title | `public/og-image.jpg`, the site's social card |
| `embedded-background.png` | **Activities → Art Assets → Embedded Background** | ≥1024w, 16:9 (Grid-view backdrop) | diner backdrop, cropped to 16:9 |
| `preview.mp4` *(optional)* | **Activities → Art Assets → Video Preview** | 640×360 MP4, <1MB, ≤10s | slow zoom over the cover |

Output is 1280×720 (16:9) — comfortably above Discord's 1024w minimum and sharp on hi-dpi.

## Sources (kept in git)

- `app-icon.svg` — vector source for the icon (edit this, then re-run the build to re-raster).
- `build.mjs` — composites/rasterizes via `sharp`; writes a temp `fonts.conf` (gitignored) so
  librsvg resolves the icon's type against the repo's own font folder and nothing else,
  making the raster identical on any machine.

**The cover art is the site's social card**, fitted to 16:9 by width and edge-extended 24px
top and bottom rather than cropped — so a pasted lunchspecial.app link and the Activity
Shelf show the same picture. Its one-line wordmark is wider than Discord's centered 13:11
crop, which clips the script's opening swash and final tail there; the 16:9 hero is whole.
See ASSETS.md for the full reasoning before changing it.

The wordmark matches the in-game marquee (Yellowtail neon script). These remain
**AI-generated placeholders** in the same spirit as the rest of `ASSETS.md` — swap in
commissioned art by editing the sources and re-running, or by replacing the PNGs directly.
