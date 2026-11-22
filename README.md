# kurizu.exe

A hand-built portfolio for **Kurizu** — developer, designer and professional pixel collector.
Purple Y2K desktop collage, floating windows, a chibi mascot, a playable browser game, and all the projects in one place.

No framework, no build step, no dependencies. Just `index.html`, CSS, vanilla JS and self-hosted assets.

---

## Preview it

The site works when you open `index.html` directly, but a local server gives you correct paths, caching behaviour and WebP fonts:

```bash
# from this folder
npx serve .
# or
python -m http.server 8000
```

Then open the URL it prints (for example `http://localhost:8000`).

## Deploy it

Any static host works. Upload the **contents of this folder** (`index.html`, `css/`, `js/`, `game/`, `assets/`).

| Host | What to do |
| --- | --- |
| **GitHub Pages** | Put the contents in the repo root (or in `docs/` and set Pages to that folder). No Actions or build command needed. |
| **Netlify** | Drag this folder into the dashboard, or set publish directory to `.` and leave the build command empty (`netlify.toml` is included). |

### Phase 4 Multiplayer Deployment

The main site and game client are static and run on Netlify. The **Multiplayer Mode** requires a persistent WebSocket server (`game/server.js`), which cannot run directly on Netlify's static CDN.

1. **Host the WebSocket server for free** (Render.com, Railway, or Fly.io):
   - Create a **New Web Service** pointing to your repository (or the `game` folder).
   - Build Command: *(leave empty or `npm install`)*
   - Start Command: `node server.js` (or `node game/server.js` if deploying from repo root)
   - Render gives you a secure URL like `https://your-game.onrender.com`.
2. **Connect the frontend to your server**:
   - In [game/index.html](file:///C:/Users/KURIZU/Documents/AIPET/portfolio/game/index.html), find `const DEFAULT_MP_SERVER = ""` (around line 4460) and set it to your server URL:
     ```javascript
     const DEFAULT_MP_SERVER = "wss://your-game.onrender.com";
     ```
   - Alternatively, players can expand **ADVANCED · SERVER ADDRESS** in the game lobby and enter `your-game.onrender.com` once (it gets saved in `localStorage`).
| **Vercel** | Import the repo, choose “Other”, leave the build command empty. |
| **Cloudflare Pages** | Upload the folder, no build step. |
| **Carrd / Neocities / any host** | Upload the files as-is. |

### After deploying

- Update `og:image` in `index.html` to the **full URL** of the deployed OG image, for example `https://your-domain.com/assets/og.png`. Most social crawlers require an absolute URL.
- Replace the placeholder social handles and links (see below).
- Test the share card with the [Open Graph debugger](https://developers.facebook.com/tools/debug/) or your host’s preview tool.

---

## Editing content

Almost everything lives in **`js/site.config.js`**. Open it in any text editor — it is plain JavaScript with comments.

### Profile, socials, email

```js
socials: [
  { id: "youtube", label: "YouTube", handle: "@yourname", url: "https://youtube.com/@yourname" },
  // github, instagram, tiktok...
],
website: { label: "KURIZUUUU.CARRD.CO", url: "https://kurizuuuu.carrd.co" },
email: "",
donate: { label: "ko-fi", url: "https://ko-fi.com/kurizudev" },
paypal: "https://paypal.me/KurizuDev",
```

- Set `email` to a real address to show the email button. Leave it `""` to hide it.
- `donate` powers both Ko-fi tip buttons (the “official account” card and the contact section). Swap the `url` to change where support goes; the `label` is the button text.
- `paypal` is the link used by the sakuga “donate” buttons. Swap it for your own PayPal.me URL.
- The `id` values (`youtube`, `github`, `instagram`, `tiktok`) choose the icon. Supported icons live in the SVG sprite at the top of `index.html`.
- `website` is used by the “official account” card and footer link.

### Projects

Each object in `projects` becomes a card in `projects.exe` and a case-study modal:

```js
{
  id: "my-project",            // used in the shareable #project-my-project link
  title: "My Project",
  subtitle: "One-line label",
  category: "web",             // all | web | desktop | games | mobile | extension
  categoryLabel: "Web app",    // shown on the card
  year: "2026",
  status: "shipped",           // "shipped" or "in progress"
  featured: true,              // optional: featured badge
  mini: true,                  // optional: show in the hero mini-window row
  art: "browser",              // fallback illustration for cards without an image
  image: "assets/images/my-project.webp",
  imageAlt: "Short description of the image",
  videos: [                    // optional: one or more demo videos
    {
      src: "assets/videos/my-project-showcase.mp4",
      poster: "assets/images/my-project-showcase-poster.webp",
      label: "the full tutorial · 6:41",
    },
  ],
  blurb: "One or two lines for the card.",
  description: "The longer case-study story.",
  highlights: ["What it does", "How it works"],
  tags: ["HTML", "CSS", "JavaScript"],
  gallery: ["assets/images/shot-1.webp", "assets/images/shot-2.webp"],
  links: [
    { label: "GitHub", icon: "github", url: "https://github.com/..." },
  ],
}
```

Recommended project image: **1200 × 760** (16:10), WebP, around 60–150 KB.
Cards crop with `object-fit: cover`; the full image appears in the case-study modal.

Videos are lazy: the modal only shows the poster until you press play (`preload="none"`).
A single `video: { ... }` object still works; `videos: [...]` shows a grid with captions.
Keep showcase clips around 720p/30 fps and a few MB, and leave the full-quality
originals outside this folder (they live in `../media-originals/videos/`).

### The arcade game

`#arcade` embeds **Do Not Stop — Forest Run**, a self-contained Three.js endless runner.

- The game lives in **`game/index.html`** with a local copy of Three.js (`game/three.min.js`), so it also works offline and from `file://`.
- The arcade cabinet opens it in a full-window dialog with a lazy iframe. Closing the dialog resets the iframe and tears the game down; background music pauses while you play and resumes when you leave.
- A game is just a project with `category: "games"` and `play: true`. That adds the “play the game” bar inside its case study; the `#arcade` section itself is hand-written in `index.html`.
- Best score is stored by the game in `localStorage` under `doNotStopMomentumBest`.
- To swap in another game: replace `game/index.html` (and any assets it needs), then update the arcade copy, cover art and the `forest-run` project entry. Keep it relative-path based and it will work when embedded.

### Showreel

`showreel.slides` is a self-timing slideshow. Replace the images with stills or animated WebP frames from your reel:

```js
showreel: {
  title: "KURIZU.SHOWREEL",
  meta: "2026 · 0:24",
  slides: [
    { image: "assets/images/reel-01.webp", kicker: "AIPET", caption: "a tiny desktop gremlin" },
  ],
},
```

### Background music

`music` is the playlist behind the little player in the hero (and the sound buttons in the
topbar, taskbar and start menu). The first track is loaded on page load and playback starts
automatically — if the browser blocks autoplay, the first click or keypress starts it instead.

```js
music: [
  { title: "pixel daydream", note: "the original loop", src: "assets/music/pixel-daydream.mp3" },
],
```

The player has prev / play / next, a volume slider, shuffle and a three-state repeat
(off → whole playlist → one track). Volume, shuffle and repeat are remembered in
`localStorage` under `kurizu.player`.

### Showcase cards

`videoLinks` powers the cards next to the reel. A card with a `project` id opens
that project's case study (where its demo videos live); a card with a `url` links out instead:

```js
{ id: "pixify", project: "pixify", kicker: "SHOWCASE", title: "...", note: "...", art: "assets/images/thumb.webp" }
{ id: "devlogs", kicker: "DEVLOGS", title: "...", note: "...", art: "assets/images/thumb.webp", url: "https://youtube.com/..." }
```

### Gallery

`gallery` is the `art_gallery.exe` masonry grid, filtered by `category`:
`digital`, `traditional` or `projects` (the curated project art). Any aspect ratio works.

```js
{
  image: "assets/arts/digital/my-piece.webp",        // grid thumbnail
  full: "assets/arts/digital/my-piece-full.webp",    // lightbox version (optional)
  title: "my piece",
  meta: "digital art",
  alt: "short description for screen readers",
  category: "digital",
  animated: true,                                    // adds the little GIF badge
},
```

Thumbnails are ~640 px WebP, `full` versions up to 1400 px (animated pieces stay WebP
animations). Originals live outside this folder in `../media-originals/arts/`.

### Hero and about copy

The hero intro, about paragraphs, terminal lines and section headings are written directly in **`index.html`** (they are part of the layout, not the config). Search for the text you want to change.

### Colors and type

Design tokens are at the top of **`css/style.css`**:

```css
:root {
  --plum: ...;
  --pink: ...;
  --lime: ...;
  --font-display: "Chango", ...;
  --font-pixel: "Silkscreen", ...;
  --font-ui: "Quicksand", ...;
}
```

Fonts live in `assets/fonts/` and are embedded as base64 in `css/fonts.css` so the typography also works when `index.html` is opened directly from disk (browsers block local font requests). To swap one, replace the base64 block in `css/fonts.css` — or go back to loading the `.woff2` files over HTTP by moving the `@font-face` rules into `style.css`.

### Works offline

Because the fonts are embedded, the site can be opened by double-clicking `index.html` with no server. A local server is still recommended for a realistic preview and for deployment testing.

---

## File map

```
portfolio/
├── index.html              # markup, icon sprite, metadata
├── css/
│   ├── fonts.css           # embedded WOFF2 fonts (offline-friendly)
│   └── style.css           # all styles, tokens, responsive rules
├── js/
│   ├── site.config.js      # ← edit content here
│   └── main.js             # rendering + interactions
├── game/
│   ├── index.html          # Do Not Stop — Forest Run (playable)
│   └── three.min.js        # vendored Three.js r128
└── assets/
    ├── fonts/              # source WOFF2 files (embedded in css/fonts.css)
    ├── images/             # screenshots, project covers, photos
    ├── sprites/            # mascot WebP animations + stills
    ├── arts/               # personal artwork: digital/ + traditional/ (web versions)
    ├── music/              # background tracks (originals in ../media-originals/music/)
    ├── videos/             # web-optimized showcase clips (originals in ../media-originals/videos/)
    ├── custom cursor/      # pointer.gif / wait.gif + static PNG fallbacks
    ├── Pet/                 # Wisteria's animations (animated WebP, sources in ../media-originals/pet/)
    ├── favicon.svg
    └── og.png              # 1200 × 630 share card
```

### Interactions included

- Search across projects, sections and links — `Ctrl/Cmd + K`, arrow keys, Enter.
- Project filters, grid/list view, deep-linkable case studies (`#project-id`).
- Gallery filters (everything / digital / traditional / projects) + lightbox with arrow keys.
- Showreel play/pause, slide dots, next frame.
- Background music player: autoplay with gesture fallback, volume, shuffle, repeat. Featured loop is now **8-bit chiptune**; music pauses while any showcase video plays.
- Arcade: play **Do Not Stop — Forest Run** in-page (keyboard or touch), best-score readout, fullscreen, and a play bar inside its case study.
- Wisteria pet: walking/idle/pat/poke/talk animations from `assets/Pet/` (animated WebP, random pick per mood), chat bubbles, head-pat on hover, poke reactions, random chatter.
- Wisteria chat: taskbar popup (`#petChatToggle`) → phone-shaped chat window, canned keyword replies (no AI), action animation before routing to a project / the art bay / a social.
- Ko-fi and PayPal tip buttons in the “official account” card and contact section, driven by `donate` / `paypal` in the config.
- Case-study demo videos and AIPet's tutorial + samples, all lazy-loaded.
- Parallax-ticket tilt on project cards and case-study heroes.
- Animated chibi cursors (`pointer.gif` / `wait.gif`) with a static fallback.
- Start menu, mobile menu, live Manila clock, copy-link buttons.
- Respects `prefers-reduced-motion`; visible focus states and keyboard-operable cards/dialogs.

---

## Before you publish — checklist

- [ ] Replace YouTube / Instagram / TikTok handles and URLs in `js/site.config.js` (GitHub is verified).
- [ ] Add an email address, or keep it blank to hide the email button.
- [ ] Point `website` at your real site (currently the Carrd).
- [ ] Change `og:image` and `twitter:image` in `index.html` to the absolute deployed URL.
- [ ] Replace or approve the placeholder copy where needed (“9 projects”, “5 platforms”, the about stats).
- [ ] Test the site on a phone with the real files served from your host.
- [ ] Optional: swap the AIPet tutorial for a shorter cut if the 11 MB file feels heavy.

## Notes

- No cookies, no analytics, no backend. The contact options are links, not a form.
- Music is a plain `<audio>` playlist in `assets/music/` — no streaming service involved. “pixel
  daydream” was rendered from the old in-browser synth so every track behaves the same.
- Personal artwork is served as WebP from `assets/arts/`; the flattened GIFs became animated
  WebP for the lightbox with a still frame as the grid thumbnail.
- Animated mascots use WebP with `-still` fallbacks for reduced motion.
- Animated project posters are true animated WebP (the originals were GIFs renamed to `.webp`). Source GIFs live in `../media-originals/posters/`.
- DNS Changer PH, LANShare and FireSword + AIBot currently use custom cover art instead of live screenshots. Swap in real screenshots from those apps when you have them, keeping the 1200 × 760 ratio.
- The Malfoy.exe cover and gallery are frames from its own showcase video; swap in a nicer still whenever you like.
- The project cards tilt toward the cursor (parallax ticket effect) and the case-study hero does the same with deeper layers. Both respect `prefers-reduced-motion`.
- The animated cursors are `pointer.gif` (everything) and `wait.gif` (page load / video buffering), with static PNG fallbacks for reduced motion or no JS.
