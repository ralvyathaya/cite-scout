# CiteScout brand assets

The fox mark comes from the supplied `logo blue.svg`, `logo dark.svg`, and `logo white.svg`. Their paths and colors are preserved. `avatar-512.png` is the supplied `Frame 7.png`, unchanged.

## Choose an asset

| Asset                                              | Use                                             |
| -------------------------------------------------- | ----------------------------------------------- |
| `logo-{blue,dark,white}.svg` / `.png`              | Standalone transparent mark; PNG height 1024px  |
| `lockup-horizontal-{blue,dark,white}.svg` / `.png` | Mark and CiteScout wordmark; PNG width 1368px   |
| `lockup-stacked-{blue,dark,white}.svg` / `.png`    | Centered mark above wordmark; PNG width 1080px  |
| `avatar-512.png`                                   | Original social profile image, 512 × 512        |
| `app-icon.svg`, `icon-192.png`, `icon-512.png`     | Square app icons with a blue gradient           |
| `app-icon-maskable.svg`, `icon-maskable-512.png`   | Android launcher icon with extra safe space     |
| `social-card.svg`, `/og-image.png`                 | Social link preview, 1200 × 630                 |
| `/favicon.svg`, `/favicon.ico`                     | Browser icon; ICO includes 16, 32, and 48px     |
| `/apple-touch-icon.png`                            | Apple home screen icon, 180 × 180               |
| `/site.webmanifest`                                | App name, colors, and Android icon declarations |

## Usage

- Blue: `#1662F9`. Dark: `#1E1E1E`. White: `#FFFFFF`.
- Use blue or dark on a light background; white on a dark background.
- Keep the original proportions. Leave clear space around the mark of at least one quarter of its height.
- Use the mark alone for small icons, and the horizontal lockup where the name needs to be visible.
- The wordmark uses Plus Jakarta Sans Bold, matching the app. Downloadable SVG wordmarks contain paths, so recipients do not need the font installed. The font license is included in `FONT-LICENSE.txt`.
- The app uses the blue mark with live text through `src/client/components/BrandLogo.tsx`; its text follows the surrounding foreground color.
- The social preview uses the canonical domain already configured in `index.html`: `https://cite-scout.com`. Update those absolute image URLs if the production domain changes.

The manifest supplies home screen identity. Offline support and a service worker are outside this brand package.
