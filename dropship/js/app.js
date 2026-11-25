/* ============================================================
   KURIZU.SEND — client brain
   Presence via SSE, uploads via fetch/XHR, offers via JSON.
   ============================================================ */

(() => {
  'use strict';

  /* ---------------- helpers ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  const makeId = () =>
    (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const store = {
    get(key) {
      try { return sessionStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); } catch { /* private mode */ }
    },
  };

  const local = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* private mode */ }
    },
  };

  const DEFAULT_AVATARS = ['mascot', 'avatar', 'pet', 'idle', 'dance'];

  const TYPE_INFO = {
    desktop: { icon: 'i-desktop', label: 'desktop' },
    laptop: { icon: 'i-laptop', label: 'laptop' },
    phone: { icon: 'i-phone', label: 'phone' },
    tablet: { icon: 'i-tablet', label: 'tablet' },
    console: { icon: 'i-gamepad', label: 'console' },
    tv: { icon: 'i-tv', label: 'tv' },
    unknown: { icon: 'i-desktop', label: 'device' },
  };

  const TOAST_ICONS = {
    success: 'i-heart',
    info: 'i-note',
    pink: 'i-sparkle',
    error: 'i-bolt',
  };

  const NAME_ADJ = ['lilac', 'violet', 'cozy', 'pixel', 'sleepy', 'sparkly', 'soft', 'plum', 'dreamy', 'bouncy'];
  const NAME_NOUN = ['otter', 'moth', 'fox', 'ghost', 'comet', 'bean', 'frog', 'crow', 'bun', 'cat'];

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function detectType() {
    const ua = navigator.userAgent;
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
    if (/Mobi|iPhone|iPod|Windows Phone/i.test(ua)) return 'phone';
    if (/Android/i.test(ua)) return 'tablet';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'laptop';
    return 'desktop';
  }

  function typeInfo(type) {
    return TYPE_INFO[type] || TYPE_INFO.unknown;
  }

  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = n / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value >= 10 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - Number(ts || 0));
    const sec = Math.round(diff / 1000);
    if (sec < 45) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'calculating ETA...';
    const s = Math.ceil(seconds);
    if (s <= 1) return '~1s left';
    if (s < 60) return `~${s}s left`;
    if (s < 3600) {
      const m = Math.floor(s / 60);
      const remS = s % 60;
      return `~${m}m ${remS}s left`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `~${h}h ${m}m left`;
  }

  function createSpeedTracker(initialBytes = 0) {
    const startBytes = Number(initialBytes) || 0;
    const startTime = Date.now();
    const samples = [{ t: startTime, b: startBytes }];

    return {
      sample(currentBytes, totalBytes) {
        const now = Date.now();
        const bytes = Number(currentBytes) || 0;
        const total = Number(totalBytes) || 0;
        if (now - samples[samples.length - 1].t >= 200) {
          samples.push({ t: now, b: bytes });
        }
        while (samples.length > 2 && now - samples[1].t > 3000) {
          samples.shift();
        }
        const anchor = samples[0];
        const dt = Math.max(0.25, (now - anchor.t) / 1000);
        const bps = Math.max(0, (bytes - anchor.b) / dt);
        const mbps = bps / (1024 * 1024);
        const remaining = Math.max(0, total - bytes);
        const etaText = (bps > 1024 && now - startTime >= 800)
          ? formatEta(remaining / bps)
          : 'calculating ETA...';
        return {
          bps,
          mbpsText: mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2).replace(/\.?0+$/, (m) => (m === '.00' ? '.0' : m)),
          etaText,
        };
      },
    };
  }

  const isWindowedApp = () => {
    try {
      return window.self !== window.top || new URLSearchParams(location.search).has('windowed');
    } catch {
      return true;
    }
  };
  const isMobileTray = () => !isWindowedApp() && window.matchMedia('(max-width: 1080px)').matches;
  const isLocalHost = () => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);

  function fileIcon(type, name) {
    const t = String(type || '');
    if (t.startsWith('image/')) return 'i-image';
    if (t.startsWith('video/')) return 'i-video';
    if (t.startsWith('audio/')) return 'i-music';
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(ext)) return 'i-image';
    if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) return 'i-video';
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return 'i-music';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) return 'i-archive';
    return 'i-file';
  }

  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
  }

  /* ---------------- identity + state ---------------- */

  const sessionName = store.get('kurizu-send-name') || `${pick(NAME_ADJ)}-${pick(NAME_NOUN)}`;
  const sessionAvatar = DEFAULT_AVATARS.includes(store.get('kurizu-send-avatar')) ? store.get('kurizu-send-avatar') : pick(DEFAULT_AVATARS);
  const urlRoomParam = (() => {
    try { return (new URLSearchParams(location.search).get('room') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24); }
    catch { return ''; }
  })();
  const initialRoom = urlRoomParam || store.get('kurizu-send-room') || '';

  const state = {
    me: {
      id: store.get('kurizu-send-id') || makeId(),
      name: sessionName.slice(0, 32),
      avatar: sessionAvatar,
      type: detectType(),
    },
    room: initialRoom,
    devices: [],
    transfers: new Map(),
    selectedId: null,
    files: [],
    queue: [],
    queued: new Set(),
    activeOfferId: null,
    sending: false,
    connected: false,
    sound: local.get('kurizu-send-sound') !== '0',
    nice: Math.max(0, Number(local.get('kurizu-send-nice') || 0) || 0),
    avatars: DEFAULT_AVATARS.slice(),
    limits: { maxFileBytes: 25 * 1024 * 1024 * 1024, maxFiles: 50, maxTransferBytes: 50 * 1024 * 1024 * 1024 },
    server: null,
    hidden: new Set(),
  };

  store.set('kurizu-send-id', state.me.id);
  store.set('kurizu-send-name', state.me.name);
  store.set('kurizu-send-avatar', state.me.avatar);
  if (state.room) store.set('kurizu-send-room', state.room);

  /* WebRTC P2P Direct Streaming State (supports 25 GB+ files across different Wi-Fi networks) */
  const RTC_CONFIG = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    ],
  };
  const P2P_DEFAULT_CHUNK_BYTES = 64 * 1024; // safe fallback chunk size
  const P2P_MAX_CHUNK_BYTES = 240 * 1024; // up to ~240 KB per dc.send() when peer SCTP supports >=256 KB
  const P2P_READ_AHEAD_BYTES = 4 * 1024 * 1024; // 4 MB disk read-ahead per await (cuts async waits 64x)
  const P2P_MAX_BUFFERED = 2 * 1024 * 1024; // 2 MB high-water mark (prevents UDP queue bufferbloat)
  const P2P_LOW_WATER = 512 * 1024; // 512 KB low-water resume threshold (1 stream)
  const P2P_PARALLEL_LANES = 4; // 4 parallel WebRTC DataChannels for files >= 16 MB
  const P2P_PARALLEL_MIN_BYTES = 16 * 1024 * 1024; // 16 MB threshold
  const P2P_STRIPE_BYTES = 2 * 1024 * 1024; // 2 MB interleaved stripes (sequential disk append, zero NTFS zero-fill)
  const P2P_LANE_MAX_BUFFERED = 1 * 1024 * 1024; // 1 MB per lane (= 4 MB total across 4 lanes)
  const P2P_LANE_LOW_WATER = 256 * 1024; // 256 KB resume watermark per parallel lane
  const p2pOutgoingFiles = new Map(); // fileId -> File object on sender PC
  const p2pDownloadedBlobs = new Map(); // fileId -> objectURL if buffered in RAM
  const p2pSessions = new Map(); // sessionId -> { pc, iceQueue, remoteDescSet }
  const p2pSenderGroups = new Map(); // batchId -> aggregate multi-lane sender state
  let activeDownloadCancel = null;

  /* ---------------- elements ---------------- */

  const el = {
    body: document.body,
    myAvatar: $('#myAvatar'),
    avatarBtn: $('#avatarBtn'),
    deviceName: $('#deviceName'),
    p2pProfileBar: $('#p2pProfileBar'),
    p2pProfileBadge: $('#p2pProfileBadge'),
    p2pProfileText: $('#p2pProfileText'),
    p2pProfileSignal: $('#p2pProfileSignal'),
    roomCodeInput: $('#roomCodeInput'),
    roomJoinBtn: $('#roomJoinBtn'),
    roomGenBtn: $('#roomGenBtn'),
    roomHintText: $('#roomHintText'),
    myType: $('#myType'),
    myTypeIcon: $('#myTypeIcon use'),
    connTag: $('#connTag'),
    lanPill: $('#lanPill'),
    lanPillText: $('#lanPillText'),
    lanDot: $('#lanDot'),
    shareUrl: $('#shareUrl'),
    copyLink: $('#copyLink'),
    copyLink2: $('#copyLink2'),
    showQr: $('#showQr'),
    deviceGrid: $('#deviceGrid'),
    deviceCount: $('#deviceCount'),
    transferLog: $('#transferLog'),
    clearLog: $('#clearLog'),
    sendTray: $('#sendTray'),
    trayClose: $('#trayClose'),
    trayOverlay: $('#trayOverlay'),
    trayRecipient: $('#trayRecipient'),
    trayHint: $('#trayHint'),
    dropzone: $('#dropzone'),
    fileInput: $('#fileInput'),
    fileList: $('#fileList'),
    noteInput: $('#noteInput'),
    sendBtn: $('#sendBtn'),
    sendBtnText: $('#sendBtnText'),
    sendCount: $('#sendCount'),
    sendProgress: $('#sendProgress'),
    progressLabel: $('#progressLabel'),
    progressPct: $('#progressPct'),
    progressBar: $('#progressBar'),
    sendSignalPanel: $('#sendSignalPanel'),
    statusDevices: $('#statusDevices'),
    statusDot: $('#statusDot'),
    statusClock: $('#statusClock'),
    windowBadge: $('#windowBadge'),
    incomingBackdrop: $('#incomingBackdrop'),
    incomingDialog: $('#incomingDialog'),
    incomingBody: $('#incomingBody'),
    incomingBadge: $('#incomingBadge'),
    qrDialog: $('#qrDialog'),
    qrImage: $('#qrImage'),
    qrUrl: $('#qrUrl'),
    qrClose: $('#qrClose'),
    qrDone: $('#qrDone'),
    soundToggle: $('#soundToggle'),
    niceBtn: $('#niceBtn'),
    niceCount: $('#niceCount'),
    toastLayer: $('#toastLayer'),
    heartLayer: $('#heartLayer'),
  };

  /* ---------------- sound ---------------- */

  let audioCtx = null;

  function ensureAudio() {
    if (!state.sound) return null;
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    } catch {
      return null;
    }
  }

  function tone(freq, start = 0, dur = 0.08, type = 'triangle', volume = 0.035) {
    if (!state.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + start;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    } catch { /* audio is a garnish, not a feature */ }
  }

  const soundTap = () => tone(680, 0, 0.045, 'square', 0.018);
  const soundPop = () => { tone(540, 0, 0.05); tone(780, 0.05, 0.07); };
  const soundReceive = () => { tone(880, 0, 0.08); tone(660, 0.09, 0.1); };
  const soundSend = () => { tone(420, 0, 0.06); tone(560, 0.06, 0.07); tone(760, 0.13, 0.1); };
  const soundAccept = () => { tone(523, 0, 0.11); tone(659, 0.06, 0.11); tone(784, 0.13, 0.16); };
  const soundDecline = () => { tone(300, 0, 0.09, 'square', 0.02); tone(220, 0.09, 0.13, 'square', 0.02); };
  const soundSparkle = () => { tone(1046, 0, 0.06, 'sine', 0.02); tone(1318, 0.05, 0.06, 'sine', 0.018); tone(1568, 0.1, 0.09, 'sine', 0.016); };

  function syncSoundButton() {
    el.soundToggle.setAttribute('aria-pressed', String(state.sound));
    el.soundToggle.setAttribute('aria-label', state.sound ? 'Turn sound off' : 'Turn sound on');
  }

  /* ---------------- toasts + hearts ---------------- */

  function toast(message, kind = 'info', ms = 4200) {
    const node = document.createElement('div');
    node.className = `toast toast--${kind}`;
    node.innerHTML = `${icon(TOAST_ICONS[kind] || 'i-note')}<span></span>`;
    node.querySelector('span').textContent = message;
    while (el.toastLayer.children.length >= 4) el.toastLayer.firstElementChild.remove();
    el.toastLayer.appendChild(node);
    setTimeout(() => {
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 220);
    }, ms);
  }

  function burstHearts(x, y, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const heart = document.createElement('span');
      heart.className = 'heart-particle';
      heart.textContent = ['♥', '✦', '♡'][i % 3];
      heart.style.left = `${x + (Math.random() * 90 - 45)}px`;
      heart.style.top = `${y + (Math.random() * 24 - 12)}px`;
      heart.style.setProperty('--dx', `${Math.random() * 140 - 70}px`);
      heart.style.setProperty('--rot', `${Math.random() * 100 - 50}deg`);
      heart.style.fontSize = `${12 + Math.random() * 14}px`;
      el.heartLayer.appendChild(heart);
      setTimeout(() => heart.remove(), 1200);
    }
  }

  /* ---------------- connection state ---------------- */

  function updateRoomBadgeUi() {
    const code = state.room;
    if (el.roomCodeInput && document.activeElement !== el.roomCodeInput) {
      el.roomCodeInput.value = code;
    }
    if (el.roomHintText) {
      el.roomHintText.textContent = code
        ? `connected to room "${code}" — anyone on any Wi-Fi with this code can share up to 25 GB P2P!`
        : 'mode: same Wi-Fi auto-discovery · enter a room code to connect across different Wi-Fi!';
    }
    if (state.connected) {
      el.lanPillText.textContent = code ? `room: ${code}` : 'P2P · 25GB';
      el.windowBadge.textContent = code
        ? `CROSS-WIFI ROOM: ${code.toUpperCase()} · P2P 25GB`
        : `WEBRTC P2P · 25GB MAX`;
    }
    updateProfileP2pUi(null);
  }

  function setConnected(on) {
    state.connected = on;
    el.connTag.innerHTML = `<span class="dot ${on ? 'dot--lime' : 'dot--yellow'}"></span>${on ? 'online' : 'reconnecting'}`;
    el.connTag.classList.toggle('is-offline', !on);
    el.lanPill.classList.toggle('is-offline', !on);
    el.lanPillText.textContent = on ? (state.room ? `room: ${state.room}` : 'P2P · 25GB') : 'reconnecting';
    el.statusDot.classList.toggle('is-offline', !on);
    if (on) {
      el.windowBadge.textContent = state.room
        ? `CROSS-WIFI ROOM: ${state.room.toUpperCase()} · P2P 25GB`
        : `WEBRTC P2P · 25GB MAX`;
      el.windowBadge.classList.remove('is-offline');
    } else {
      el.windowBadge.textContent = 'RECONNECTING...';
      el.windowBadge.classList.add('is-offline');
    }
    updateRoomBadgeUi();
    updateProfileP2pUi(null);
    renderDevices();
    updateComposer();
  }

  function currentShareUrl() {
    let base;
    if (!isLocalHost()) {
      try {
        base = new URL('.', location.href).href.replace(/\/$/, '');
      } catch {
        base = location.origin;
      }
    } else {
      base = state.server?.url || location.origin;
    }
    if (state.room) {
      return `${base}${base.includes('?') ? '&' : '?'}room=${encodeURIComponent(state.room)}`;
    }
    return base;
  }

  function shareUrlDisplay() {
    return currentShareUrl().replace(/^https?:\/\//, '');
  }

  function setShareUrl() {
    const url = currentShareUrl();
    el.shareUrl.textContent = url.replace(/^https?:\/\//, '');
    el.shareUrl.title = url;
  }

  /* ---------------- rendering: devices ---------------- */

  function renderDevices() {
    const others = state.devices
      .filter((d) => d.id !== state.me.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    const selectedGone = state.selectedId && !others.some((d) => d.id === state.selectedId);
    if (selectedGone) {
      state.selectedId = null;
      renderTray();
    }

    el.deviceCount.textContent = `${others.length} online`;
    el.deviceCount.classList.toggle('is-quiet', others.length === 0);
    el.statusDevices.textContent = `${others.length} ${others.length === 1 ? 'device' : 'devices'}`;

    if (!others.length) {
      el.deviceGrid.innerHTML = emptyDevicesHtml();
      renderTray();
      return;
    }

    el.deviceGrid.innerHTML = others.map((device) => {
      const info = typeInfo(device.type);
      const selected = device.id === state.selectedId;
      return `
        <button type="button" class="device-card${selected ? ' is-selected' : ''}" data-device-id="${esc(device.id)}" aria-pressed="${selected}" title="Send something to ${esc(device.name)}">
          <span class="device-card__avatar">
            <img src="${esc(avatarSrc(device.avatar))}" alt="" width="64" height="64" loading="lazy">
            <span class="device-card__pip" aria-hidden="true"></span>
          </span>
          <span class="device-card__name">${esc(device.name)}</span>
          <span class="device-card__meta">${icon(info.icon)}${info.label}</span>
          <span class="device-card__send" aria-hidden="true">${icon('i-send')}</span>
        </button>`;
    }).join('');

    renderTray();
  }

  function emptyDevicesHtml() {
    if (!state.connected) {
      return `
        <div class="device-empty">
          <img src="assets/sprites/pet.webp" alt="" width="120" height="108">
          <div class="device-empty__copy">
            <strong>looking for the room...</strong>
            <p>The host went quiet. Reconnecting on its own — make sure the little server is still running.</p>
          </div>
        </div>`;
    }
    return `
      <div class="device-empty">
        <img src="assets/sprites/pet.webp" alt="" width="120" height="108">
        <div class="device-empty__copy">
          <strong>it's quiet in here...</strong>
          <p>Open <code>${esc(shareUrlDisplay())}</code> on your phone or another computer on the same Wi-Fi. Everyone who opens it shows up right here.</p>
          <div class="device-empty__actions">
            <button class="mini-btn" type="button" data-empty-action="copy">${icon('i-copy')}copy link</button>
            <button class="mini-btn" type="button" data-empty-action="qr">${icon('i-qr')}show QR</button>
          </div>
        </div>
      </div>`;
  }

  function avatarSrc(key) {
    const safe = state.avatars.includes(key) ? key : 'mascot';
    return `assets/sprites/${safe}.webp`;
  }

  function getSelected() {
    return state.devices.find((d) => d.id === state.selectedId) || null;
  }

  function selectDevice(id) {
    const device = state.devices.find((d) => d.id === id);
    if (!device) return;
    state.selectedId = id;
    soundTap();
    renderDevices();
    if (isMobileTray()) openTray();
  }

  /* ---------------- rendering: tray ---------------- */

  function renderTray() {
    const device = getSelected();
    if (!device) {
      el.trayRecipient.className = 'tray-recipient';
      el.trayRecipient.innerHTML = `
        <div class="tray-recipient__empty">${icon('i-arrow-r')} pick a device on the left</div>`;
    } else {
      const info = typeInfo(device.type);
      el.trayRecipient.className = 'tray-recipient tray-recipient--active';
      el.trayRecipient.innerHTML = `
        <div class="tray-recipient__device">
          <span class="avatar avatar--sm"><img src="${esc(avatarSrc(device.avatar))}" alt="" width="40" height="40"></span>
          <span class="tray-recipient__info">
            <span class="field-label">sending to</span>
            <strong>${esc(device.name)}</strong>
            <small>${icon(info.icon)}${info.label}</small>
          </span>
          <span class="tray-recipient__flux" aria-hidden="true">${icon('i-send')}</span>
        </div>`;
    }
    updateComposer();
  }

  function renderFiles() {
    el.fileList.innerHTML = state.files.map((entry) => {
      const f = entry.file;
      return `
        <li class="file-row">
          <span class="file-row__icon" aria-hidden="true">${icon(fileIcon(f.type, f.name))}</span>
          <span class="file-row__name" title="${esc(f.name)}">${esc(f.name)}</span>
          <span class="file-row__size">${esc(fmtBytes(f.size))}</span>
          <button class="file-row__remove" type="button" data-remove-file="${esc(entry.key)}" aria-label="Remove ${esc(f.name)}">${icon('i-close')}</button>
        </li>`;
    }).join('');
    updateComposer();
  }

  function updateComposer() {
    const device = getSelected();
    const hasPayload = state.files.length > 0 || el.noteInput.value.trim().length > 0;
    el.sendBtn.disabled = !device || !hasPayload || state.sending || !state.connected;
    el.sendBtnText.textContent = state.sending ? 'sending...' : 'send it';
    el.sendCount.textContent = String(state.files.length);
    el.sendCount.classList.toggle('has-items', state.files.length > 0);

    if (!device) {
      el.trayHint.textContent = state.files.length
        ? 'nice pile. now pick a device to send it to ♡'
        : 'pick a device first, then toss your files in.';
    } else if (!state.connected) {
      el.trayHint.textContent = 'reconnecting... the files are safe here.';
    } else if (state.sending) {
      el.trayHint.textContent = 'uploading over local wi-fi — hold tight ♡';
    } else if (!hasPayload) {
      el.trayHint.textContent = `drop a file or write a note for ${device.name}.`;
    } else {
      el.trayHint.textContent = `${device.name} will get a little accept window ♡`;
    }
  }

  /* ---------------- rendering: transfer log ---------------- */

  function renderLog() {
    const list = [...state.transfers.values()]
      .filter((t) => !state.hidden.has(t.id))
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!list.length) {
      el.transferLog.innerHTML = `
        <div class="log-empty">
          ${icon('i-note')}
          <p><strong>no handoffs yet.</strong><br>incoming and outgoing files will land here, with their tiny receipts.</p>
        </div>`;
      return;
    }

    el.transferLog.innerHTML = list.map(tcardHtml).join('');
  }

  function tcardHtml(t) {
    const outgoing = t.fromId === state.me.id;
    const peer = (outgoing ? t.to : t.from) || { name: 'unknown device', type: 'unknown', avatar: 'mascot' };
    const info = typeInfo(peer.type);
    const total = (t.files || []).reduce((sum, f) => sum + Number(f.size || 0), 0);
    const names = (t.files || []).map((f) => f.name).join(', ');
    const summary = t.files?.length
      ? `${t.files.length} ${t.files.length === 1 ? 'file' : 'files'} · ${fmtBytes(total)}${names ? ` · ${names}` : ''}`
      : 'a note, no files';

    const badge = {
      pending: outgoing ? 'waiting' : 'action needed',
      accepted: 'accepted',
      declined: 'declined',
      expired: 'expired',
    }[t.status] || t.status;

    let actions = '';
    if (!outgoing && t.status === 'pending') {
      actions = `
        <button class="mini-btn" type="button" data-log-action="accept" data-id="${esc(t.id)}">${icon('i-check')}accept</button>
        <button class="mini-btn mini-btn--pink" type="button" data-log-action="decline" data-id="${esc(t.id)}">${icon('i-close')}decline</button>`;
    } else if (!outgoing && t.status === 'accepted' && t.files?.length) {
      actions = `
        <button class="mini-btn" type="button" data-log-action="download-all" data-id="${esc(t.id)}">${icon('i-download')}save all</button>
        <button class="mini-btn" type="button" data-log-action="view" data-id="${esc(t.id)}">details</button>`;
    } else if (t.status !== 'pending') {
      actions = `<button class="mini-btn" type="button" data-log-action="view" data-id="${esc(t.id)}">details</button>`;
    }

    return `
      <article class="tcard tcard--${outgoing ? 'out' : 'in'}">
        <span class="tcard__dir" aria-hidden="true">${icon(outgoing ? 'i-upload' : 'i-arrow-dl')}</span>
        <div class="tcard__body">
          <div class="tcard__top">
            <strong class="tcard__peer">${outgoing ? 'to' : 'from'} ${esc(peer.name)}</strong>
            <span class="badge badge--${esc(t.status)}">${badge}</span>
            <time datetime="${new Date(t.createdAt).toISOString()}">${timeAgo(t.createdAt)}</time>
          </div>
          <p class="tcard__summary">${esc(summary)}</p>
          ${t.message ? `<p class="tcard__note">“${esc(t.message)}”</p>` : ''}
          ${actions ? `<div class="tcard__actions">${actions}</div>` : ''}
        </div>
      </article>`;
  }

  /* ---------------- SSE + Render Cloud Relay + Demo Fallback ---------------- */

  const RENDER_BACKEND = 'https://kurizu-game-server.onrender.com';
  const API_BASE = (location.port === '53317' || location.port === '3000') ? '' : RENDER_BACKEND;

  let source = null;
  let demoMode = false;
  const demoBlobs = new Map();
  const DEMO_PEER = {
    id: 'wisteria-demo-phone',
    name: 'wisteria-phone (bot)',
    avatar: 'pet',
    type: 'phone',
  };

  function enableBrowserDemoMode() {
    if (demoMode) return;
    demoMode = true;
    state.devices = [state.me, DEMO_PEER];
    if (!state.selectedId) state.selectedId = DEMO_PEER.id;
    setShareUrl();
    setConnected(true);
    el.windowBadge.textContent = 'WEB DEMO · LOCAL ROOM';
    el.lanPillText.textContent = 'web demo';
    updateProfileP2pUi(null);
    renderDevices();
    renderTray();
    updateComposer();
    toast('connected to kurizu.dropship room ♡ drop files on the right to test!', 'pink');
  }

  function connectEvents() {
    if (location.protocol === 'file:') {
      enableBrowserDemoMode();
      return;
    }
    if (source) source.close();
    const params = new URLSearchParams({
      deviceId: state.me.id,
      name: state.me.name,
      avatar: state.me.avatar,
      type: state.me.type,
    });
    if (state.room) params.set('room', state.room);
    try {
      source = new EventSource(`${API_BASE}/api/events?${params.toString()}`);
    } catch {
      enableBrowserDemoMode();
      return;
    }

    source.onopen = () => setConnected(true);
    source.onerror = () => {
      if (!state.server) {
        enableBrowserDemoMode();
      } else {
        setConnected(false);
      }
    };

    source.addEventListener('hello', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      demoMode = false;

      const restarted = state.server && data.server && state.server.startedAt !== data.server.startedAt;

      if (restarted) {
        const activeTransfer = (activeDownloadCancel && state.activeOfferId)
          ? state.transfers.get(state.activeOfferId)
          : null;
        state.transfers.clear();
        state.queue = [];
        state.queued.clear();
        state.hidden.clear();
        if (activeTransfer) {
          state.transfers.set(activeTransfer.id, activeTransfer);
        } else if (state.activeOfferId) {
          state.activeOfferId = null;
          if (el.incomingDialog.open) el.incomingDialog.close();
        }
        toast(
          activeTransfer
            ? 'signaling server restarted — your direct P2P download is still running ♡'
            : 'the little server restarted — history cleared ♡',
          'info'
        );
      }

      state.server = data.server || state.server;
      if (Array.isArray(data.avatars) && data.avatars.length) state.avatars = data.avatars;
      if (data.limits) state.limits = { ...state.limits, ...data.limits };

      if (data.self) {
        state.me = { ...state.me, ...data.self };
        store.set('kurizu-send-id', state.me.id);
        store.set('kurizu-send-name', state.me.name);
        store.set('kurizu-send-avatar', state.me.avatar);
        if (document.activeElement !== el.deviceName) el.deviceName.value = state.me.name;
        el.myAvatar.src = avatarSrc(state.me.avatar);
        setTypeUi();
      }

      state.devices = Array.isArray(data.devices) ? data.devices : [];
      setShareUrl();
      setConnected(true);
      renderDevices();
      updateRoomBadgeUi();

      const history = Array.isArray(data.transfers) ? data.transfers : [];
      history.forEach((transfer) => state.transfers.set(transfer.id, transfer));
      renderLog();

      history.forEach((transfer) => {
        if (transfer.toId === state.me.id) enqueueOffer(transfer);
      });

      if (state.activeOfferId && el.incomingDialog.open && !activeDownloadCancel) {
        const active = state.transfers.get(state.activeOfferId);
        if (active && active.status !== 'pending') renderOfferResult(active);
      }
    });

    source.addEventListener('devices', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      state.devices = Array.isArray(data.devices) ? data.devices : [];
      renderDevices();
    });

    source.addEventListener('offer', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      const transfer = data.transfer;
      if (!transfer) return;
      const known = state.transfers.has(transfer.id);
      state.transfers.set(transfer.id, transfer);
      renderLog();
      if (transfer.toId === state.me.id) {
        enqueueOffer(transfer);
        if (!known) {
          soundReceive();
          toast(`incoming from ${transfer.from.name} ♡`, 'pink');
        }
      }
    });

    source.addEventListener('transfer-update', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      const transfer = data.transfer;
      if (!transfer) return;
      state.transfers.set(transfer.id, transfer);
      state.queue = state.queue.filter((id) => id !== transfer.id);
      renderLog();
      if (el.incomingDialog.open && state.activeOfferId === transfer.id && !activeDownloadCancel) {
        renderOfferResult(transfer);
      }

      const outgoing = transfer.fromId === state.me.id;
      if (outgoing) {
        const who = data.by?.name || transfer.to?.name || 'they';
        if (transfer.status === 'accepted') {
          toast(`${who} accepted ${transfer.files?.length ? 'your files — streaming P2P when they hit save' : 'your note'} ♡`, 'success');
          soundAccept();
        } else if (transfer.status === 'declined') {
          toast(`${who} declined. no hard feelings.`, 'pink');
          soundDecline();
        }
      }
    });

    source.addEventListener('signal', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      handleIncomingP2pSignal(data);
    });
  }

  /* ---------------- WebRTC P2P Direct Streaming (up to 25 GB+ with Flow Control & Auto-Resume) ---------------- */

  const P2P_DISK_BATCH_BYTES = 2 * 1024 * 1024; // 2 MB batched disk writes (1 stream)
  const P2P_MAX_IN_FLIGHT_BYTES = 16 * 1024 * 1024; // 16 MB un-acknowledged window (1 stream)
  const P2P_LANE_MAX_IN_FLIGHT = 12 * 1024 * 1024; // 12 MB (= 6 stripes) reorder window per parallel lane
  let activeWakeLock = null;

  async function acquireTransferWakeLock() {
    try {
      if ('wakeLock' in navigator && !activeWakeLock) {
        activeWakeLock = await navigator.wakeLock.request('screen');
        activeWakeLock.addEventListener('release', () => { activeWakeLock = null; });
      }
    } catch {}
  }

  function releaseTransferWakeLock() {
    try {
      if (activeWakeLock) {
        activeWakeLock.release();
        activeWakeLock = null;
      }
    } catch {}
  }

  function updateP2pDialogProgress(text, fraction, visible = true, opts = {}) {
    const wrap = $('#p2pDialogProgress', el.incomingBody);
    const labelEl = $('#p2pDialogLabel', el.incomingBody);
    const progEl = $('#p2pSakugaProgress', el.incomingBody);
    if (!wrap) return;
    wrap.hidden = !visible;
    if (labelEl) labelEl.textContent = text;
    if (progEl) {
      if (opts.label) progEl.setAttribute('label', opts.label);
      if (opts.reset && typeof progEl.reset === 'function') {
        progEl.reset();
      } else if (typeof progEl.set === 'function') {
        const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));
        progEl.set(clamped, Boolean(opts.instant));
      }
    }
  }

  function setDownloadCancelable(cancelFn) {
    activeDownloadCancel = typeof cancelFn === 'function' ? cancelFn : null;
    const actionsEl = $('#p2pDialogActions', el.incomingBody);
    const cancelBtn = $('#p2pCancelBtn', el.incomingBody);
    if (actionsEl) actionsEl.hidden = !activeDownloadCancel;
    if (cancelBtn) cancelBtn.disabled = false;
  }

  function waitForSakugaDone(progEl) {
    return new Promise((resolve) => {
      if (!progEl || typeof progEl.set !== 'function' || progEl.done) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        progEl.removeEventListener('sakuga:done', finish);
        resolve();
      };
      progEl.addEventListener('sakuga:done', finish, { once: true });
      const fallbackTimer = setTimeout(finish, 4500);
    });
  }

  async function sendP2pSignal(to, transferId, signal) {
    return api('/api/signal', { to, transferId, signal });
  }

  function cancelSenderGroup(batchId) {
    const group = p2pSenderGroups.get(batchId);
    if (!group || group.cancelled) return;
    group.cancelled = true;
    for (const sess of [...group.sessions]) {
      try { sess.onCancel?.(); } catch {}
      try { sess.dc?.close(); } catch {}
      try { sess.pc?.close(); } catch {}
    }
    group.sessions.clear();
    p2pSenderGroups.delete(batchId);
    setProgress(`P2P cancelled · ${group.fileName}`, 0);
    toast(`receiver cancelled ${group.fileName}`, 'pink');
    setTimeout(() => {
      if (!state.sending && p2pSenderGroups.size === 0) {
        el.sendProgress.hidden = true;
        if (el.sendSignalPanel) el.sendSignalPanel.hidden = true;
      }
    }, 1800);
  }

  async function handleIncomingP2pSignal(payload) {
    const fromId = payload?.from;
    const transferId = payload?.transferId;
    const sig = payload?.signal;
    if (!fromId || !sig || !sig.sessionId) return;

    if (sig.type === 'p2p-cancel') {
      cancelSenderGroup(sig.batchId || sig.sessionId);
      return;
    }

    // 1. Sender receives a P2P request offer from Receiver to stream a specific file (supports range + startOffset resume!)
    if (sig.type === 'p2p-offer') {
      const file = p2pOutgoingFiles.get(sig.fileId);
      if (!file) {
        sendP2pSignal(fromId, transferId, {
          type: 'p2p-error',
          sessionId: sig.sessionId,
          fatal: true,
          error: 'Sender no longer has this file in memory (sender tab was refreshed).',
        }).catch(() => {});
        return;
      }

      const startOffset = Math.max(0, Math.min(file.size, Number(sig.startOffset) || 0));
      const endOffset = sig.endOffset != null ? Math.max(startOffset, Math.min(file.size, Number(sig.endOffset))) : file.size;
      const laneStart = sig.laneStart != null ? Math.max(0, Math.min(startOffset, Number(sig.laneStart))) : 0;
      const laneIndex = Math.max(0, Number(sig.laneIndex) || 0);
      const laneCount = Math.max(1, Math.min(P2P_PARALLEL_LANES, Number(sig.laneCount) || 1));
      const stripeBytes = Math.max(0, Number(sig.stripeBytes) || 0);
      const startStripe = Math.max(0, Number(sig.startStripe) || laneIndex);
      const batchId = sig.batchId || sig.sessionId;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const sess = { pc, iceQueue: [], remoteDescSet: false };
      p2pSessions.set(sig.sessionId, sess);

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendP2pSignal(fromId, transferId, {
            type: 'p2p-ice',
            sessionId: sig.sessionId,
            candidate: ev.candidate,
          }).catch(() => {});
        }
      };

      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = laneCount > 1 ? P2P_LANE_LOW_WATER : P2P_LOW_WATER;
        dc.onopen = () => {
          streamFileOverDataChannel(file, dc, sig.sessionId, payload?.fromDevice?.name || 'peer', startOffset, pc, {
            endOffset,
            laneStart,
            laneIndex,
            laneCount,
            stripeBytes,
            startStripe,
            batchId,
          });
        };
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        sess.remoteDescSet = true;
        for (const c of sess.iceQueue) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        sess.iceQueue = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendP2pSignal(fromId, transferId, {
          type: 'p2p-answer',
          sessionId: sig.sessionId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        try { pc.close(); } catch {}
        p2pSessions.delete(sig.sessionId);
      }
      return;
    }

    // 2. Receiver receives SDP answer or ICE candidate from Sender
    const sess = p2pSessions.get(sig.sessionId);
    if (!sess) return;

    if (sig.type === 'p2p-answer' && sig.sdp) {
      try {
        await sess.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        sess.remoteDescSet = true;
        for (const c of sess.iceQueue) {
          await sess.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        sess.iceQueue = [];
      } catch {}
      return;
    }

    if (sig.type === 'p2p-ice' && sig.candidate) {
      if (sess.remoteDescSet) {
        await sess.pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
      } else {
        sess.iceQueue.push(sig.candidate);
      }
      return;
    }

    if (sig.type === 'p2p-error') {
      if (sess.onError) sess.onError(new Error(sig.error || 'P2P stream failed'), Boolean(sig.fatal));
    }
  }

  let activeP2pMonitors = 0;

  function supportsWebRtc() {
    return typeof window.RTCPeerConnection === 'function';
  }

  function signalFromRtt(rttMs) {
    if (rttMs == null || !Number.isFinite(rttMs)) {
      return { bars: 0, quality: 'checking', rttText: '-- ms', rttMs: null };
    }
    const ms = Math.max(1, Math.round(rttMs));
    if (ms < 35) return { bars: 4, quality: 'excellent', rttText: `${ms}ms`, rttMs: ms };
    if (ms < 90) return { bars: 3, quality: 'good', rttText: `${ms}ms`, rttMs: ms };
    if (ms < 180) return { bars: 2, quality: 'fair', rttText: `${ms}ms`, rttMs: ms };
    return { bars: 1, quality: 'weak', rttText: `${ms}ms`, rttMs: ms };
  }

  function renderSignalBarsHtml(bars) {
    const level = Math.max(0, Math.min(4, Number(bars) || 0));
    let html = `<span class="sig-bars sig-bars--${level}" aria-hidden="true">`;
    for (let i = 0; i < 4; i += 1) {
      html += `<i${i < level ? ' class="is-on"' : ''}></i>`;
    }
    return `${html}</span>`;
  }

  function updateProfileP2pUi(info = null) {
    if (!el.p2pProfileBadge || !el.p2pProfileText || !el.p2pProfileSignal) return;
    if (!info && activeP2pMonitors > 0) return;

    let cls = 'is-ready';
    let text = 'P2P READY';
    let bars = 0;
    let sigText = 'standby';

    if (info && info.active) {
      cls = info.isDirect === false ? 'is-relay' : 'is-direct';
      text = info.route || 'P2P DIRECT';
      bars = Number(info.bars) || 0;
      sigText = info.rttText || 'live';
    } else if (demoMode) {
      cls = 'is-relay';
      text = 'DEMO · LOCAL';
      sigText = 'demo';
    } else if (!supportsWebRtc()) {
      cls = 'is-offline';
      text = 'NO WEBRTC';
      sigText = 'n/a';
    } else if (!state.connected) {
      cls = 'is-offline';
      text = 'P2P OFFLINE';
      sigText = 'wait';
    } else {
      cls = 'is-ready';
      text = state.room ? 'P2P READY · ROOM' : 'P2P READY';
      bars = 4;
      sigText = 'ready';
    }

    el.p2pProfileBadge.className = `p2p-badge ${cls}`;
    el.p2pProfileText.textContent = text;
    el.p2pProfileSignal.innerHTML = `${renderSignalBarsHtml(bars)}<span class="p2p-profile-signal__text">${esc(sigText)}</span>`;
  }

  function renderPeerSignalPanel(containerEl, senderSig, receiverSig, routeInfo) {
    if (!containerEl) return;
    containerEl.hidden = false;
    const s = senderSig || { bars: 0, quality: 'checking', rttText: '-- ms' };
    const r = receiverSig || { bars: 0, quality: 'checking', rttText: '-- ms' };
    const isDirect = routeInfo?.isDirect !== false;
    const routeLabel = routeInfo?.route || 'P2P DIRECT';
    const modeTag = (routeInfo?.laneCount || 1) > 1 ? `${routeInfo.laneCount}x PARALLEL` : 'E2E WebRTC';
    const sText = s.bars > 0 ? `${s.quality} · ${s.rttText}` : 'checking...';
    const rText = r.bars > 0 ? `${r.quality} · ${r.rttText}` : 'checking...';

    containerEl.innerHTML = `
      <span class="p2p-signal-route ${isDirect ? 'is-direct' : 'is-relay'}">${isDirect ? '⚡' : '☁'} ${esc(routeLabel)} · ${esc(modeTag)}</span>
      <div class="p2p-signal-grid">
        <div class="p2p-signal-card">
          <span class="p2p-signal-card__role">sender signal</span>
          <div class="p2p-signal-card__row">
            ${renderSignalBarsHtml(s.bars)}
            <span class="p2p-signal-card__val">${esc(sText)}</span>
          </div>
        </div>
        <div class="p2p-signal-card">
          <span class="p2p-signal-card__role">receiver signal</span>
          <div class="p2p-signal-card__row">
            ${renderSignalBarsHtml(r.bars)}
            <span class="p2p-signal-card__val">${esc(rText)}</span>
          </div>
        </div>
      </div>`;
  }

  function startP2pStatsMonitor(pc, dc, role, onUpdate, opts = {}) {
    let stopped = false;
    let counted = true;
    activeP2pMonitors += 1;

    const laneCount = Math.max(1, Number(opts.laneCount) || 1);
    let localSig = { bars: 0, quality: 'checking', rttText: '-- ms', rttMs: null };
    let remoteSig = { bars: 0, quality: 'checking', rttText: '-- ms', rttMs: null };
    let routeInfo = { route: 'P2P DIRECT', isDirect: true, resolved: false, laneCount };
    let appRttMs = null;

    const emit = () => {
      if (stopped) return;
      const sender = role === 'sender' ? localSig : remoteSig;
      const receiver = role === 'receiver' ? localSig : remoteSig;
      updateProfileP2pUi({
        active: true,
        route: laneCount > 1 ? `${routeInfo.route} · ${laneCount}x` : routeInfo.route,
        isDirect: routeInfo.isDirect,
        bars: localSig.bars,
        rttText: localSig.rttText,
      });
      if (typeof onUpdate === 'function') {
        onUpdate({ sender, receiver, routeInfo, local: localSig });
      }
    };

    const poll = async () => {
      if (stopped) return;
      if (dc && dc.readyState === 'open') {
        try { dc.send(JSON.stringify({ ping: Date.now() })); } catch {}
      }
      if (pc && typeof pc.getStats === 'function') {
        try {
          const stats = await pc.getStats();
          let pair = null;
          stats.forEach((rep) => {
            if (rep.type === 'transport' && rep.selectedCandidatePairId) {
              pair = stats.get(rep.selectedCandidatePairId) || pair;
            }
          });
          if (!pair) {
            stats.forEach((rep) => {
              if (rep.type === 'candidate-pair' && (rep.nominated || rep.state === 'succeeded')) {
                if (!pair || rep.nominated) pair = rep;
              }
            });
          }

          const statsRtt = typeof pair?.currentRoundTripTime === 'number'
            ? Math.round(pair.currentRoundTripTime * 1000)
            : null;
          const bestRtt = statsRtt != null ? statsRtt : appRttMs;

          const localCand = pair?.localCandidateId ? stats.get(pair.localCandidateId) : null;
          const remoteCand = pair?.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null;
          if (localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay') {
            routeInfo = { route: 'TURN RELAY', isDirect: false, resolved: true, laneCount };
          } else if (localCand?.candidateType === 'host' && remoteCand?.candidateType === 'host') {
            routeInfo = { route: 'P2P DIRECT · LAN', isDirect: true, resolved: true, laneCount };
          } else if (localCand || remoteCand) {
            routeInfo = { route: 'P2P DIRECT · WAN', isDirect: true, resolved: true, laneCount };
          }

          localSig = signalFromRtt(bestRtt);

          if (dc && dc.readyState === 'open') {
            try {
              dc.send(JSON.stringify({
                stats: {
                  role,
                  rttMs: bestRtt,
                  bars: localSig.bars,
                  quality: localSig.quality,
                  route: routeInfo.route,
                  isDirect: routeInfo.isDirect,
                },
              }));
            } catch {}
          }
        } catch {}
      }
      emit();
    };

    const handleControlMessage = (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (typeof msg.ping === 'number') {
        if (dc && dc.readyState === 'open') {
          try { dc.send(JSON.stringify({ pong: msg.ping })); } catch {}
        }
      }
      if (typeof msg.pong === 'number') {
        appRttMs = Math.max(1, Date.now() - msg.pong);
      }
      if (msg.stats && typeof msg.stats === 'object') {
        const computed = signalFromRtt(msg.stats.rttMs);
        remoteSig = {
          bars: typeof msg.stats.bars === 'number' && msg.stats.bars > 0 ? msg.stats.bars : computed.bars,
          quality: msg.stats.quality || computed.quality,
          rttText: computed.rttText,
          rttMs: computed.rttMs,
        };
        if (!routeInfo.resolved && msg.stats.route) {
          routeInfo = {
            route: msg.stats.route,
            isDirect: msg.stats.isDirect !== false,
            resolved: true,
            laneCount,
          };
        }
        emit();
      }
    };

    const initTimer = setTimeout(poll, 350);
    const intervalId = setInterval(poll, 1500);
    emit();

    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(initTimer);
      clearInterval(intervalId);
      if (counted) {
        counted = false;
        activeP2pMonitors = Math.max(0, activeP2pMonitors - 1);
      }
      if (activeP2pMonitors === 0) updateProfileP2pUi(null);
    };

    return { handleControlMessage, stop };
  }

  async function streamFileOverDataChannel(file, dc, sessionId, peerName, startOffset = 0, pc = null, laneOpts = {}) {
    const total = file.size || 1;
    const laneIndex = Math.max(0, Number(laneOpts.laneIndex) || 0);
    const laneCount = Math.max(1, Number(laneOpts.laneCount) || 1);
    const stripeBytes = Math.max(0, Number(laneOpts.stripeBytes) || 0);
    const isStriped = laneCount > 1 && stripeBytes > 0;
    const totalStripes = isStriped ? Math.ceil(total / stripeBytes) : 0;
    const startStripe = isStriped ? Math.max(laneIndex, Number(laneOpts.startStripe) || laneIndex) : 0;

    const laneDoneBytesBefore = (stripeIdx) => {
      let sum = 0;
      for (let s = laneIndex; s < stripeIdx && s < totalStripes; s += laneCount) {
        sum += Math.min(stripeBytes, total - s * stripeBytes);
      }
      return sum;
    };

    const laneStart = Math.max(0, Math.min(total, Number(laneOpts.laneStart) || 0));
    const endOffset = laneOpts.endOffset != null ? Math.max(laneStart, Math.min(total, Number(laneOpts.endOffset))) : total;
    const batchId = laneOpts.batchId || sessionId;
    let offset = Math.max(laneStart, Math.min(endOffset, Number(startOffset) || 0));
    let sentLaneBytes = isStriped ? laneDoneBytesBefore(startStripe) : Math.max(0, offset - laneStart);
    let ackedBytes = isStriped ? sentLaneBytes : offset;
    let ackWaitResolver = null;
    let cancelled = false;

    const currentProgressBytes = () => (isStriped ? sentLaneBytes : offset);
    const currentInFlight = () => currentProgressBytes() - ackedBytes;

    const maxBuffered = laneCount > 1 ? P2P_LANE_MAX_BUFFERED : P2P_MAX_BUFFERED;
    const lowWater = laneCount > 1 ? P2P_LANE_LOW_WATER : P2P_LOW_WATER;
    const maxInFlight = laneCount > 1 ? P2P_LANE_MAX_IN_FLIGHT : P2P_MAX_IN_FLIGHT_BYTES;

    let group = p2pSenderGroups.get(batchId);
    if (!group) {
      group = {
        batchId,
        fileName: file.name,
        totalBytes: total,
        laneCount,
        lanes: new Map(),
        sessions: new Set(),
        speed: createSpeedTracker(0),
        lastUiUpdate: 0,
        toasted: false,
        finished: false,
        cancelled: false,
      };
      p2pSenderGroups.set(batchId, group);
    }
    if (group.cancelled) return;

    group.lanes.set(laneIndex, {
      doneBytes: sentLaneBytes,
      done: false,
    });
    const sessionEntry = {
      pc,
      dc,
      onCancel: () => {
        cancelled = true;
        if (ackWaitResolver) {
          const r = ackWaitResolver;
          ackWaitResolver = null;
          r();
        }
      },
    };
    group.sessions.add(sessionEntry);

    // Dynamically pick largest safe SCTP chunk (up to 240 KB when peer allows >=256 KB, falling back to 64 KB)
    const negotiatedSctp = Number(pc?.sctp?.maxMessageSize) || P2P_DEFAULT_CHUNK_BYTES;
    let chunkBytes = Math.min(
      P2P_MAX_CHUNK_BYTES,
      Math.max(P2P_DEFAULT_CHUNK_BYTES, Math.floor(negotiatedSctp / 1024) * 1024)
    );

    const statsMon = (pc && laneIndex === 0)
      ? startP2pStatsMonitor(pc, dc, 'sender', ({ sender, receiver, routeInfo }) => {
          if (el.sendProgress && !el.sendProgress.hidden) {
            renderPeerSignalPanel(el.sendSignalPanel, sender, receiver, routeInfo);
          }
        }, { laneCount })
      : null;

    acquireTransferWakeLock();
    if (!group.toasted) {
      group.toasted = true;
      const modeLabel = laneCount > 1 ? `${laneCount}x parallel · ${Math.round(chunkBytes / 1024)}KB chunks` : `${Math.round(chunkBytes / 1024)}KB chunks`;
      if (sentLaneBytes === 0 && offset === laneStart) {
        toast(`streaming ${file.name} (${fmtBytes(total)}) to ${peerName} via P2P (${modeLabel}) ⚡`, 'info');
      } else {
        toast(`resuming ${file.name}... ⚡`, 'info');
      }
    }

    // Listen for Receiver disk-flush ACKs, cancel requests & signal telemetry
    dc.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.cancel) {
          cancelSenderGroup(batchId);
          return;
        }
        statsMon?.handleControlMessage(msg);
        if (typeof msg.ack === 'number' && msg.ack > ackedBytes) {
          ackedBytes = msg.ack;
          if (ackWaitResolver && currentInFlight() <= maxInFlight && dc.bufferedAmount <= lowWater) {
            const r = ackWaitResolver;
            ackWaitResolver = null;
            r();
          }
        }
      } catch {}
    };

    const waitForBufferAndAck = () =>
      new Promise((resolve, reject) => {
        if (cancelled || group.cancelled) { reject(new Error('Transfer cancelled')); return; }
        if (dc.readyState !== 'open') { reject(new Error('DataChannel closed')); return; }
        if (dc.bufferedAmount <= lowWater && currentInFlight() <= maxInFlight) { resolve(); return; }

        let settled = false;
        const finish = (err) => {
          if (settled) return;
          settled = true;
          clearInterval(pollTimer);
          clearTimeout(safetyTimer);
          dc.removeEventListener('bufferedamountlow', check);
          dc.removeEventListener('close', onClose);
          if (ackWaitResolver === check) ackWaitResolver = null;
          if (err) reject(err);
          else resolve();
        };
        const check = () => {
          if (cancelled || group.cancelled) { finish(new Error('Transfer cancelled')); return; }
          if (dc.readyState !== 'open') { finish(new Error('DataChannel closed')); return; }
          if (dc.bufferedAmount <= lowWater && currentInFlight() <= maxInFlight) {
            finish();
          }
        };
        const onClose = () => finish(new Error('DataChannel closed mid-transfer'));
        // 100ms poll guards against missed bufferedamountlow events in Chromium
        const pollTimer = setInterval(check, 100);
        // Safety release ONLY in single-stream mode; in striped parallel mode ACKs enforce strict <=36MB receiver RAM cap
        const safetyTimer = !isStriped
          ? setTimeout(() => {
              if (dc.readyState === 'open' && dc.bufferedAmount <= lowWater) {
                ackedBytes = currentProgressBytes();
                finish();
              }
            }, 4000)
          : null;

        dc.addEventListener('bufferedamountlow', check);
        dc.addEventListener('close', onClose);
        ackWaitResolver = check;
      });

    const sendBlock = async (blockBuf) => {
      let pos = 0;
      while (pos < blockBuf.byteLength && !cancelled && !group.cancelled) {
        if (dc.readyState !== 'open') throw new Error('Peer connection interrupted');
        if (dc.bufferedAmount > maxBuffered || currentInFlight() > maxInFlight) {
          await waitForBufferAndAck();
        }
        const endPos = Math.min(blockBuf.byteLength, pos + chunkBytes);
        const packet = blockBuf.subarray(pos, endPos);
        try {
          dc.send(packet);
          pos = endPos;
          if (isStriped) sentLaneBytes += packet.byteLength;
          else offset += packet.byteLength;
        } catch (sendErr) {
          if (chunkBytes > P2P_DEFAULT_CHUNK_BYTES) {
            // Peer SCTP stack rejected large message size — step down safely to 64 KB
            chunkBytes = P2P_DEFAULT_CHUNK_BYTES;
            continue;
          }
          throw sendErr;
        }

        const laneState = group.lanes.get(laneIndex);
        if (laneState) laneState.doneBytes = isStriped ? sentLaneBytes : Math.max(0, offset - laneStart);

        const now = Date.now();
        if (now - group.lastUiUpdate >= 120) {
          group.lastUiUpdate = now;
          let aggSent = 0;
          for (const l of group.lanes.values()) aggSent += l.doneBytes;
          const pct = Math.min(100, (aggSent / total) * 100);
          const { mbpsText, etaText } = group.speed.sample(aggSent, total);
          const tag = laneCount > 1 ? `P2P (${laneCount}x)` : 'P2P';
          setProgress(`${tag} · ${file.name} · ${fmtBytes(aggSent)} / ${fmtBytes(total)} · ${mbpsText} MB/s · ${etaText}`, pct);
        }
      }
    };

    try {
      if (isStriped) {
        for (let s = startStripe; s < totalStripes && !cancelled && !group.cancelled; s += laneCount) {
          if (dc.readyState !== 'open') throw new Error('Peer connection interrupted');
          const sStart = s * stripeBytes;
          const sEnd = Math.min(total, sStart + stripeBytes);
          const blockBuf = new Uint8Array(await file.slice(sStart, sEnd).arrayBuffer());
          await sendBlock(blockBuf);
        }
      } else {
        while (offset < endOffset && !cancelled && !group.cancelled) {
          if (dc.readyState !== 'open') throw new Error('Peer connection interrupted');
          const blockEnd = Math.min(endOffset, offset + P2P_READ_AHEAD_BYTES);
          const blockBuf = new Uint8Array(await file.slice(offset, blockEnd).arrayBuffer());
          await sendBlock(blockBuf);
        }
      }

      if (cancelled || group.cancelled) return;

      dc.send(JSON.stringify({ eof: true, laneIndex, size: isStriped ? sentLaneBytes : (endOffset - laneStart), name: file.name }));
      const laneState = group.lanes.get(laneIndex);
      if (laneState) {
        laneState.doneBytes = isStriped ? sentLaneBytes : Math.max(0, endOffset - laneStart);
        laneState.done = true;
      }

      let allDone = group.lanes.size >= laneCount;
      if (allDone) {
        for (const l of group.lanes.values()) {
          if (!l.done) { allDone = false; break; }
        }
      }

      if (allDone && !group.finished) {
        group.finished = true;
        p2pSenderGroups.delete(batchId);
        setProgress(`P2P delivered · ${file.name} ♡`, 100);
        toast(`finished streaming ${file.name} via P2P ♡`, 'success');
        soundSparkle();
        setTimeout(() => {
          if (!state.sending && p2pSenderGroups.size === 0) {
            el.sendProgress.hidden = true;
            if (el.sendSignalPanel) el.sendSignalPanel.hidden = true;
          }
        }, 2400);
      }
    } catch (err) {
      if (cancelled || group.cancelled) return;
      let aggSent = 0;
      for (const l of group.lanes.values()) aggSent += l.doneBytes;
      const label = laneCount > 1 ? `P2P lane ${laneIndex + 1} paused` : `P2P paused at ${fmtBytes(aggSent)}`;
      setProgress(`${label} — waiting for auto-resume...`, (aggSent / total) * 100);
    } finally {
      group.sessions.delete(sessionEntry);
      statsMon?.stop();
      if (p2pSenderGroups.size === 0 || [...p2pSenderGroups.values()].every((g) => g.sessions.size === 0)) {
        releaseTransferWakeLock();
      }
    }
  }

  async function openBestDiskSink(file) {
    // 1. Try native Save File Picker (from top window if inside same-origin portfolio iframe, or current window)
    const pickerFn = (() => {
      try {
        if (window.top && typeof window.top.showSaveFilePicker === 'function') {
          return window.top.showSaveFilePicker.bind(window.top);
        }
      } catch {}
      if (typeof window.showSaveFilePicker === 'function') {
        return window.showSaveFilePicker.bind(window);
      }
      return null;
    })();

    if (pickerFn) {
      try {
        const handle = await pickerFn({ suggestedName: file.name || 'download' });
        const writable = await handle.createWritable();
        return { kind: 'picker', writable, handle };
      } catch (err) {
        if (err && err.name === 'AbortError') return { kind: 'cancelled' };
      }
    }

    // 2. Fallback to Origin Private File System (OPFS) disk storage so 20+ GB files NEVER buffer in RAM!
    if (navigator.storage && typeof navigator.storage.getDirectory === 'function') {
      try {
        const rootDir = await navigator.storage.getDirectory();
        const tempName = `kurizu_p2p_${Date.now()}_${(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const opfsHandle = await rootDir.getFileHandle(tempName, { create: true });
        const writable = await opfsHandle.createWritable();
        return { kind: 'opfs', writable, opfsHandle, rootDir, tempName };
      } catch {}
    }

    // 3. Last resort for small files only
    return { kind: 'memory', memChunks: [] };
  }

  async function downloadP2pFile(transfer, file, buttonEl) {
    if (p2pDownloadedBlobs.has(file.id)) {
      const link = document.createElement('a');
      link.href = p2pDownloadedBlobs.get(file.id);
      link.download = file.name || 'file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return { cancelled: false };
    }

    if (activeDownloadCancel) {
      toast('a download is already running — cancel it first ♡', 'info');
      return { cancelled: false };
    }

    const sink = await openBestDiskSink(file);
    if (sink.kind === 'cancelled') return { cancelled: true };

    if (sink.kind === 'memory' && Number(file.size) > 1.2 * 1024 * 1024 * 1024) {
      toast('Tip: open KURIZU.dropship in a new tab or Chrome/Edge to stream 20+ GB files directly to disk!', 'info', 6500);
    }

    acquireTransferWakeLock();
    const progEl = $('#p2pSakugaProgress', el.incomingBody);
    const totalBytes = Math.max(1, Number(file.size) || 1);
    const laneCount = (sink.writable && totalBytes >= P2P_PARALLEL_MIN_BYTES) ? P2P_PARALLEL_LANES : 1;
    const isStriped = laneCount > 1;
    const stripeBytes = isStriped ? P2P_STRIPE_BYTES : 0;
    const totalStripes = isStriped ? Math.ceil(totalBytes / stripeBytes) : 0;

    updateP2pDialogProgress(
      `preparing ${file.name} (${fmtBytes(file.size)})${laneCount > 1 ? ` · ${laneCount}x parallel` : ''}...`,
      0,
      true,
      { reset: true, label: `Downloading ${file.name}` }
    );

    const lanes = [];
    for (let i = 0; i < laneCount; i += 1) {
      lanes.push({
        index: i,
        laneStart: 0,
        end: totalBytes,
        queuedPos: 0,
        flushedPos: 0,
        receivedPos: 0,
        currentStripe: i,
        stripeBuf: null,
        stripeLen: 0,
        stripePos: 0,
        receivedLaneBytes: 0,
        committedLaneBytes: 0,
        flushedLaneBytes: 0,
        activeDc: null,
        batchBuf: isStriped ? null : new Uint8Array(P2P_DISK_BATCH_BYTES),
        batchSize: P2P_DISK_BATCH_BYTES,
        batchLen: 0,
        done: false,
      });
    }

    const prepareStripe = (lane) => {
      if (!isStriped || lane.currentStripe >= totalStripes) {
        lane.stripeBuf = null;
        lane.stripeLen = 0;
        lane.stripePos = 0;
        return;
      }
      lane.stripeLen = Math.min(stripeBytes, totalBytes - lane.currentStripe * stripeBytes);
      lane.stripeBuf = new Uint8Array(lane.stripeLen);
      lane.stripePos = 0;
    };
    if (isStriped) {
      for (const l of lanes) prepareStripe(l);
    }

    const completedStripes = new Map();
    let nextWriteStripe = 0;
    let totalWrittenBytes = 0;
    let writeQueue = Promise.resolve();
    const speed = createSpeedTracker(0);
    let lastUiUpdate = 0;
    let cancelled = false;
    const batchId = makeId();
    const laneAborters = new Set();

    setDownloadCancelable(() => {
      if (cancelled) return;
      cancelled = true;
      completedStripes.clear();
      for (const lane of lanes) {
        if (lane.activeDc && lane.activeDc.readyState === 'open') {
          try { lane.activeDc.send(JSON.stringify({ cancel: true })); } catch {}
        }
      }
      sendP2pSignal(transfer.fromId, transfer.id, {
        type: 'p2p-cancel',
        batchId,
        sessionId: batchId,
      }).catch(() => {});
      for (const abort of [...laneAborters]) {
        try { abort(); } catch {}
      }
    });

    const drainCompletedStripes = () => {
      while (!cancelled && completedStripes.has(nextWriteStripe)) {
        const entry = completedStripes.get(nextWriteStripe);
        completedStripes.delete(nextWriteStripe);
        nextWriteStripe += 1;
        const { data, lane, laneBytesAfter } = entry;
        const bytesInStripe = data.byteLength;
        writeQueue = writeQueue.then(async () => {
          if (cancelled) return;
          if (sink.writable) {
            await sink.writable.write(data);
          } else if (sink.memChunks) {
            sink.memChunks.push(data);
          }
          totalWrittenBytes += bytesInStripe;
          lane.flushedLaneBytes = laneBytesAfter;
          if (!cancelled && lane.activeDc && lane.activeDc.readyState === 'open') {
            try { lane.activeDc.send(JSON.stringify({ ack: lane.flushedLaneBytes })); } catch {}
          }
        });
      }
      return writeQueue;
    };

    const flushLaneBatch = (lane) => {
      if (isStriped) return drainCompletedStripes();
      if (lane.batchLen === 0 || cancelled) return writeQueue;
      const sliceCopy = lane.batchBuf.subarray(0, lane.batchLen).slice();
      const bytesInBatch = sliceCopy.byteLength;
      const writePos = lane.queuedPos;
      lane.queuedPos += bytesInBatch;
      lane.batchLen = 0;

      writeQueue = writeQueue.then(async () => {
        if (cancelled) return;
        if (sink.writable) {
          await sink.writable.write(sliceCopy);
        } else if (sink.memChunks) {
          sink.memChunks.push(sliceCopy);
        }
        totalWrittenBytes = writePos + bytesInBatch;
        lane.flushedPos = totalWrittenBytes;
        if (!cancelled && lane.activeDc && lane.activeDc.readyState === 'open') {
          try { lane.activeDc.send(JSON.stringify({ ack: lane.flushedPos })); } catch {}
        }
      });
      return writeQueue;
    };

    const updateAggregateUi = (force = false) => {
      if (cancelled) return;
      const now = Date.now();
      let totalReceived = 0;
      for (const l of lanes) {
        totalReceived += isStriped ? l.receivedLaneBytes : Math.max(0, l.receivedPos - l.laneStart);
      }
      if (!force && now - lastUiUpdate < 120 && totalReceived < totalBytes) return;
      lastUiUpdate = now;

      const frac = Math.min(1, totalReceived / totalBytes);
      const { mbpsText, etaText } = speed.sample(totalReceived, totalBytes);
      const tag = laneCount > 1 ? `streaming P2P (${laneCount}x parallel)` : 'streaming P2P';
      updateP2pDialogProgress(
        `${tag} · ${fmtBytes(totalReceived)} / ${fmtBytes(totalBytes)} · ${mbpsText} MB/s · ${etaText}`,
        frac,
        true
      );
      if (buttonEl) {
        buttonEl.textContent = `${Math.round(frac * 100)}%`;
      }
    };

    const runLaneAttempt = (lane, attemptNum) =>
      new Promise(async (resolve, reject) => {
        if (cancelled) {
          reject({ cancelled: true, fatal: true });
          return;
        }
        const sessionId = makeId();
        const pc = new RTCPeerConnection(RTC_CONFIG);
        const dc = pc.createDataChannel(`kurizu-p2p-${lane.index}`, { ordered: true });
        dc.binaryType = 'arraybuffer';
        lane.activeDc = dc;

        let finished = false;
        let lastChunkAt = Date.now();
        let statsMon = null;

        dc.onopen = () => {
          if (finished || cancelled || statsMon || lane.index !== 0) return;
          statsMon = startP2pStatsMonitor(pc, dc, 'receiver', ({ sender, receiver, routeInfo }) => {
            const panel = $('#p2pDialogSignals', el.incomingBody);
            if (panel) renderPeerSignalPanel(panel, sender, receiver, routeInfo);
          }, { laneCount });
        };

        if (lane.index === 0) {
          if (buttonEl) {
            buttonEl.disabled = true;
            buttonEl.textContent = attemptNum > 1 ? `resuming...` : 'connecting P2P...';
          }
          if (attemptNum === 1) {
            updateP2pDialogProgress(
              `connecting ${laneCount > 1 ? `${laneCount}x parallel ` : ''}direct P2P tunnel to ${transfer.from?.name || 'sender'}...`,
              0,
              true
            );
          }
        }

        const abortHandler = () => {
          if (finished) return;
          finished = true;
          cleanupAttempt();
          reject({ cancelled: true, fatal: true });
        };
        laneAborters.add(abortHandler);

        const cleanupAttempt = () => {
          clearInterval(watchdogId);
          laneAborters.delete(abortHandler);
          statsMon?.stop();
          statsMon = null;
          p2pSessions.delete(sessionId);
          if (lane.activeDc === dc) lane.activeDc = null;
          try { dc.close(); } catch {}
          try { pc.close(); } catch {}
        };

        const handleAttemptDisconnect = async (err, fatal = false) => {
          if (finished) return;
          finished = true;
          cleanupAttempt();
          if (cancelled) {
            reject({ cancelled: true, fatal: true });
            return;
          }
          if (isStriped) {
            // Keep already-finished stripes intact; discard only partial current stripe and resume at currentStripe
            lane.receivedLaneBytes = lane.committedLaneBytes;
            prepareStripe(lane);
          } else {
            try { await flushLaneBatch(lane); } catch {}
            lane.receivedPos = lane.flushedPos;
            lane.queuedPos = lane.flushedPos;
            lane.batchLen = 0;
          }
          reject({ err: err || new Error('P2P connection dropped'), fatal });
        };

        // Watchdog: if no data or ping arrives for 18 seconds on the blocking lane, trigger auto-resume
        const watchdogId = setInterval(() => {
          if (finished || cancelled) return;
          if (isStriped) {
            const isBlockingLane = (nextWriteStripe % laneCount === lane.index) || completedStripes.size === 0;
            if (!isBlockingLane) {
              // Lane is intentionally paused by backpressure while waiting for another lane — keep alive
              lastChunkAt = Date.now();
              return;
            }
          }
          if (Date.now() - lastChunkAt > 18000) {
            handleAttemptDisconnect(new Error('P2P stream stalled — reconnecting...'), false);
          }
        }, 3000);

        p2pSessions.set(sessionId, {
          pc,
          iceQueue: [],
          remoteDescSet: false,
          onError: (err, fatal) => handleAttemptDisconnect(err, fatal),
        });

        pc.onicecandidate = (ev) => {
          if (ev.candidate && !cancelled) {
            sendP2pSignal(transfer.fromId, transfer.id, {
              type: 'p2p-ice',
              sessionId,
              candidate: ev.candidate,
            }).catch(() => {});
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            handleAttemptDisconnect(new Error('WebRTC connection interrupted'), false);
          }
        };

        dc.onclose = () => {
          const incomplete = isStriped ? (lane.currentStripe < totalStripes) : (lane.receivedPos < lane.end);
          if (!finished && incomplete) {
            handleAttemptDisconnect(new Error('DataChannel closed before EOF'), false);
          }
        };

        dc.onerror = () => {
          if (!finished) {
            handleAttemptDisconnect(new Error('WebRTC DataChannel error'), false);
          }
        };

        dc.onmessage = (ev) => {
          if (cancelled) return;
          lastChunkAt = Date.now();
          if (typeof ev.data === 'string') {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            statsMon?.handleControlMessage(msg);
            if (msg.ping || msg.pong || msg.stats || msg.cancel) return;
            if (msg.eof && !finished) {
              finished = true;
              const finalizeLane = isStriped
                ? drainCompletedStripes()
                : flushLaneBatch(lane);
              finalizeLane
                .then(() => {
                  lane.done = true;
                  cleanupAttempt();
                  resolve();
                })
                .catch((err) => handleAttemptDisconnect(err, true));
            }
            return;
          }

          const rawChunk = new Uint8Array(ev.data);
          if (isStriped) {
            let readPos = 0;
            while (readPos < rawChunk.byteLength && lane.currentStripe < totalStripes) {
              if (!lane.stripeBuf) prepareStripe(lane);
              const space = lane.stripeLen - lane.stripePos;
              const toCopy = Math.min(space, rawChunk.byteLength - readPos);
              lane.stripeBuf.set(rawChunk.subarray(readPos, readPos + toCopy), lane.stripePos);
              lane.stripePos += toCopy;
              lane.receivedLaneBytes += toCopy;
              readPos += toCopy;
              if (lane.stripePos >= lane.stripeLen) {
                const finishedIdx = lane.currentStripe;
                lane.committedLaneBytes = lane.receivedLaneBytes;
                completedStripes.set(finishedIdx, {
                  data: lane.stripeBuf,
                  lane,
                  laneBytesAfter: lane.committedLaneBytes,
                });
                lane.stripeBuf = null;
                lane.currentStripe += laneCount;
                prepareStripe(lane);
                drainCompletedStripes();
              }
            }
          } else {
            const remainingInLane = Math.max(0, lane.end - lane.receivedPos);
            const byteLen = Math.min(rawChunk.byteLength || 0, remainingInLane);
            if (byteLen <= 0) return;
            lane.receivedPos += byteLen;

            let readPos = 0;
            while (readPos < byteLen) {
              const space = lane.batchSize - lane.batchLen;
              const toCopy = Math.min(space, byteLen - readPos);
              lane.batchBuf.set(rawChunk.subarray(readPos, readPos + toCopy), lane.batchLen);
              lane.batchLen += toCopy;
              readPos += toCopy;
              if (lane.batchLen >= lane.batchSize) {
                flushLaneBatch(lane);
              }
            }
          }

          updateAggregateUi(false);
        };

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (cancelled) {
            abortHandler();
            return;
          }
          await sendP2pSignal(transfer.fromId, transfer.id, {
            type: 'p2p-offer',
            sessionId,
            batchId,
            fileId: file.id,
            laneIndex: lane.index,
            laneCount,
            stripeBytes,
            startStripe: lane.currentStripe,
            laneStart: lane.laneStart,
            startOffset: lane.flushedPos,
            endOffset: lane.end,
            sdp: pc.localDescription,
          });
        } catch (err) {
          handleAttemptDisconnect(err, false);
        }
      });

    const MAX_ATTEMPTS = 6;
    const runLaneWithRetries = async (lane) => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (cancelled) throw { cancelled: true, fatal: true };
        try {
          await runLaneAttempt(lane, attempt);
          return;
        } catch (info) {
          if (cancelled || info?.cancelled || info?.fatal || attempt >= MAX_ATTEMPTS) {
            throw info?.err || info || new Error('P2P transfer failed after multiple resume attempts.');
          }
          await new Promise((r) => setTimeout(r, 1400));
        }
      }
    };

    try {
      await Promise.all(lanes.map((lane) => runLaneWithRetries(lane)));
      if (cancelled) throw { cancelled: true, fatal: true };
      if (isStriped) await drainCompletedStripes();
      await writeQueue;
      setDownloadCancelable(null);

      // Finalize disk sink
      if (sink.kind === 'picker' && sink.writable) {
        await sink.writable.close();
      } else if (sink.kind === 'opfs' && sink.writable) {
        await sink.writable.close();
        const diskFile = await sink.opfsHandle.getFile();
        const url = URL.createObjectURL(diskFile);
        p2pDownloadedBlobs.set(file.id, url);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name || 'file';
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Clean up temporary OPFS file after download begins
        setTimeout(() => {
          try { sink.rootDir.removeEntry(sink.tempName); } catch {}
        }, 60000);
      } else if (sink.memChunks) {
        const blob = new Blob(sink.memChunks, { type: file.type || 'application/octet-stream' });
        sink.memChunks = [];
        const url = URL.createObjectURL(blob);
        p2pDownloadedBlobs.set(file.id, url);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name || 'file';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      updateP2pDialogProgress(`finishing ${file.name}...`, 1, true);
      await waitForSakugaDone(progEl);
      updateP2pDialogProgress(`saved ${file.name} (${fmtBytes(file.size)}) via P2P ♡`, 1, true);
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.innerHTML = `${icon('i-check')}saved`;
      }
      toast(`saved ${file.name} via direct P2P ♡`, 'success');
      soundSparkle();
      return { cancelled: false };
    } catch (err) {
      if (sink.writable) {
        try { await sink.writable.abort(); } catch {}
      }
      if (sink.kind === 'opfs' && sink.rootDir && sink.tempName) {
        try { await sink.rootDir.removeEntry(sink.tempName); } catch {}
      }

      if (cancelled || err?.cancelled) {
        const sigPanel = $('#p2pDialogSignals', el.incomingBody);
        if (sigPanel) sigPanel.hidden = true;
        updateP2pDialogProgress(`download cancelled (${file.name})`, 0, true, { reset: true });
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.innerHTML = `${icon('i-download')}stream & save`;
        }
        toast(`download cancelled`, 'pink');
        soundDecline();
        return { cancelled: true };
      }

      const totalFlushed = totalWrittenBytes;
      updateP2pDialogProgress(`P2P interrupted at ${fmtBytes(totalFlushed)} — click retry to resume`, totalFlushed / totalBytes, true);
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.innerHTML = `${icon('i-download')}retry P2P`;
      }
      toast(err.message || 'P2P stream interrupted — make sure both tabs stay open!', 'error');
      return { cancelled: false };
    } finally {
      setDownloadCancelable(null);
      updateProfileP2pUi(null);
      releaseTransferWakeLock();
    }
  }

  /* ---------------- offers / dialog ---------------- */

  function enqueueOffer(transfer) {
    if (transfer.status !== 'pending' || transfer.toId !== state.me.id) return;
    if (state.queued.has(transfer.id)) return;
    state.queued.add(transfer.id);
    state.queue.push(transfer.id);
    maybeShowOffer();
  }

  function maybeShowOffer() {
    if (el.incomingDialog.open || state.activeOfferId) return;
    while (state.queue.length) {
      const id = state.queue.shift();
      const transfer = state.transfers.get(id);
      if (!transfer || transfer.status !== 'pending' || transfer.toId !== state.me.id) continue;
      openOffer(id);
      return;
    }
  }

  function openOffer(id) {
    const transfer = state.transfers.get(id);
    if (!transfer) return;
    state.activeOfferId = id;
    if (transfer.status === 'pending') renderOfferPending(transfer);
    else renderOfferResult(transfer);
    if (el.incomingBackdrop) el.incomingBackdrop.hidden = false;
    if (!el.incomingDialog.open) {
      try {
        if (typeof el.incomingDialog.show === 'function') el.incomingDialog.show();
        else el.incomingDialog.setAttribute('open', '');
      } catch { /* ancient browser */ }
    }
  }

  function clearDialogError() {
    $$('.dialog-error', el.incomingBody).forEach((node) => node.remove());
  }

  function showDialogError(message) {
    clearDialogError();
    const node = document.createElement('div');
    node.className = 'dialog-error';
    node.setAttribute('role', 'alert');
    node.textContent = message;
    el.incomingBody.prepend(node);
  }

  function senderBlock(transfer, incoming) {
    const peer = (incoming ? transfer.from : transfer.to) || { name: 'unknown device', type: 'unknown', avatar: 'mascot' };
    const info = typeInfo(peer.type);
    return `
      <div class="offer__who">
        <span class="avatar avatar--md"><img src="${esc(avatarSrc(peer.avatar))}" alt="" width="58" height="58"></span>
        <div class="offer__who-copy">
          <span class="field-label">${incoming ? 'incoming from' : 'sending to'}</span>
          <strong>${esc(peer.name)}</strong>
          <span class="offer__meta">${icon(info.icon)}${info.label} · ${timeAgo(transfer.createdAt)}</span>
        </div>
        <span class="offer__stamp" aria-hidden="true">♡</span>
      </div>`;
  }

  function noteBlock(transfer) {
    if (!transfer.message) return '';
    return `
      <div class="offer__note">
        ${icon('i-note')}
        <p>${esc(transfer.message)}</p>
      </div>`;
  }

  function thumbsBlock(transfer) {
    const images = (transfer.files || []).filter((f) => String(f.type || '').startsWith('image/')).slice(0, 6);
    if (!images.length) return '';
    return `
      <div class="offer__thumbs">
        ${images.map((f) => `<img src="${demoBlobs.get(f.id) || `${API_BASE}/api/file/${encodeURIComponent(f.id)}?inline=1`}" alt="" loading="lazy">`).join('')}
      </div>`;
  }

  function filesBlock(transfer) {
    const files = transfer.files || [];
    if (!files.length) return '';
    const total = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    return `
      <div class="offer__files">
        ${files.map((f) => `
          <div class="offer__file">
            <span class="file-icon" aria-hidden="true">${icon(fileIcon(f.type, f.name))}</span>
            <span class="offer__file-name" title="${esc(f.name)}">${esc(f.name)}</span>
            <span class="offer__file-size">${esc(fmtBytes(f.size))}</span>
          </div>`).join('')}
      </div>
      <p class="offer__total">${files.length} ${files.length === 1 ? 'file' : 'files'} · ${fmtBytes(total)}</p>`;
  }

  function renderOfferPending(transfer) {
    el.incomingBadge.textContent = 'ACTION NEEDED';
    el.incomingBody.innerHTML = `
      <div class="offer">
        ${senderBlock(transfer, true)}
        ${noteBlock(transfer)}
        ${filesBlock(transfer)}
        ${thumbsBlock(transfer)}
        <div class="dialog-actions">
          <button class="btn btn--ghost" type="button" data-offer-action="decline">decline</button>
          <button class="btn btn--primary" type="button" data-offer-action="accept">
            ${icon('i-heart')}accept${transfer.files?.length ? ' &amp; save' : ''}
          </button>
        </div>
      </div>`;
  }

  function renderOfferResult(transfer) {
    const incoming = transfer.toId === state.me.id;
    const accepted = transfer.status === 'accepted';
    const declined = transfer.status === 'declined';
    const expired = transfer.status === 'expired';

    if (transfer.status === 'pending') {
      renderOfferPending(transfer);
      return;
    }

    el.incomingBadge.textContent = accepted ? 'ACCEPTED ♡' : declined ? 'DECLINED' : 'EXPIRED';

    const banner = accepted
      ? `<div class="accepted-banner">
           <span class="accepted-banner__check" aria-hidden="true">${icon('i-check')}</span>
           <div>
             <strong>${incoming ? 'accepted! save your files' : 'delivered ♡'}</strong>
             <p>${incoming
               ? (transfer.files?.length ? 'your bytes made it. grab them below.' : 'the note made it. that counts as a transfer.')
               : `${esc(transfer.to?.name || 'they')} said yes. the files are theirs now.`}</p>
           </div>
         </div>`
      : declined
        ? `<div class="accepted-banner" style="background:linear-gradient(180deg,#ffd3e7,#ffb0d5)">
             <span class="accepted-banner__check" aria-hidden="true">${icon('i-close')}</span>
             <div><strong>declined</strong><p>no bytes were exchanged. nothing to do here.</p></div>
           </div>`
        : `<div class="accepted-banner" style="background:linear-gradient(180deg,#f0e4ff,#dcc4f7)">
             <span class="accepted-banner__check" aria-hidden="true">${icon('i-clock')}</span>
             <div><strong>expired</strong><p>this offer sat around for too long and cleaned itself up.</p></div>
           </div>`;

    const downloadRows = accepted && incoming && transfer.files?.length
      ? `<div class="download-list">
          ${transfer.files.map((f) => `
            <div class="download-row">
              <span class="file-icon" aria-hidden="true">${icon(fileIcon(f.type, f.name))}</span>
              <span class="download-row__name" title="${esc(f.name)}">${esc(f.name)}</span>
              <span class="download-row__size">${esc(fmtBytes(f.size))}${f.p2p ? ' · P2P' : ''}</span>
              <button class="mini-btn" type="button" data-download="${esc(f.id)}" data-name="${esc(f.name)}">${icon('i-download')}${f.p2p ? 'stream & save' : 'save'}</button>
            </div>`).join('')}
        </div>
        <div class="sakuga-dl-progress" id="p2pDialogProgress" hidden aria-live="polite">
          <sakuga-progress id="p2pSakugaProgress" label="Downloading file" done-label="Saved ✓"></sakuga-progress>
          <p class="sakuga-dl-progress__meta" id="p2pDialogLabel">preparing download...</p>
          <div class="p2p-dl-actions" id="p2pDialogActions" hidden>
            <button class="mini-btn mini-btn--pink" id="p2pCancelBtn" type="button" data-cancel-download>${icon('i-close')}cancel download</button>
          </div>
          <div class="p2p-signal-strip" id="p2pDialogSignals" hidden></div>
        </div>
        <p class="download-hint">${transfer.p2p ? 'direct WebRTC P2P stream — keep both tabs open until 100%.' : 'your browser may ask to allow multiple downloads if you hit save all.'}</p>`
      : '';

    const staticFiles = accepted && !incoming && transfer.files?.length
      ? `<div class="download-list">
          ${transfer.files.map((f) => `
            <div class="download-row">
              <span class="file-icon" aria-hidden="true">${icon(fileIcon(f.type, f.name))}</span>
              <span class="download-row__name">${esc(f.name)}</span>
              <span class="download-row__size">${esc(fmtBytes(f.size))}</span>
            </div>`).join('')}
        </div>`
      : '';

    const actions = accepted && incoming && transfer.files?.length
      ? `<button class="btn btn--ghost" type="button" data-offer-action="done">later</button>
         <button class="btn btn--primary" type="button" data-download-all>${icon('i-download')}save all</button>`
      : `<button class="btn btn--primary" type="button" data-offer-action="done">${icon('i-heart')}done</button>`;

    el.incomingBody.innerHTML = `
      <div class="offer">
        ${banner}
        ${senderBlock(transfer, incoming)}
        ${noteBlock(transfer)}
        ${downloadRows || staticFiles}
        ${thumbsBlock(transfer)}
        <div class="dialog-actions">${actions}</div>
      </div>`;

    if (accepted) {
      const focusTarget = el.incomingBody.querySelector('[data-download-all], [data-offer-action="done"]');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
  }

  async function respond(transferId, action) {
    const data = await api('/api/respond', { transferId, action });
    state.transfers.set(data.transfer.id, data.transfer);
    state.queue = state.queue.filter((id) => id !== data.transfer.id);
    renderLog();
    if (action === 'accept') soundAccept();
    else soundDecline();
    return data.transfer;
  }

  /* ---------------- download ---------------- */

  function triggerBlobDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadFile(file, transfer, buttonEl) {
    if (file.p2p && !demoMode && transfer) {
      return downloadP2pFile(transfer, file, buttonEl);
    }

    const progEl = $('#p2pSakugaProgress', el.incomingBody);
    const hasProgressUi = Boolean(progEl && el.incomingDialog.open);
    const downloadUrl = demoBlobs.get(file.id) || `${API_BASE}/api/file/${encodeURIComponent(file.id)}?download=1`;

    if (buttonEl) buttonEl.disabled = true;

    if (hasProgressUi && demoMode) {
      updateP2pDialogProgress(`downloading ${file.name} (${fmtBytes(file.size)})...`, 0, true, {
        reset: true,
        label: `Downloading ${file.name}`,
      });
      progEl.set(0.35);
      await new Promise((r) => setTimeout(r, 180));
      progEl.set(1);
      await waitForSakugaDone(progEl);
      triggerBlobDownload(downloadUrl, file.name);
      updateP2pDialogProgress(`saved ${file.name} (${fmtBytes(file.size)}) ♡`, 1, true);
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.innerHTML = `${icon('i-check')}saved`;
      }
      toast(`saved ${file.name} ♡`, 'success');
      soundSparkle();
      return { cancelled: false };
    }

    if (hasProgressUi && !demoMode && typeof window.fetch === 'function') {
      const abortController = new AbortController();
      setDownloadCancelable(() => abortController.abort());
      try {
        updateP2pDialogProgress(`downloading ${file.name} (${fmtBytes(file.size)})...`, 0, true, {
          reset: true,
          label: `Downloading ${file.name}`,
        });
        const response = await fetch(downloadUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const total = Number(response.headers.get('content-length')) || Number(file.size) || 0;
        const reader = response.body && response.body.getReader ? response.body.getReader() : null;
        if (reader) {
          const chunks = [];
          const speed = createSpeedTracker(0);
          let loaded = 0;
          let lastUi = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.byteLength || 0;
              const now = Date.now();
              if (now - lastUi >= 90) {
                lastUi = now;
                const frac = total > 0 ? Math.min(0.99, loaded / total) : 0.5;
                const { mbpsText, etaText } = speed.sample(loaded, total);
                const etaPart = total > 0 ? ` · ${mbpsText} MB/s · ${etaText}` : ` · ${mbpsText} MB/s`;
                updateP2pDialogProgress(`downloading ${file.name} · ${fmtBytes(loaded)}${total ? ` / ${fmtBytes(total)}` : ''}${etaPart}`, frac, true);
              }
            }
          }
          setDownloadCancelable(null);
          const blob = new Blob(chunks, { type: file.type || 'application/octet-stream' });
          const blobUrl = URL.createObjectURL(blob);
          p2pDownloadedBlobs.set(file.id, blobUrl);
          updateP2pDialogProgress(`finishing ${file.name}...`, 1, true);
          await waitForSakugaDone(progEl);
          triggerBlobDownload(blobUrl, file.name);
          updateP2pDialogProgress(`saved ${file.name} (${fmtBytes(file.size)}) ♡`, 1, true);
          if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.innerHTML = `${icon('i-check')}saved`;
          }
          toast(`saved ${file.name} ♡`, 'success');
          soundSparkle();
          return { cancelled: false };
        }
      } catch {
        if (abortController.signal.aborted) {
          updateP2pDialogProgress(`download cancelled (${file.name})`, 0, true, { reset: true });
          if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.innerHTML = `${icon('i-download')}save`;
          }
          toast('download cancelled', 'pink');
          soundDecline();
          return { cancelled: true };
        }
        // Fallback to standard browser download if streaming fetch fails
      } finally {
        setDownloadCancelable(null);
      }
    }

    triggerBlobDownload(downloadUrl, file.name);
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = `${icon('i-check')}saved`;
    }
    return { cancelled: false };
  }

  async function downloadAll(transfer) {
    const files = transfer.files || [];
    if (!files.length) return;
    if ((transfer.p2p && !demoMode) || el.incomingDialog.open) {
      for (const file of files) {
        const btn = el.incomingBody.querySelector(`[data-download="${CSS.escape(file.id)}"]`);
        try {
          const res = await downloadFile(file, transfer, btn);
          if (res?.cancelled) break;
        } catch {
          break;
        }
      }
      return;
    }
    files.forEach((file, index) => setTimeout(() => downloadFile(file, transfer), index * 420));
    toast(`saving ${files.length} ${files.length === 1 ? 'file' : 'files'} — check your downloads ♡`, 'success');
    soundSparkle();
  }

  /* ---------------- upload + send ---------------- */

  function api(path, body) {
    if (demoMode) {
      if (path === '/api/me') {
        state.me = { ...state.me, ...body };
        state.devices = [state.me, DEMO_PEER];
        renderDevices();
        return Promise.resolve({ ok: true, self: state.me });
      }
      if (path === '/api/offer') {
        const files = (body.fileIds || []).map((fid) => demoBlobs.get(`meta:${fid}`)).filter(Boolean);
        const transfer = {
          id: makeId(),
          fromId: state.me.id,
          toId: body.to,
          from: { ...state.me },
          to: { ...DEMO_PEER },
          files,
          message: body.message || '',
          status: 'pending',
          createdAt: Date.now(),
        };
        state.transfers.set(transfer.id, transfer);
        setTimeout(() => {
          transfer.status = 'accepted';
          state.transfers.set(transfer.id, transfer);
          renderLog();
          toast(`${DEMO_PEER.name} accepted ${files.length ? 'your files' : 'your note'} ♡`, 'success');
          soundAccept();
        }, 1200);
        return Promise.resolve({ ok: true, transfer });
      }
      if (path === '/api/respond') {
        const transfer = state.transfers.get(body.transferId);
        if (transfer) transfer.status = body.action === 'accept' ? 'accepted' : 'declined';
        return Promise.resolve({ ok: true, transfer });
      }
      return Promise.resolve({ ok: true });
    }
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': state.me.id,
      },
      body: JSON.stringify(body),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `request failed (${response.status})`);
      }
      return data;
    });
  }

  function uploadFile(file, toId, onProgress) {
    if (demoMode) {
      return new Promise((resolve) => {
        let pct = 0;
        const step = () => {
          pct = Math.min(100, pct + 35);
          if (onProgress) onProgress(pct);
          if (pct < 100) {
            setTimeout(step, 90);
          } else {
            const id = makeId();
            const meta = { id, name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
            try { demoBlobs.set(id, URL.createObjectURL(file)); } catch {}
            demoBlobs.set(`meta:${id}`, meta);
            resolve(meta);
          }
        };
        setTimeout(step, 70);
      });
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/upload?to=${encodeURIComponent(toId)}`);
      xhr.setRequestHeader('X-Device-Id', state.me.id);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.setRequestHeader('X-File-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* noop */ }
        if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.file) resolve(data.file);
        else reject(new Error(data.error || 'upload failed — is the server awake?'));
      };
      xhr.onerror = () => reject(new Error('network hiccup — is the server still running?'));
      xhr.ontimeout = () => reject(new Error('that upload timed out.'));
      xhr.send(file);
    });
  }

  function setProgress(label, pct) {
    el.sendProgress.hidden = false;
    el.progressLabel.textContent = label;
    el.progressPct.textContent = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
    el.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  async function sendFiles() {
    const target = getSelected();
    if (state.sending) return;
    if (!target) { toast('pick a device first ♡', 'info'); return; }
    if (!state.connected) { toast('still reconnecting — give it a second.', 'error'); return; }

    const note = el.noteInput.value.trim().slice(0, 2000);
    const entries = state.files.slice();
    if (!entries.length && !note) { toast('add a file or a note first ♡', 'info'); return; }

    state.sending = true;
    updateComposer();
    const totalBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0) || 1;
    let doneBytes = 0;
    const buttonRect = el.sendBtn.getBoundingClientRect();

    try {
      const useP2p = !demoMode && typeof window.RTCPeerConnection === 'function' && entries.length > 0;
      let data;

      if (useP2p) {
        const p2pMetas = entries.map((entry) => {
          const id = makeId();
          p2pOutgoingFiles.set(id, entry.file);
          return {
            id,
            name: entry.file.name,
            size: entry.file.size,
            type: entry.file.type || 'application/octet-stream',
            p2p: true,
          };
        });
        setProgress('sending direct P2P offer (0 bytes uploaded to cloud)...', 100);
        data = await api('/api/offer', {
          to: target.id,
          p2p: true,
          p2pFiles: p2pMetas,
          message: note,
        });
      } else {
        const metas = [];
        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i];
          setProgress(`file ${i + 1} of ${entries.length} · ${entry.file.name}`, Math.round((doneBytes / totalBytes) * 100));
          const meta = await uploadFile(entry.file, target.id, (pct) => {
            const overall = ((doneBytes + entry.file.size * (pct / 100)) / totalBytes) * 100;
            setProgress(`file ${i + 1} of ${entries.length} · ${entry.file.name}`, overall);
          });
          metas.push(meta);
          doneBytes += entry.file.size;
        }

        setProgress('sending the offer...', 100);
        data = await api('/api/offer', {
          to: target.id,
          fileIds: metas.map((meta) => meta.id),
          message: note,
        });
      }

      state.transfers.set(data.transfer.id, data.transfer);
      renderLog();
      state.files = [];
      el.noteInput.value = '';
      renderFiles();
      state.sending = false;
      updateComposer();

      setProgress('sent! waiting for them to accept...', 100);
      setTimeout(() => {
        if (!state.sending) el.sendProgress.hidden = true;
      }, 1400);

      toast(`offered to ${target.name} ♡`, 'success');
      soundSend();
      burstHearts(buttonRect.left + buttonRect.width / 2, buttonRect.top, 7);
      if (isMobileTray()) closeTray();
    } catch (error) {
      state.sending = false;
      updateComposer();
      el.sendProgress.hidden = true;
      toast(error.message || 'that did not work. try again?', 'error');
    }
  }

  function addFiles(fileListLike) {
    const incoming = Array.from(fileListLike || []);
    if (!incoming.length) return;

    const maxFiles = state.limits.maxFiles || 50;
    const maxBytes = state.limits.maxFileBytes || 25 * 1024 * 1024 * 1024;
    let added = 0;
    let tooBig = 0;
    let empty = 0;
    let overflow = 0;
    let duplicates = 0;

    for (const file of incoming) {
      if (state.files.length >= maxFiles) { overflow += 1; continue; }
      if (file.size === 0) { empty += 1; continue; }
      if (file.size > maxBytes) { tooBig += 1; continue; }
      const duplicate = state.files.some((entry) =>
        entry.file.name === file.name &&
        entry.file.size === file.size &&
        entry.file.lastModified === file.lastModified
      );
      if (duplicate) { duplicates += 1; continue; }
      state.files.push({ key: makeId(), file });
      added += 1;
    }

    if (added) {
      soundPop();
      renderFiles();
    }
    if (tooBig) toast(`${tooBig} file${tooBig === 1 ? ' is' : 's are'} over the 25 GB P2P limit.`, 'error');
    if (overflow) toast(`up to ${maxFiles} files per send — extras were skipped.`, 'info');
    if (empty) toast('empty files are not very useful, bestie.', 'info');
    if (!added && !tooBig && !overflow && !empty) {
      if (duplicates) toast('those are already in the pile ♡', 'info');
      return;
    }
    if (added) updateComposer();
  }

  /* ---------------- share + QR ---------------- */

  async function copyShareLink() {
    const url = currentShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      soundPop();
      toast('link copied ♡ open it on another device', 'success');
    } catch {
      const area = document.createElement('textarea');
      area.value = url;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        toast('link copied ♡', 'success');
        soundPop();
      } catch {
        toast(`copy this: ${url}`, 'info', 8000);
      } finally {
        area.remove();
      }
    }
  }

  function openQr() {
    const url = currentShareUrl();
    try {
      if (typeof window.qrcode !== 'function') throw new Error('qr library missing');
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      el.qrImage.src = qr.createDataURL(6, 8);
      el.qrUrl.textContent = url;
      soundTap();
      if (!el.qrDialog.open) el.qrDialog.showModal();
    } catch {
      toast('could not draw the QR. copy the link instead ♡', 'error');
    }
  }

  /* ---------------- tray ---------------- */

  function openTray() {
    if (!isMobileTray()) return;
    state.__lastFocus = document.activeElement;
    el.body.classList.add('tray-open');
    el.trayOverlay.hidden = false;
    setTimeout(() => el.trayClose.focus({ preventScroll: true }), 30);
  }

  function closeTray() {
    el.body.classList.remove('tray-open');
    el.trayOverlay.hidden = true;
    if (state.__lastFocus && document.contains(state.__lastFocus)) {
      state.__lastFocus.focus({ preventScroll: true });
    }
  }

  /* ---------------- profile ---------------- */

  function setTypeUi() {
    const info = typeInfo(state.me.type);
    el.myType.textContent = info.label;
    if (el.myTypeIcon) el.myTypeIcon.setAttribute('href', `#${info.icon}`);
  }

  function saveName() {
    const clean = el.deviceName.value.replace(/\s+/g, ' ').trim().slice(0, 32);
    if (!clean) {
      el.deviceName.value = state.me.name;
      return;
    }
    el.deviceName.value = clean;
    if (clean === state.me.name) return;
    state.me.name = clean;
    store.set('kurizu-send-name', clean);
    soundTap();
    if (!state.connected) return;
    api('/api/profile', { name: clean })
      .then((data) => {
        if (data.self) state.me = { ...state.me, ...data.self };
      })
      .catch(() => { /* the name will be sent again on reconnect */ });
  }

  function joinRoomCode(rawCode) {
    const clean = String(rawCode ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
    state.room = clean;
    store.set('kurizu-send-room', clean);
    if (el.roomCodeInput) el.roomCodeInput.value = clean;
    setShareUrl();
    updateRoomBadgeUi();
    soundPop();

    if (demoMode) {
      toast(clean ? `joined cross-Wi-Fi room "${clean}" ♡` : 'switched to same Wi-Fi auto-discovery ♡', 'success');
      return;
    }

    if (state.connected) {
      api('/api/profile', { room: clean })
        .then((data) => {
          if (Array.isArray(data.devices)) {
            state.devices = data.devices;
            renderDevices();
          }
          toast(
            clean
              ? `joined room "${clean}" — anyone on any Wi-Fi with this code will appear here!`
              : 'switched to same Wi-Fi auto-discovery ♡',
            'success'
          );
        })
        .catch(() => connectEvents());
    } else {
      connectEvents();
    }
  }

  function generateRoomCode() {
    const code = `kuri-${Math.floor(1000 + Math.random() * 9000)}`;
    joinRoomCode(code);
  }

  function cycleAvatar() {
    const index = state.avatars.indexOf(state.me.avatar);
    state.me.avatar = state.avatars[(index + 1) % state.avatars.length] || state.avatars[0];
    el.myAvatar.src = avatarSrc(state.me.avatar);
    store.set('kurizu-send-avatar', state.me.avatar);
    soundSparkle();
    const rect = el.avatarBtn.getBoundingClientRect();
    burstHearts(rect.left + rect.width / 2, rect.top + rect.height / 2, 4);
    if (!state.connected) return;
    api('/api/profile', { avatar: state.me.avatar }).catch(() => {});
  }

  /* ---------------- binds ---------------- */

  function bindEvents() {
    el.soundToggle.addEventListener('click', () => {
      state.sound = !state.sound;
      local.set('kurizu-send-sound', state.sound ? '1' : '0');
      syncSoundButton();
      if (state.sound) { ensureAudio(); soundSparkle(); }
    });

    el.avatarBtn.addEventListener('click', cycleAvatar);
    el.deviceName.addEventListener('change', saveName);
    el.deviceName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        el.deviceName.blur();
      }
    });

    el.roomJoinBtn?.addEventListener('click', () => {
      joinRoomCode(el.roomCodeInput ? el.roomCodeInput.value : '');
    });
    el.roomGenBtn?.addEventListener('click', generateRoomCode);
    el.roomCodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        joinRoomCode(el.roomCodeInput.value);
        el.roomCodeInput.blur();
      }
    });

    el.copyLink.addEventListener('click', copyShareLink);
    el.copyLink2.addEventListener('click', copyShareLink);
    el.showQr.addEventListener('click', openQr);
    el.qrClose.addEventListener('click', () => el.qrDialog.close());
    el.qrDone.addEventListener('click', () => el.qrDialog.close());

    [el.qrDialog, el.incomingDialog].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    el.incomingBackdrop?.addEventListener('click', () => {
      if (el.incomingDialog.open) el.incomingDialog.close();
    });

    el.deviceGrid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-device-id]');
      if (card) {
        selectDevice(card.dataset.deviceId);
        return;
      }
      const emptyAction = event.target.closest('[data-empty-action]');
      if (emptyAction) {
        if (emptyAction.dataset.emptyAction === 'copy') copyShareLink();
        else openQr();
      }
    });

    el.trayClose.addEventListener('click', closeTray);
    el.trayOverlay.addEventListener('click', closeTray);

    el.dropzone.addEventListener('click', () => el.fileInput.click());
    el.dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.fileInput.click();
      }
    });
    el.fileInput.addEventListener('change', () => {
      addFiles(el.fileInput.files);
      el.fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach((name) => {
      el.dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        event.stopPropagation();
        el.dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'dragend'].forEach((name) => {
      el.dropzone.addEventListener(name, () => el.dropzone.classList.remove('is-dragover'));
    });
    el.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      el.dropzone.classList.remove('is-dragover');
      addFiles(event.dataTransfer?.files);
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => {
      if (!el.dropzone.contains(event.target)) event.preventDefault();
    });

    el.fileList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-file]');
      if (!button) return;
      state.files = state.files.filter((entry) => entry.key !== button.dataset.removeFile);
      soundTap();
      renderFiles();
    });

    el.noteInput.addEventListener('input', updateComposer);
    el.sendBtn.addEventListener('click', sendFiles);

    el.transferLog.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-log-action]');
      if (!button) return;
      const transfer = state.transfers.get(button.dataset.id);
      if (!transfer) return;
      const action = button.dataset.logAction;

      if (action === 'view') {
        openOffer(transfer.id);
        return;
      }
      if (action === 'download-all') {
        downloadAll(transfer);
        button.disabled = true;
        return;
      }
      if (action === 'accept' || action === 'decline') {
        button.disabled = true;
        try {
          const updated = await respond(transfer.id, action);
          if (action === 'accept') {
            toast('accepted ♡ save your files from the log.', 'success');
            openOffer(updated.id);
          } else {
            toast('declined. no hard feelings.', 'pink');
          }
        } catch (error) {
          button.disabled = false;
          toast(error.message || 'could not answer that offer.', 'error');
        }
      }
    });

    el.clearLog.addEventListener('click', () => {
      const finished = [...state.transfers.values()].filter((transfer) => transfer.status !== 'pending');
      if (!finished.length) {
        toast('nothing finished to clear yet ♡', 'info');
        return;
      }
      finished.forEach((transfer) => state.hidden.add(transfer.id));
      soundTap();
      renderLog();
    });

    el.incomingBody.addEventListener('click', async (event) => {
      const cancelBtn = event.target.closest('[data-cancel-download]');
      if (cancelBtn) {
        cancelBtn.disabled = true;
        if (typeof activeDownloadCancel === 'function') activeDownloadCancel();
        return;
      }

      const actionButton = event.target.closest('[data-offer-action]');
      if (actionButton) {
        const transfer = state.transfers.get(state.activeOfferId);
        if (!transfer) return;
        const action = actionButton.dataset.offerAction;

        if (action === 'done') {
          el.incomingDialog.close();
          return;
        }

        actionButton.disabled = true;
        clearDialogError();
        try {
          const updated = await respond(transfer.id, action);
          renderOfferResult(updated);
        } catch (error) {
          actionButton.disabled = false;
          showDialogError(error.message || 'could not answer that offer. try again?');
        }
        return;
      }

      const allButton = event.target.closest('[data-download-all]');
      if (allButton) {
        const transfer = state.transfers.get(state.activeOfferId);
        if (transfer) {
          allButton.disabled = true;
          try {
            await downloadAll(transfer);
          } finally {
            allButton.disabled = false;
          }
        }
        return;
      }

      const oneButton = event.target.closest('[data-download]');
      if (oneButton) {
        const transfer = state.transfers.get(state.activeOfferId);
        const file = transfer?.files?.find((f) => f.id === oneButton.dataset.download);
        if (file) {
          downloadFile(file, transfer, oneButton);
        }
      }
    });

    el.incomingDialog.addEventListener('close', () => {
      if (el.incomingBackdrop) el.incomingBackdrop.hidden = true;
      state.activeOfferId = null;
      setTimeout(maybeShowOffer, 240);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && el.incomingDialog.open) {
        event.preventDefault();
        el.incomingDialog.close();
        return;
      }
      if (event.key === 'Escape' && el.body.classList.contains('tray-open') && !el.incomingDialog.open) {
        closeTray();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // browser search, but let's not hijack it. this comment is a tiny rebellion.
      }
    });

    window.addEventListener('resize', () => {
      if (!isMobileTray()) {
        el.body.classList.remove('tray-open');
        el.trayOverlay.hidden = true;
      }
      updateComposer();
    });

    window.addEventListener('beforeunload', (event) => {
      if (state.sending || activeDownloadCancel || p2pSenderGroups.size > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    el.niceBtn.addEventListener('click', () => {
      state.nice += 1;
      el.niceCount.textContent = String(state.nice);
      local.set('kurizu-send-nice', String(state.nice));
      const rect = el.niceBtn.getBoundingClientRect();
      burstHearts(rect.left + rect.width / 2, rect.top, 8);
      soundSparkle();
    });

    document.addEventListener('pointerdown', () => { if (state.sound) ensureAudio(); }, { once: true });
    document.addEventListener('keydown', () => { if (state.sound) ensureAudio(); }, { once: true });
  }

  /* ---------------- reveal + clock ---------------- */

  function setupReveal() {
    if (!('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js-reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    $$('[data-reveal]').forEach((node) => observer.observe(node));
  }

  function startClock() {
    const tick = () => {
      el.statusClock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 20000);
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (isWindowedApp()) {
      document.documentElement.classList.add('is-windowed');
      document.body.classList.add('is-windowed');
    }
    el.deviceName.value = state.me.name;
    el.myAvatar.src = avatarSrc(state.me.avatar);
    el.myAvatar.alt = `${state.me.name} avatar`;
    setTypeUi();
    syncSoundButton();
    el.niceCount.textContent = String(state.nice);
    el.windowBadge.textContent = `LAN ONLY · PORT ${location.port || 53317}`;

    if (isLocalHost()) el.shareUrl.textContent = 'connecting to the wi-fi...';
    else setShareUrl();

    bindEvents();
    renderDevices();
    renderLog();
    renderFiles();
    renderTray();
    setConnected(false);
    connectEvents();
    setupReveal();
    startClock();
  }

  init();
})();
