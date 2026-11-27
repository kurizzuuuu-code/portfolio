/* ============================================================
   KURIZU — site config
   ------------------------------------------------------------
   This is the only file you need to touch to update the site's
   content. Add projects, change links, swap the reel. No build.
   ============================================================ */

window.KURIZU = {
  name: "kurizu",
  role: "developer, designer & pixel collector",
  location: "Philippines",
  timezone: "Asia/Manila",
  available: true,
  availability: "open for collabs",

  /* NOTE: GitHub is the verified account. Replace the placeholder
     YouTube / Instagram / TikTok handles and urls with your real
     profiles before publishing. */
  socials: [
    {
      id: "youtube",
      label: "YouTube",
      handle: "@kurizzuu",
      url: "https://www.youtube.com/@kurizzuu",
    },
    {
      id: "github",
      label: "GitHub",
      handle: "@kurizzuuuu-code",
      url: "https://github.com/kurizzuuuu-code",
    },
    {
      id: "instagram",
      label: "Instagram",
      handle: "@kurizu.dev",
      url: "https://www.instagram.com/kurizu.dev/",
    },
    {
      id: "tiktok",
      label: "TikTok",
      handle: "@kurizu.archive",
      url: "https://www.tiktok.com/@kurizu.archive",
    },
  ],

  website: {
    label: "KURIZUUUU.CARRD.CO",
    url: "https://kurizuuuu.carrd.co",
  },

  /* Leave empty to hide the email button. Add e.g. "hi@kurizu.dev". */
  email: "",

  /* Tip jar / donation button. Swap the url to change where support goes. */
  donate: {
    label: "ko-fi",
    url: "https://ko-fi.com/kurizudev",
  },

  /* Legacy PayPal tip link (still wired to the sakuga "donate" buttons). */
  paypal: "https://paypal.me/KurizuDev",

  /* Background music playlist. The first track starts on load (if the
     browser allows it), then shuffle / repeat take over. */
  music: [
    {
      title: "8-bit chill kurizu",
      note: "main theme · chill chiptune",
      src: "assets/music/8-bit chill kurizu.mp3",
    },
    {
      title: "day 1",
      note: "fresh start loop",
      src: "assets/music/Day 1.mp3",
    },
    {
      title: "8-bit chiptune",
      note: "pixel arcade energy",
      src: "assets/music/chiptune-8bit.mp3",
    },
    {
      title: "cozy village",
      note: "soft chiptune",
      src: "assets/music/cozy-village.mp3",
    },
    {
      title: "pixel daydream",
      note: "the original loop",
      src: "assets/music/pixel-daydream.mp3",
    },
    {
      title: "8-bit sonata",
      note: "chiptune, but sad",
      src: "assets/music/chiptune-sonata.mp3",
    },
    {
      title: "by your side",
      note: "warm and slow",
      src: "assets/music/by-your-side.mp3",
    },
    {
      title: "spaces inbetween",
      note: "dreamy little loop",
      src: "assets/music/spaces-inbetween.mp3",
    },
  ],

  pet: {
    name: "Wisteria",
    tagline: "the little gremlin of this corner",
    moods: {
      action: [
        "assets/Pet/action animation/SampleCharacter7_Button_2026-11-17-16-31-38.webp",
      ],
      headpat: [
        "assets/Pet/head pat animation/SampleCharacter7_Blushing 1_2026-11-17-16-30-12.webp",
        "assets/Pet/head pat animation/SampleCharacter7_Blushing 2_2026-11-17-16-30-19.webp",
        "assets/Pet/head pat animation/SampleCharacter7_Pat 2_2026-11-17-16-34-11.webp",
        "assets/Pet/head pat animation/SampleCharacter7_Pat_2026-11-17-16-34-03.webp",
      ],
      idle: [
        "assets/Pet/idle animation/(Helltaker).webp",
        "assets/Pet/idle animation/Dance (Scuba).webp",
        "assets/Pet/idle animation/Idea.webp",
        "assets/Pet/idle animation/Laugh (Point).webp",
        "assets/Pet/idle animation/SampleCharacter7_Bite 2_2026-11-17-16-30-01.webp",
        "assets/Pet/idle animation/SampleCharacter7_Blep 1_2026-11-17-16-28-45.webp",
        "assets/Pet/idle animation/SampleCharacter7_Greeting 1_2026-11-17-16-32-35.webp",
        "assets/Pet/idle animation/SampleCharacter7_Lick (IceCream)_2026-11-17-16-32-59.webp",
        "assets/Pet/idle animation/SampleCharacter7_Pillow (Lick)_2026-11-17-16-35-53.webp",
        "assets/Pet/idle animation/SampleCharacter7_Pillow (Rub)_2026-11-17-16-35-38.webp",
        "assets/Pet/idle animation/SampleCharacter7_Pillow (Rub2)_2026-11-17-16-35-46.webp",
        "assets/Pet/idle animation/SampleCharacter7_Pumpkin_2026-11-17-16-36-27.webp",
        "assets/Pet/idle animation/Spray.webp",
        "assets/Pet/idle animation/Trash Bin.webp",
        "assets/Pet/idle animation/TrashTuber Idle.webp",
      ],
      poke: [
        "assets/Pet/poke animation/SampleCharacter7_Boop_2026-11-17-16-30-57.webp",
        "assets/Pet/poke animation/SampleCharacter7_Hurt_2026-11-17-16-32-43.webp",
        "assets/Pet/poke animation/SampleCharacter7_Press_2026-11-17-16-36-16.webp",
        "assets/Pet/poke animation/SampleCharacter7_Rub 1_2026-11-17-16-36-37.webp",
        "assets/Pet/poke animation/SampleCharacter7_Yay_2026-11-17-16-38-01.webp",
      ],
      talk: [
        "assets/Pet/talking animation/SampleCharacter7_PNGTuber Talk_2026-11-17-16-35-59.webp",
        "assets/Pet/talking animation/TrashTuber Talk.webp",
      ],
      walk: [
        "assets/Pet/walking animation/SampleCharacter7_Press_2026-11-17-16-36-16.webp",
        "assets/Pet/walking animation/SampleCharacter7_Rub 1_2026-11-17-16-36-37.webp",
      ],
    },
    bubbles: {
      poke: [
        "stop poking me!!",
        "do i look like a piñata?",
        "ouch. that was a pat to the feelings.",
        "i'm warning you...",
        "you're lucky i'm cute.",
      ],
      pat: [
        "pat pat ♡ best pats in the whole wide web",
        "you're the best human I know. don't tell the others.",
        "soft hands only. hard hands are for the arcade.",
      ],
      talk: [
        "did you know i once talked a whole weekend away?",
        "i painted the wobble studio's little mascot. no ai, just vibes.",
        "pixel daydream was playing while i learned to walk. wait, i learned to walk before that.",
        "the forest run arcade is my favourite project on this site. fight me.",
      ],
      action: [
        "ooh! ooh! show me something!!",
        "okay okay, preparing the big show.",
      ],
    },
    facts: [
      "i built a cursed little virus once. it just yelled at people and honestly? it was doing great work.",
      "the arcade cabinet plays a three lane game and i still can't beat my own best score.",
      "my favourite colour is every shade of purple between plum and grape. fight me.",
      "the whole portfolio is hand built. not a single framework was harmed.",
      "i made a bot that pats. this is that bot's cousin.",
      "the forest trail never ends, but my attention span does.",
    ],
    dialogue: {
      greetings: [
        "hewwo! (•ᴗ•)ﾉ wisteria at your service! happy you stopped by my corner of the web ♡",
        "hi hi human! did you come here to give me headpats or check out Kurizu's projects? (˶ᵔ ᵕ ᵔ˶)",
        "yooo! wisteria's online, vibes are at 100%, and ready to chat! what's on your mind?",
        "hey there! don't forget to poke me on the desktop so i can do my bouncy jump! ✨",
        "hello hello! welcome to kurizu.exe! ask me anything about the projects or just vibe with me ♡",
      ],
      howAreYou: [
        "i'm doing wonderful! vibing on the taskbar, dodging bugs, and soaking in all the purple pixels ♡",
        "feeling bouncy and full of energy! (•̀ᴗ•́)و how are you doing today, human?",
        "living my best gremlin life! 100% vibes, zero frameworks harmed. what about you?",
      ],
      whoAreYou: "i'm Wisteria! Kurizu's purple desktop companion & resident gremlin mascot ♡ i live on this website, chat with visitors, bounce when poked, and show off cool projects!",
      whoIsKurizu: "Kurizu is a self-taught developer, designer & pixel collector from the Philippines! He builds desktop apps (like AIPet and Malfoy), creative tools (Pixify, Wobble Studio), pixel games, and this whole retro desktop website!",
      love: "waaah! ♡ (⸝⸝ᴗ﹏ᴗ⸝⸝) my pixels are blushing! wait... is this the secret passphrase to shut down Malfoy.exe or do you really mean it? either way, headpats accepted!",
      cute: "hehe thank you!! (´｡• ᵕ •｡`) purple gremlins have the most charisma, it's scientifically verified by Kurizu!",
      thanks: "you're very welcome! (•̀ᴗ•́)و wisteria's always happy to help. you can tip me in ram coins and headpats!",
      bye: "bye bye! don't be a stranger, come back and poke me again soon~ ♡ (•ᴗ•)ﾉ",
      bounce: "boing!! if you poke me directly on my desktop sprite, i'll do a big bouncy jump into the sky for you! ✨ try clicking me!",
      pat: "soft hands only! headpats give me +100 happiness and keep my mischievous gremlin side under control ♡",
    },
  },

  categories: [
    { id: "all", label: "everything", icon: "folder" },
    { id: "web", label: "web apps", icon: "globe" },
    { id: "desktop", label: "desktop", icon: "desktop" },
    { id: "games", label: "games & mods", icon: "gamepad" },
    { id: "mobile", label: "mobile", icon: "phone" },
    { id: "extension", label: "extensions", icon: "puzzle" },
  ],

  projects: [
    {
      id: "wisp",
      title: "Wisp",
      subtitle: "Purple pixel download manager + browser extension",
      category: "desktop",
      categoryLabel: "Desktop app",
      year: "2026",
      status: "shipped",
      isNew: true,
      featured: true,
      mini: true,
      art: "wisp",
      image: "assets/images/project-wisp.png",
      imageAlt: "Wisp purple pixel download manager interface with Wisteria keeping the hoard",
      blurb:
        "One wisp, many hands — a purple pixel Windows download manager built with Tauri 2 + Rust that splits downloads across up to 16 connections, resumes crashes, and pairs with a direct-download browser extension.",
      description:
        "Wisp is a purple pixel download manager for Windows powered by Tauri 2 + Rust and themed around Wisteria keeping your hoard. It splits HTTP Range downloads across up to 16 parallel workers, handles YouTube and 1,000+ video sites via yt-dlp, persists block cursors to survive crashes and pauses cleanly, and ships with a companion Chrome/Edge/Brave Manifest V3 extension that intercepts downloads, media, links, and .torrent files straight into Wisp.",
      highlights: [
        "Segmented HTTP Range downloads with up to 16 parallel workers + honest single-connection fallback",
        "YouTube + 1,000+ sites supported through yt-dlp with optional ffmpeg merging",
        "Crash-safe pause/resume persisting block cursors & settings locally (no cloud or telemetry)",
        "Companion Chrome/Edge/Brave extension (v0.2.0) — download directly below to intercept links, media & torrents",
        "Built with Tauri v2 + Rust + vanilla HTML/CSS/JS — tiny footprint, zero Chromium bloat",
      ],
      tags: ["Tauri", "Rust", "Chrome Extension", "JavaScript"],
      gallery: [
        "assets/images/project-wisp.png",
      ],
      extensionInstallNote:
        "To use the browser extension with Wisp: click “download extension (.zip)” above, unzip the folder, open chrome://extensions (or edge://extensions), enable Developer mode, click Load unpacked, and select the unzipped folder while Wisp is running.",
      links: [
        {
          label: "download Wisp (Windows)",
          icon: "download",
          url: "https://mega.nz/file/7TQz3Iia#8-ta0GHqY5z4S3Y5j70ij03NQdgLrMh2y4WD3DeGBY8",
          primary: true,
        },
        {
          label: "download extension (.zip)",
          icon: "puzzle",
          url: "assets/downloads/wisp-extension.zip",
          download: "wisp-extension.zip",
          primary: true,
        },
      ],
      devlogs: [
        {
          version: "v0.2.0",
          tag: "latest · extension + local bridge",
          title: "Browser Extension v0.2.0 Auto-Intercept, Media & Torrent Capture",
          added: [
            "Manifest V3 Chrome/Edge/Brave companion extension intercepting browser downloads, context-menu links, media, and .torrent files",
            "Localhost HTTP bridge (127.0.0.1:17890–17899) with popup status & port scanner so the extension pairs instantly with Wisp",
          ],
          changed: [
            "Added direct cookie & referrer forwarding for gated downloads queued from the extension",
          ],
        },
        {
          version: "v0.1.0",
          tag: "initial release",
          title: "Tauri 2 + Rust 16-Worker Engine & Wisteria Hoard UI",
          added: [
            "Parallel range scheduler splitting files into 512 KiB–16 MiB blocks with live per-segment rails and 30s speed sparkline",
            "Crash-safe JSON persistence, yt-dlp video support, and interactive Wisteria mascot reacting to hoard progress",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "aipet",
      title: "AIPet",
      subtitle: "Desktop virtual pet",
      category: "desktop",
      categoryLabel: "Desktop app",
      year: "2026",
      status: "shipped",
      featured: true,
      mini: true,
      art: "aipet",
      image: "assets/sprites/idle-still.webp",
      imageAlt: "AIPet chibi sprite writing in a notebook",
      videos: [
        {
          src: "assets/videos/aipet-tutorial.mp4",
          poster: "assets/images/aipet-tutorial-poster.webp",
          label: "the full tutorial · 6:41",
        },
        {
          src: "assets/videos/aipet-sample-1.mp4",
          poster: "assets/images/aipet-sample-1-poster.webp",
          label: "Start · The begining of the Project",
        },
        {
          src: "assets/videos/aipet-sample-2.mp4",
          poster: "assets/images/aipet-sample-2-poster.webp",
          label: "Adding · Vision",
        },
      ],
      blurb:
        "A tiny purple gremlin that lives on your Windows desktop — custom sprites, physics, moods and headpats. Built with Tauri instead of Electron.",
      description:
        "AIPet is a transparent, always-on-top desktop companion for Windows. Drop in your own GIF, WebP or PNG sprites for every mood, then drag it around, pet it, and listen to it ramble in a speech bubble. It remembers its position, settings and happiness between launches, and hides away in the tray when you need to focus.",
      highlights: [
        "Custom idle, walk, talk, happy and held sprites",
        "Drag, drop and gravity with a transparent always-on-top window",
        "Petting, hearts, random phrases and a speech bubble",
        "Tray controls, ghost mode and a full settings GUI",
        "Tauri v2 + Rust — no bundled Chromium",
      ],
      tags: ["Tauri", "Rust", "JavaScript", "WebView2"],
      gallery: [
        "assets/sprites/idle-still.webp",
        "assets/sprites/pet-still.webp",
        "assets/sprites/mascot-still.webp",
      ],
      links: [
        {
          label: "play on itch.io",
          icon: "globe",
          url: "https://wizteria.itch.io/desktop-gremlin",
        },
        {
          label: "GitHub",
          icon: "github",
          url: "https://github.com/kurizzuuuu-code/Desktop-virtual-pet",
        },
      ],
      devlogs: [
        {
          version: "v1.82.0",
          tag: "latest · full & lite",
          title: "Minecraft Bedrock Autopilot, Discord Voice + DJ Booth & Streaming TTS",
          added: [
            "Minecraft Bedrock Autopilot (bedrock-autopilot.js) alongside Java Edition Mineflayer bot (minecraft-bot.js) with raycast 'look there' / 'look at me' & mod skill casting ('cast gungnir')",
            "Two-way Discord Voice Channel conversation + native libopus Discord DJ Booth (!play, Spotify links, smart !shuffle without repeats, !loop, !queue)",
            "Streaming AI chat & sentence-by-sentence TTS playback (built-in 180MB VOICEVOX Core, Edge TTS, and offline Kokoro worker vox-kokoro-worker.js)",
            "Quick Overlay panel (quick/), persistent Memory Editor tab, Say-as-Pet manual speech box, and customizable Content / Word Filter modes",
          ],
          changed: [
            "Split releases into Desktop Gremlin Full (182 MB with built-in offline VOICEVOX Core) and Lite (89 MB using Edge TTS / Kokoro)",
            "Refined Minecraft chat/command routing so the pet can guard, mine, collect drops, follow players, and answer in-game chat simultaneously",
          ],
        },
        {
          version: "v1.81.10",
          tag: "performance & vision",
          title: "Screen Vision State Fixes & Live CPU / RAM / VRAM Telemetry",
          added: [
            "Dedicated Stats tab with real-time CPU, RAM, and GPU VRAM graphs (queries nvidia-smi on NVIDIA GPUs and Windows performance counters on AMD/Intel)",
            "Built-in local Screen Vision worker (vision-builtin-worker.js) so the pet can inspect active windows without external API keys",
          ],
          changed: [
            "Fixed thinking animation getting stuck after Screen Vision snapshots",
            "Added anti-repeat cooldowns on auto-look when switching between the same application windows",
            "Major RAM and VRAM footprint reductions across idle and background worker threads",
          ],
        },
        {
          version: "v1.81.0 – v1.81.8",
          tag: "vtube studio & live streams",
          title: "VTube Studio Live2D Bridge, TikTok LIVE & Wake-Word Hearing",
          added: [
            "VTube Studio WebSocket bridge (vts-client.js) driving Live2D models with real-time lip-sync, idle head/body sway, eyes-dart-first gaze tracking, and hotkey triggers",
            "TikTok LIVE stream connector (tiktok-worker.js) that reads live chat, gift combos, and new followers out loud in character",
            "Wake-word microphone hearing ('KURIZU, …') powered by Gemini, Groq Whisper, or 100% offline Local Whisper (Xenova/whisper-tiny.en) with room-noise auto-calibration",
            "Beat-locked music jamming with automatic smile expressions when Spotify or desktop audio is playing",
          ],
          changed: [
            "Unified portable .exe and NSIS installer build pipeline with automatic WebView / Electron cache cleanup",
            "Smoothed Live2D mouth-open vowel curve so speech bubbles and voice lines stay frame-synced",
          ],
        },
        {
          version: "v1.80.0 – v1.80.6",
          tag: "audio & physics polish",
          title: "Zero Audio Ducking, Wall-Throw Physics & Sleep Schedule",
          added: [
            "Automatic Sleep Schedule (23:00 – 07:00) with a 10-minute interaction snooze when you poke or chat with the pet late at night",
            "Play Mode cursor chase & pounce physics — the gremlin stalks your mouse pointer and leaps across windows",
          ],
          changed: [
            "Fixed Windows / Chromium communication audio ducking by disabling AEC/AGC on mic & loopback capture and reusing a single shared AudioContext",
            "Capped wall-throw sulk timer to ~17s so impact barks no longer cut off longer spoken sentences mid-thought",
          ],
        },
        {
          version: "v1.78.3",
          tag: "audio engine",
          title: "Bundled FFmpeg & Out-of-the-Box Discord Audio",
          added: [
            "Bundled ffmpeg-static directly inside app resources so Discord DJ Booth and voice transcoding work immediately with zero external installs",
          ],
          changed: [
            "Hardened opus packet framing and automatic reconnect when switching Discord voice channels",
          ],
        },
        {
          version: "v1.60.0",
          tag: "social & multi-pet",
          title: "Multi-Pet Households, Game OCR Trash-Talk & Prank Kit",
          added: [
            "Multi-pet households — spawn multiple desktop pets that hold pet-to-pet conversations, form friendships, get jealous, trade gifts, and play tag or rock-paper-scissors",
            "Game reaction engine using window titles, process detection, and screen OCR to celebrate victories or roast defeats in real time",
            "Multi-provider AI brain (OpenAI, Ollama local LLMs, Gemini, OpenRouter) with persistent long-term JSON memory",
            "Optional reversible desktop prank kit (prank/) and Spotify now-playing dance triggers",
          ],
          changed: [
            "Upgraded sprite loader to hot-reload custom GIF, WebP, and PNG mood folders without restarting the app",
          ],
        },
        {
          version: "v1.2.0 – v1.8.5",
          tag: "foundation",
          title: "Core Transparent Desktop Companion & Typewriter Speech Engine",
          added: [
            "Transparent, click-through always-on-top desktop window with custom idle, walk, talk, pat, poke, and held sprites",
            "Drag-and-drop gravity physics with floor bounce, screen-edge collisions, and heart particle bursts on headpats",
            "Undertale-style per-character synth voice bleeps and visual-novel typewriter text animations (pop, wave, fade, rainbow)",
            "System tray menu, ghost click-through mode, and persistent local settings",
          ],
          changed: [
            "Tuned physics tick loop to sleep when idle so background CPU usage stays near 0%",
          ],
        },
      ],
    },
    {
      id: "pixify",
      title: "KURIZU.pixify",
      subtitle: "Pixel art cleaner + vectorizer",
      category: "web",
      categoryLabel: "Web app",
      year: "2026",
      status: "shipped",
      mini: true,
      image: "assets/images/pixify-pixel.webp",
      imageAlt: "KURIZU.pixify dark purple interface cleaning a pixel art sunset",
      video: {
        src: "assets/videos/pixify-showcase.mp4",
        poster: "assets/images/pixify-showcase-poster1.webp",
        label: "KURIZU.pixify showcase",
      },
      blurb:
        "Paste an AI-smeared pixel image and get a crisp grid back. Or trace any raster into clean SVG paths — all inside the browser.",
      description:
        "pixify is a browser-only cleanup tool for AI-generated pixel art, plus a raster-to-SVG vectorizer. It detects the pixel grid with two independent estimators, samples each cell, quantizes the palette and cleans up stray pixels and holes. Everything runs locally — images never leave the device.",
      highlights: [
        "Run-length and edge-autocorrelation grid detection",
        "Dominant, median, mean and centre cell samplers",
        "Median-cut palette quantization with an editable palette",
        "Stray-pixel, hole-fill and jaggy smoothing passes",
        "Vector mode traces real SVG paths, not an embedded bitmap",
      ],
      tags: ["JavaScript", "Canvas", "SVG", "Image processing"],
      gallery: [
        "assets/images/pixify-pixel.webp",
        "assets/images/pixify-vector.webp",
      ],
      links: [
        {
          label: "live website",
          icon: "globe",
          url: "https://kurizupixify.netlify.app/",
        },
      ],
      devlogs: [
        {
          version: "v2.1.0",
          tag: "latest",
          title: "Raster-to-SVG Vectorizer & Editable Palette Swatches",
          added: [
            "True SVG path contour tracer that converts cleaned pixel grids or illustrations into crisp, scalable vector paths",
            "Interactive palette editor allowing manual color merges, locked swatches, and 1-click Lospec-style palette presets",
            "Side-by-side split comparison slider with pixel-accurate zoom and pan",
          ],
          changed: [
            "Improved edge-autocorrelation grid detector to handle uneven AI-generated sub-pixel borders",
            "Moved heavy quantization passes off the main thread for instant live previews",
          ],
        },
        {
          version: "v1.4.0",
          tag: "cleanup engine",
          title: "Despeckle, Jaggy Smoothing & Multi-Sampler Pipeline",
          added: [
            "Stray-pixel despeckle, 1px hole-fill, and L-corner jaggy cleanup passes",
            "Four cell sampling modes: Dominant, Median, Mean, and Center-point",
          ],
          changed: [
            "Replaced simple uniform quantization with Median-Cut color clustering for sharper retro palettes",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "Run-Length Grid Estimator & Local Canvas Export",
          added: [
            "Automatic pixel grid pitch detection and 1:1 true-resolution PNG export (plus integer upscaling 2x–16x)",
            "Clipboard paste, drag-and-drop loader, and 100% client-side processing",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "wobble",
      title: "Wobble Studio",
      subtitle: "Paint-on motion animator",
      category: "web",
      categoryLabel: "Web app",
      year: "2026",
      status: "shipped",
      image: "assets/images/wobble-studio.webp",
      imageAlt: "Wobble Studio interface with the Kurizu chibi loaded on the canvas",
      video: {
        src: "assets/videos/wobble-showcase.mp4",
        poster: "assets/images/wobble-showcase-poster1.webp",
        label: "Wobble Studio showcase",
      },
      blurb:
        "Paint a part of a picture, give each colour a motion, and export a loop. Pseudo-Live2D without the rigging.",
      description:
        "Wobble Studio turns a still drawing into a looping animation by painting motion onto it. Every paint colour gets its own motion preset — sway, jiggle, breathe, flutter, flame, ripple and more. The renderer uses a soft pull weight derived from the paint map, so strokes behave like a rubber sheet instead of a hard cut-out.",
      highlights: [
        "13 paint colours and 32 motion presets",
        "Feathered brush and a colour-matching fill tool",
        "Rubber-sheet pull instead of hard masks",
        "Export PNG, sprite sheet, frame sequence or video",
        "Runs fully client-side on WebGL2",
      ],
      tags: ["WebGL2", "JavaScript", "Creative tools", "Canvas"],
      gallery: ["assets/images/wobble-studio.webp"],
      links: [
        {
          label: "live website",
          icon: "globe",
          url: "https://kurizu-wobble-studio.netlify.app/",
        },
      ],
      devlogs: [
        {
          version: "v1.6.0",
          tag: "latest",
          title: "32 Motion Presets, Color-Match Flood Fill & Sprite Sheet Exporter",
          added: [
            "Expanded preset library to 32 procedural motions including breathe, hair flutter, jelly bounce, flame flicker, and heartbeat",
            "Smart tolerance flood-fill bucket and feathered falloff brush for seamless limb/hair zones",
            "Seamless loop exporter for sprite sheets, PNG frame zips, and WebM/MP4 video clips",
          ],
          changed: [
            "Upgraded WebGL2 displacement shader with Gaussian rubber-sheet weight falloff so painted edges never tear pixels",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "13-Channel Paint Map & Real-Time WebGL2 Mesh Warp",
          added: [
            "13 independent color channels each assignable to custom amplitude, frequency, angle, and phase offset",
            "Live 60fps WebGL2 preview with onion-skin mask overlay",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "malfoy",
      title: "Malfoy.exe",
      subtitle: "Harry Potter–inspired desktop prank",
      category: "desktop",
      categoryLabel: "Desktop prank",
      year: "2026",
      status: "shipped",
      mini: true,
      image: "assets/images/project-malfoy.webp",
      imageAlt: "Malfoid prank app sitting on a purple night desktop under a crescent moon",
      video: {
        src: "assets/videos/malfoy-showcase.mp4",
        poster: "assets/images/malfoy-showcase-still.webp",
        label: "Malfoy.exe showcase",
      },
      blurb:
        "A very polite little curse for your desktop. Malfoid walks in, talks trash, melts your screen and fakes a full System32 meltdown — then leaves when you say the magic words.",
      description:
        "Malfoy.exe is a Harry Potter–inspired desktop prank shipped as a self-contained Windows app. A little white-haired gremlin walks onto your desktop, waves, insults you, then “takes your PC”: the screen melts, fake cmd.exe windows claim to delete System32 (and multiply when you close them), and a fake BSOD rolls into a fake shutdown. Nothing is actually deleted and your PC never restarts. The prank stops the moment you type “i love you malfoid”, or you can tap DELETE three times in an emergency.",
      highlights: [
        "Malfoid walks, waves and trash-talks you from the desktop",
        "Screen-melt overlay with fake terminal windows that multiply",
        "Fake System32 deletion, BSOD and shutdown sequence",
        "Type “i love you malfoid” anywhere to stop the whole bit",
        "Emergency exit: tap DELETE three times — nothing is really deleted",
      ],
      tags: ["Python", "Pillow", "Tkinter", "Prank"],
      gallery: [
        "assets/images/malfoy-desktop.webp",
        "assets/images/malfoy-melt.webp",
        "assets/images/malfoy-bsod.webp",
      ],
      links: [
        {
          label: "download",
          icon: "download",
          url: "https://github.com/kurizzuuuu-code/Malfoy-Virus-prank/releases/tag/v1",
        },
        {
          label: "GitHub",
          icon: "github",
          url: "https://github.com/kurizzuuuu-code/Malfoy-Virus-prank",
        },
      ],
      devlogs: [
        {
          version: "v1.2.0",
          tag: "latest",
          title: "Hydra Terminal Windows, Fake BSOD & Triple-DELETE Panic Exit",
          added: [
            "Hydra cmd.exe prank windows that spawn two more terminals whenever you try to close one during the fake System32 wipe",
            "Full-screen pixel-melting shader effect transitioning into a convincing fake Windows BSOD and fake restart sequence",
            "Global keyboard hook for the secret passphrase ('i love you malfoid') plus an emergency 3x DELETE panic kill-switch",
          ],
          changed: [
            "Packed Python + Pillow + Tkinter runtime into a single standalone Windows executable requiring zero setup",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "Malfoid Desktop Sprite & Trash-Talk Speech Sequence",
          added: [
            "Animated transparent Malfoid sprite that walks onto the taskbar, waves, and delivers timed roast dialogue",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "forest-run",
      title: "Do Not Stop",
      subtitle: "Forest run endless runner",
      category: "games",
      categoryLabel: "Browser game",
      year: "2026",
      status: "playable",
      play: true,
      image: "assets/images/project-forest-run.webp",
      imageAlt: "Lavender-haired cat girl running down a purple low-poly forest trail",
      blurb:
        "A lavender cat girl, an endless purple forest and exactly one rule: do not stop. Jump logs, slide under branches and hoard ram coins to keep your momentum alive.",
      description:
        "Do Not Stop — Forest Run is a Three.js endless runner built around a single shrinking momentum bar. You sprint down a low-poly purple trail in one of three lanes, jumping fallen logs, sliding under branches, dodging stumps and hopping forest pits. Golden ram coins refill momentum (and stack a flow multiplier), while every crash drains it. Let it hit zero and the thing behind you finally catches up. It runs in the browser, keyboard or touch, with a fully synthesized chiptune soundtrack.",
      highlights: [
        "Three lanes, five obstacle types and an endless trail",
        "Momentum doubles as health — ram coins and clean runs refill it",
        "Low-poly purple forest assembled from reusable chunks",
        "Chiptune, countdown and SFX synthesized with the Web Audio API",
        "Keyboard, swipe and on-screen controls for desktop and mobile",
      ],
      tags: ["Three.js", "WebGL", "JavaScript", "Game design"],
      gallery: [
        "assets/images/forest-run-menu.webp",
        "assets/images/forest-run-run.webp",
      ],
      links: [
        {
          label: "play in browser",
          icon: "gamepad",
          url: "game/index.html",
        },
      ],
      devlogs: [
        {
          version: "v1.4.0",
          tag: "latest · mobile & 60fps",
          title: "Mobile Touch Fast-Path, True Delta-Time Speed & Live Leaderboard",
          added: [
            "Online high-score leaderboard backed by the Render game server with instant local fallback",
            "Responsive touch swipe gestures and dedicated on-screen jump / slide / lane buttons for phones and tablets",
          ],
          changed: [
            "Eliminated mobile slow-motion lag by raising the frame delta-time ceiling and bypassing CPU getImageData post-processing on mobile GPUs",
            "Auto-pauses background 3D character viewer while forest_run.exe is active so mobile devices get 100% GPU budget",
          ],
        },
        {
          version: "v1.2.0",
          tag: "3d rig & audio",
          title: "Custom Rigged GLTF Runner Model & Web Audio Chiptune Synth",
          added: [
            "Custom rigged 3D cat-hoodie runner character with smooth lane-lean, jump flip, slide, and stumble animations",
            "Zero-asset Web Audio API chiptune soundtrack, countdown beeps, and coin pickup synth SFX",
          ],
          changed: [
            "Reworked momentum drain curve and Flow multiplier so consecutive coin streaks reward risky lane swaps",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "3-Lane Infinite Forest Chunk Generator",
          added: [
            "Endless procedural low-poly purple forest with 5 obstacle archetypes (logs, high branches, stumps, pits, and double barriers)",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "ai-blocker",
      title: "AI Blocker",
      subtitle: "Less AI in your feed",
      category: "extension",
      categoryLabel: "Browser extension",
      year: "2026",
      status: "shipped",
      image: "assets/images/ai-blocker.webp",
      imageAlt: "AI Blocker icon: a red no-symbol over an anime eye with NO AI SLOP text",
      blurb:
        "A Chrome/Brave extension that hides AI add-ons and blocks third-party AI requests, while leaving the tools you open on purpose alone.",
      description:
        "AI Blocker is a Manifest V3 extension somewhere between an ad blocker and a cleanup crew. It hides AI buttons, overviews, sidebars and assistants, blocks third-party requests to known AI APIs, and gives you a global switch plus a per-site allowlist. Elements are hidden rather than deleted, so turning protection off brings everything back instantly.",
      highlights: [
        "Known selectors for Google, Bing, Brave, DuckDuckGo, X, Reddit, LinkedIn and YouTube",
        "Button text, metadata and search-result heuristics",
        "Declarative Net Request rules for third-party AI traffic",
        "Global switch and per-site allowlist",
        "Leaves deliberately opened AI tools usable",
      ],
      tags: ["Chrome Extension", "JavaScript", "Privacy"],
      gallery: [
        "assets/images/ai-blocker.webp",
        "assets/images/ai-blocker-icon.webp",
      ],
      links: [
        {
          label: "GitHub",
          icon: "github",
          url: "https://github.com/kurizzuuuu-code/AI-Blocker-Browser-Extention",
        },
      ],
      devlogs: [
        {
          version: "v1.3.0",
          tag: "latest",
          title: "Per-Site Allowlist, Declarative Net Request Rules & Instant Un-Hide",
          added: [
            "Declarative Net Request ruleset blocking background third-party AI telemetry and widget scripts",
            "1-click per-domain allowlist in the popup UI so deliberately visited AI tools keep working normally",
          ],
          changed: [
            "Switched from destructive DOM node removal to non-destructive CSS hiding so toggling the extension restores page elements without reloading",
            "Updated selectors for 2026 Google AI Overviews, YouTube summary cards, X Grok buttons, and LinkedIn rewrite prompts",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "Manifest V3 Content Filter & Search Heuristics",
          added: [
            "Curated selector and text-heuristic engine for Google, Bing, Brave, DuckDuckGo, Reddit, and YouTube",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "dns-changer",
      title: "DNS Changer PH",
      subtitle: "One-tap DNS for Android",
      category: "mobile",
      categoryLabel: "Android app",
      year: "2026",
      status: "shipped",
      art: "phone",
      image: "assets/images/project-dns-changer.webp",
      imageAlt: "DNS Changer PH app interface on a purple phone",
      blurb:
        "A no-root Android app that routes only DNS through a local VPN, made for networks that block Discord.",
      description:
        "DNS Changer PH is a small Kotlin app built for Philippine mobile networks that block Discord at the DNS level. It creates a local TUN interface, sends only the upstream DNS IP through the VPN, and forwards UDP/53 to Cloudflare, Google or Quad9. Normal traffic stays direct, so speed stays normal and no root is needed.",
      highlights: [
        "DNS-only local VPN; all other traffic stays direct",
        "One-tap presets for Cloudflare, Google and Quad9",
        "No root required",
        "Tests the fastest DNS before connecting",
      ],
      tags: ["Kotlin", "Android", "VPN"],
      gallery: [
        "assets/images/project-dns-changer.webp",
        "assets/sprites/avatar.webp",
      ],
      links: [
        {
          label: "GitHub",
          icon: "github",
          url: "https://github.com/kurizzuuuu-code/dns-changer-ph",
        },
      ],
      devlogs: [
        {
          version: "v1.2.0",
          tag: "latest",
          title: "Latency Ping Benchmark & Auto-Fastest Resolver",
          added: [
            "Built-in latency tester that pings Cloudflare (1.1.1.1), Google (8.8.8.8), and Quad9 (9.9.9.9) before connecting",
            "Persistent quick-tile notification showing active DNS resolver and connection uptime",
          ],
          changed: [
            "Restricted VpnService routing table strictly to the target DNS /32 IP so game and voice packets bypass the TUN interface with zero overhead",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "No-Root Local TUN DNS Forwarder for PH ISPs",
          added: [
            "One-tap Android VpnService UDP/53 forwarder designed to fix ISP DNS poisoning on Discord and gaming services",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "lanshare",
      title: "KURIZU.dropship",
      subtitle: "LocalSend-inspired Wi-Fi file drop",
      category: "web",
      categoryLabel: "Web & LAN app",
      year: "2026",
      status: "shipped",
      art: "share",
      image: "assets/images/project-lanshare.webp",
      imageAlt: "KURIZU.dropship local file sharing window",
      blurb:
        "A LocalSend-inspired file drop for your local network — scan a QR code, pick a nearby device, and toss files or notes across the room. No cloud, no accounts, 100% purple.",
      description:
        "KURIZU.dropship is a LocalSend-inspired file-sharing app rebuilt with WebRTC P2P direct streaming + a zero-dependency Node.js signaling server wearing my portfolio's purple pixel theme. Use it on the same Wi-Fi automatically or pair across different Wi-Fi networks anywhere using a Room Code, and stream files up to 25 GB each directly PC-to-PC with zero cloud storage limits.",
      highlights: [
        "Direct WebRTC Peer-to-Peer (P2P) 64 KB chunk streaming — send files up to 25 GB each with zero server storage",
        "Cross-Wi-Fi Room Code pairing so you can send files to another person's PC on a different Wi-Fi network",
        "Same-Wi-Fi automatic discovery via Server-Sent Events (SSE) + built-in QR code & room link generator",
        "Native FileSystemWritableFileStream direct-to-disk saving so multi-GB files never fill up browser RAM",
      ],
      tags: ["WebRTC P2P", "Node.js", "JavaScript", "SSE"],
      gallery: [
        "assets/images/project-lanshare.webp",
      ],
      links: [
        {
          label: "open kurizu.dropship",
          icon: "globe",
          url: "dropship/index.html",
        },
      ],
      devlogs: [
        {
          version: "v2.0.0",
          tag: "latest · webrtc p2p 25gb",
          title: "25 GB WebRTC P2P Direct Streaming & Cross-Wi-Fi Room Codes",
          added: [
            "WebRTC DataChannel P2P streaming engine (64 KB chunks with backpressure control) supporting files up to 25 GB each directly PC-to-PC",
            "Cross-Wi-Fi Room Code pairing box & shareable ?room=CODE links so devices on completely different Wi-Fi networks can pair and transfer huge files",
            "Direct-to-disk streaming via the browser File System Access API (showSaveFilePicker) so 25 GB downloads write straight to disk without using RAM",
          ],
          changed: [
            "Upgraded offer pipeline to send P2P file offers instantaneously without waiting for a cloud relay pre-upload",
          ],
        },
        {
          version: "v1.0.0",
          tag: "initial release",
          title: "Zero-Dependency SSE Radar, 4GB Streaming & QR Join",
          added: [
            "Automatic same-Wi-Fi peer discovery over Server-Sent Events (SSE) with custom purple gremlin avatars",
            "Multi-file streaming transfers (up to 50 files / 4 GB each), instant text notes, and incoming_transfer.exe accept/decline modals",
          ],
          changed: [],
        },
      ],
    },
    {
      id: "firesword",
      title: "FireSword + AIBot",
      subtitle: "Minecraft Bedrock add-ons",
      category: "games",
      categoryLabel: "Game add-on",
      year: "2026",
      status: "shipped",
      art: "sword",
      image: "assets/images/project-firesword.webp",
      imageAlt: "Pixel-art fire sword and AIBot chat bubble",
      blurb:
        "A glowing fire sword and a chatty AI companion, packed as one-click Minecraft Bedrock add-ons.",
      description:
        "Two small Minecraft Bedrock projects: a custom fire sword with particle and glow effects, and AIBot, a companion that talks back in chat. Both are packaged as .mcaddon files with matching behaviour and resource packs, so installing is a double-click.",
      highlights: [
        "Custom fire sword with particle and glow effects",
        "AIBot companion with chat-style responses",
        "Behaviour + resource packs in one .mcaddon",
        "Built for Bedrock, no mod loader required",
      ],
      tags: ["Minecraft", "Bedrock", "Game design"],
      gallery: [],
      links: [],
      devlogs: [
        {
          version: "v1.1.0",
          tag: "latest",
          title: "Emissive Flame Particles & Chatty Companion Behavior Pack",
          added: [
            "Custom emissive pixel-art fire sword texture with ember trail particles and AoE ignite sweep on hit",
            "AIBot NPC companion entity that follows the player and replies to Bedrock chat triggers",
          ],
          changed: [
            "Bundled both Resource Pack and Behavior Pack into a single one-click .mcaddon installer",
          ],
        },
      ],
    },
  ],

  /* The inline showreel is a self-timing slideshow. Replace the
     slides below with stills or GIF/WebP frames from your reel. */
  showreel: {
    title: "KURIZU.SHOWREEL",
    meta: "2026 · 0:24",
    slides: [
      {
        image: "assets/images/malfoy-showcase-poster.webp",
        kicker: "MALFOY.EXE",
        caption: "a very polite little curse",
      },
      {
        image: "assets/images/pixify-showcase-poster.webp",
        kicker: "PIXIFY",
        caption: "make the pixels make sense",
      },
      {
        image: "assets/images/wobble-showcase-poster.webp",
        kicker: "WOBBLE STUDIO",
        caption: "paint a little motion",
      },
      {
        image: "assets/sprites/dance-still.webp",
        kicker: "AIPET",
        caption: "headpats sold separately",
      },
    ],
  },

  /* Showcase cards next to the reel. Each one opens that project's
     case study, where the demo video lives. */
  videoLinks: [
    {
      id: "aipet",
      project: "aipet",
      kicker: "TUTORIAL",
      title: "AIPet, start to finish",
      note: "the full tutorial plus two desk samples",
      art: "assets/images/aipet-tutorial-poster.webp",
    },
    {
      id: "pixify",
      project: "pixify",
      kicker: "SHOWCASE",
      title: "KURIZU.pixify in motion",
      note: "cleaning and vectorizing, right in the browser",
      art: "assets/images/pixify-showcase-poster.webp",
    },
    {
      id: "wobble",
      project: "wobble",
      kicker: "SHOWCASE",
      title: "Wobble Studio, wobbling",
      note: "paint motion onto a still drawing",
      art: "assets/images/wobble-showcase-poster.webp",
    },
    {
      id: "malfoy",
      project: "malfoy",
      kicker: "SHOWCASE",
      title: "Malfoy.exe being a menace",
      note: "screen melt, fake System32, fake BSOD",
      art: "assets/images/malfoy-showcase-poster.webp",
    },
  ],

  gallery: [
    /* ---- digital art ---- */
    {
      image: "assets/arts/digital/stretch-break.webp",
      full: "assets/arts/digital/stretch-break-full.webp",
      title: "1800 dance meme",
      meta: "digital art",
      alt: "stretch break — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/frog-plush-hug.webp",
      full: "assets/arts/digital/frog-plush-hug-full.webp",
      title: "Me",
      meta: "digital art",
      alt: "frog plush hug — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/half-lidded.webp",
      full: "assets/arts/digital/half-lidded-full.webp",
      title: "Crazy Reze meme Ref",
      meta: "digital art",
      alt: "half-lidded — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/smug-mode.webp",
      full: "assets/arts/digital/smug-mode-full.webp",
      title: "Freaky",
      meta: "digital art",
      alt: "smug mode — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/kurizu-court.webp",
      full: "assets/arts/digital/kurizu-court-full.webp",
      title: "Random pixel art with Reiru",
      meta: "digital art",
      alt: "the kurizu court — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/shadow-steps.webp",
      full: "assets/arts/digital/shadow-steps-full.webp",
      title: "Reiru dancing Kwik Flip dance MEME",
      meta: "digital art",
      alt: "shadow steps — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/wisteria-night.webp",
      full: "assets/arts/digital/wisteria-night-full.webp",
      title: "wisteria night",
      meta: "digital art",
      alt: "wisteria night — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/cat-hoodie.webp",
      full: "assets/arts/digital/cat-hoodie-full.webp",
      title: "cat hoodie",
      meta: "digital art",
      alt: "cat hoodie — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/two-at-the-keyboard.webp",
      full: "assets/arts/digital/two-at-the-keyboard-full.webp",
      title: "Me and Reiru",
      meta: "digital art",
      alt: "two at the keyboard — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/keyboard-chaos.webp",
      full: "assets/arts/digital/keyboard-chaos-full.webp",
      title: "keyboard chaos",
      meta: "digital art",
      alt: "keyboard chaos — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/fox-grin.webp",
      full: "assets/arts/digital/fox-grin-full.webp",
      title: "NO B*tches?",
      meta: "digital art",
      alt: "fox grin — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/chibi-study.webp",
      full: "assets/arts/digital/chibi-study-full.webp",
      title: "chibi Me",
      meta: "digital art",
      alt: "chibi study — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/golden-eyes.webp",
      full: "assets/arts/digital/golden-eyes-full.webp",
      title: "Chibi Reiru",
      meta: "digital art",
      alt: "golden eyes — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/pink-study.webp",
      full: "assets/arts/digital/pink-study-full.webp",
      title: "Chibi Yza",
      meta: "digital art",
      alt: "pink study — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/comic-the-interruption.webp",
      full: "assets/arts/digital/comic-the-interruption-full.webp",
      title: "ME and the gang Naked",
      meta: "digital art",
      alt: "comic: the interruption — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/comic-the-ask.webp",
      full: "assets/arts/digital/comic-the-ask-full.webp",
      title: "Me and the gang with armour",
      meta: "digital art",
      alt: "comic: the ask — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/the-whole-gang.webp",
      full: "assets/arts/digital/the-whole-gang-full.webp",
      title: "the whole gang",
      meta: "digital art",
      alt: "the whole gang — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/close-up-crimson.webp",
      full: "assets/arts/digital/close-up-crimson-full.webp",
      title: "close-up: Yza",
      meta: "digital art",
      alt: "close-up: crimson — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/close-up-amber.webp",
      full: "assets/arts/digital/close-up-amber-full.webp",
      title: "close-up: Reiru",
      meta: "digital art",
      alt: "close-up: amber — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/close-up-violet.webp",
      full: "assets/arts/digital/close-up-violet-full.webp",
      title: "close-up: Kurizu",
      meta: "digital art",
      alt: "close-up: violet — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/close-up-deep-blue.webp",
      full: "assets/arts/digital/close-up-deep-blue-full.webp",
      title: "close-up: Sam",
      meta: "digital art",
      alt: "close-up: deep blue — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/close-up-sky.webp",
      full: "assets/arts/digital/close-up-sky-full.webp",
      title: "close-up: Shinzui",
      meta: "digital art",
      alt: "close-up: sky — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/halo-and-cat.webp",
      full: "assets/arts/digital/halo-and-cat-full.webp",
      title: "Allen",
      meta: "digital art",
      alt: "halo & cat — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/summer-smile.webp",
      full: "assets/arts/digital/summer-smile-full.webp",
      title: "Freaky car",
      meta: "digital art",
      alt: "summer smile — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/kurizu-poster.webp",
      full: "assets/arts/digital/kurizu-poster-full.webp",
      title: "kurizu poster",
      meta: "digital art",
      alt: "kurizu poster — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/dance-loop.webp",
      full: "assets/arts/digital/dance-loop-full.webp",
      title: "kwik flip kurizu dance loop",
      meta: "digital art",
      alt: "dance loop — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/pink-dance-loop.webp",
      full: "assets/arts/digital/pink-dance-loop-full.webp",
      title: "kwik flip Yza dance loop",
      meta: "digital art",
      alt: "pink dance loop — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/silver-and-red.webp",
      full: "assets/arts/digital/silver-and-red-full.webp",
      title: "Allen OC character",
      meta: "digital art",
      alt: "silver and red — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/reindeer-hat.webp",
      full: "assets/arts/digital/reindeer-hat-full.webp",
      title: "Christmas",
      meta: "digital art",
      alt: "reindeer hat — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/summer-fit.webp",
      full: "assets/arts/digital/summer-fit-full.webp",
      title: "Me if im Hot asf",
      meta: "digital art",
      alt: "summer fit — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/running-through-fire.webp",
      full: "assets/arts/digital/running-through-fire-full.webp",
      title: "kwik Flip dance MEME",
      meta: "digital art",
      alt: "running through fire — digital artwork",
      category: "digital",
      animated: true,
    },
    {
      image: "assets/arts/digital/banner-the-party.webp",
      full: "assets/arts/digital/banner-the-party-full.webp",
      title: "Pixel art with Reiru and OCs",
      meta: "digital art",
      alt: "banner: the party — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/pixel-pair.webp",
      full: "assets/arts/digital/pixel-pair-full.webp",
      title: "pixel pair",
      meta: "digital art",
      alt: "pixel pair — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/throne-of-fire.webp",
      full: "assets/arts/digital/throne-of-fire-full.webp",
      title: "throne of fire",
      meta: "digital art",
      alt: "throne of fire — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/sprite-player.webp",
      full: "assets/arts/digital/sprite-player-full.webp",
      title: "sprite: kurizu",
      meta: "digital art",
      alt: "sprite: player — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/beach-day.webp",
      full: "assets/arts/digital/beach-day-full.webp",
      title: "beach day",
      meta: "digital art",
      alt: "beach day — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/plush-on-head.webp",
      full: "assets/arts/digital/plush-on-head-full.webp",
      title: "Me and reiru on top",
      meta: "digital art",
      alt: "plush on head — digital artwork",
      category: "digital",
    },
    {
      image: "assets/arts/digital/banner-moonlit.webp",
      full: "assets/arts/digital/banner-moonlit-full.webp",
      title: "moonlit",
      meta: "digital art",
      alt: "banner: moonlit — digital artwork",
      category: "digital",
    },

    /* ---- traditional art ---- */
    {
      image: "assets/arts/traditional/elf-archer.webp",
      full: "assets/arts/traditional/elf-archer-full.webp",
      title: "Freiren lmao",
      meta: "traditional · sketchbook",
      alt: "elf archer — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/crowned-flame.webp",
      full: "assets/arts/traditional/crowned-flame-full.webp",
      title: "No game no life Shiro",
      meta: "traditional · sketchbook",
      alt: "crowned flame — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/nezuko-in-ink.webp",
      full: "assets/arts/traditional/nezuko-in-ink-full.webp",
      title: "Inktober",
      meta: "traditional · sketchbook",
      alt: "nezuko in ink — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/nezuko-study.webp",
      full: "assets/arts/traditional/nezuko-study-full.webp",
      title: "Sagiri",
      meta: "traditional · sketchbook",
      alt: "nezuko study — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/sketchbook-nezuko.webp",
      full: "assets/arts/traditional/sketchbook-nezuko-full.webp",
      title: "sketchbook: Rem",
      meta: "traditional · sketchbook",
      alt: "sketchbook: nezuko — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/nezuko-ready.webp",
      full: "assets/arts/traditional/nezuko-ready-full.webp",
      title: "Akame Ga kill watch it",
      meta: "traditional · sketchbook",
      alt: "nezuko, ready — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/the-pair.webp",
      full: "assets/arts/traditional/the-pair-full.webp",
      title: "IDK draw this for art project in school",
      meta: "traditional · sketchbook",
      alt: "the pair — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/bamboo-muzzle.webp",
      full: "assets/arts/traditional/bamboo-muzzle-full.webp",
      title: "Nezuko Child",
      meta: "traditional · sketchbook",
      alt: "bamboo muzzle — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/the-hug.webp",
      full: "assets/arts/traditional/the-hug-full.webp",
      title: "the hug",
      meta: "traditional · sketchbook",
      alt: "the hug — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/arms-up.webp",
      full: "assets/arts/traditional/arms-up-full.webp",
      title: "Nino",
      meta: "traditional · sketchbook",
      alt: "arms up — pencil drawing from the sketchbook",
      category: "traditional",
    },
    {
      image: "assets/arts/traditional/sketchbook-page.webp",
      full: "assets/arts/traditional/sketchbook-page-full.webp",
      title: "Sagiri",
      meta: "traditional · sketchbook",
      alt: "sketchbook page — pencil drawing from the sketchbook",
      category: "traditional",
    },

    /* ---- project art, sprites & posters ---- */
    {
      image: "assets/sprites/dance.webp",
      title: "dance mode",
      meta: "sprite animation",
      alt: "Purple chibi mascot dancing with glowsticks",
      category: "projects",
    },
    {
      image: "assets/sprites/pet.webp",
      title: "headpat accepted",
      meta: "sprite animation",
      alt: "Purple chibi mascot being pet on the head",
      category: "projects",
    },
    {
      image: "assets/sprites/mascot.webp",
      title: "on the air",
      meta: "character design",
      alt: "Purple chibi mascot wearing a headset",
      category: "projects",
    },
    {
      image: "assets/images/malfoy-desktop.webp",
      title: "malfoid says hi",
      meta: "Malfoy.exe desktop",
      alt: "Malfoid prank app sitting on a purple night desktop",
      category: "projects",
    },
    {
      image: "assets/images/malfoy-bsod.webp",
      title: "stop code: malfoid",
      meta: "Malfoy.exe fake BSOD",
      alt: "Fake blue screen of death reading stop code MALFOID_WAS_HERE",
      category: "projects",
    },
    {
      image: "assets/images/avatar-eye.webp",
      title: "eye study",
      meta: "AIPet icon art",
      alt: "Close-up anime eye illustration with purple hair",
      category: "projects",
    },
    {
      image: "assets/images/pixify-vector.webp",
      title: "vector mode",
      meta: "KURIZU.pixify UI",
      alt: "Pixify vectorizer interface",
      category: "projects",
    },
    {
      image: "assets/images/ai-blocker.webp",
      title: "no ai slop",
      meta: "icon + poster",
      alt: "AI Blocker icon with a red prohibited sign",
      category: "projects",
    },
  ],};
