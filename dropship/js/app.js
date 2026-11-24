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
  const P2P_CHUNK_BYTES = 64 * 1024; // 64 KB chunks over RTCDataChannel
  const P2P_MAX_BUFFERED = 2 * 1024 * 1024; // 2 MB high-water mark
  const P2P_LOW_WATER = 512 * 1024; // 512 KB low-water resume threshold
  const p2pOutgoingFiles = new Map(); // fileId -> File object on sender PC
  const p2pDownloadedBlobs = new Map(); // fileId -> objectURL if buffered in RAM
  const p2pSessions = new Map(); // sessionId -> { pc, iceQueue, remoteDescSet }

  /* ---------------- elements ---------------- */

  const el = {
    body: document.body,
    myAvatar: $('#myAvatar'),
    avatarBtn: $('#avatarBtn'),
    deviceName: $('#deviceName'),
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
    statusDevices: $('#statusDevices'),
    statusDot: $('#statusDot'),
    statusClock: $('#statusClock'),
    windowBadge: $('#windowBadge'),
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
        state.transfers.clear();
        state.queue = [];
        state.queued.clear();
        state.hidden.clear();
        if (state.activeOfferId) {
          state.activeOfferId = null;
          if (el.incomingDialog.open) el.incomingDialog.close();
        }
        toast('the little server restarted — history cleared ♡', 'info');
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

      if (state.activeOfferId && el.incomingDialog.open) {
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
      if (el.incomingDialog.open && state.activeOfferId === transfer.id) {
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

  /* ---------------- WebRTC P2P Direct Streaming (up to 25 GB+) ---------------- */

  function updateP2pDialogProgress(text, pct, visible = true) {
    const wrap = $('#p2pDialogProgress', el.incomingBody);
    const labelEl = $('#p2pDialogLabel', el.incomingBody);
    const pctEl = $('#p2pDialogPct', el.incomingBody);
    const barEl = $('#p2pDialogBar', el.incomingBody);
    if (!wrap) return;
    wrap.hidden = !visible;
    if (labelEl) labelEl.textContent = text;
    const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
    if (pctEl) pctEl.textContent = `${clamped}%`;
    if (barEl) barEl.style.width = `${clamped}%`;
  }

  async function sendP2pSignal(to, transferId, signal) {
    return api('/api/signal', { to, transferId, signal });
  }

  async function handleIncomingP2pSignal(payload) {
    const fromId = payload?.from;
    const transferId = payload?.transferId;
    const sig = payload?.signal;
    if (!fromId || !sig || !sig.sessionId) return;

    // 1. Sender receives a P2P request offer from Receiver to stream a specific file
    if (sig.type === 'p2p-offer') {
      const file = p2pOutgoingFiles.get(sig.fileId);
      if (!file) {
        sendP2pSignal(fromId, transferId, {
          type: 'p2p-error',
          sessionId: sig.sessionId,
          error: 'Sender no longer has this file in memory (tab was refreshed).',
        }).catch(() => {});
        return;
      }

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
        dc.bufferedAmountLowThreshold = P2P_LOW_WATER;
        dc.onopen = () => {
          streamFileOverDataChannel(file, dc, sig.sessionId, payload?.fromDevice?.name || 'peer');
        };
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        sess.remoteDescSet = true;
        for (const c of sess.iceQueue) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        sess.iceQueue = [];
        const answer = await pc.createLocalDescription ? await pc.createAnswer() : await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendP2pSignal(fromId, transferId, {
          type: 'p2p-answer',
          sessionId: sig.sessionId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        pc.close();
        p2pSessions.delete(sig.sessionId);
      }
      return;
    }

    // 2. Receiver receives SDP answer from Sender
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
      if (sess.onError) sess.onError(new Error(sig.error || 'P2P stream failed'));
    }
  }

  async function streamFileOverDataChannel(file, dc, sessionId, peerName) {
    const total = file.size || 1;
    let offset = 0;
    const t0 = Date.now();
    toast(`streaming ${file.name} (${fmtBytes(total)}) directly to ${peerName} via P2P ⚡`, 'info');

    const waitForBufferDrain = () =>
      new Promise((resolve, reject) => {
        if (dc.readyState !== 'open') { reject(new Error('DataChannel closed')); return; }
        if (dc.bufferedAmount <= P2P_LOW_WATER) { resolve(); return; }
        const onLow = () => {
          dc.removeEventListener('bufferedamountlow', onLow);
          dc.removeEventListener('close', onClose);
          resolve();
        };
        const onClose = () => {
          dc.removeEventListener('bufferedamountlow', onLow);
          dc.removeEventListener('close', onClose);
          reject(new Error('DataChannel closed mid-transfer'));
        };
        dc.addEventListener('bufferedamountlow', onLow);
        dc.addEventListener('close', onClose);
      });

    try {
      while (offset < total) {
        if (dc.readyState !== 'open') throw new Error('Peer closed connection');
        if (dc.bufferedAmount > P2P_MAX_BUFFERED) {
          await waitForBufferDrain();
        }
        const slice = file.slice(offset, offset + P2P_CHUNK_BYTES);
        const buf = await slice.arrayBuffer();
        dc.send(buf);
        offset += buf.byteLength;

        const pct = Math.min(100, (offset / total) * 100);
        const elapsedSec = Math.max(0.2, (Date.now() - t0) / 1000);
        const speedMbps = (offset / (1024 * 1024) / elapsedSec).toFixed(1);
        setProgress(`P2P stream · ${file.name} (${speedMbps} MB/s)`, pct);
      }

      dc.send(JSON.stringify({ eof: true, size: total, name: file.name }));
      setProgress(`P2P delivered · ${file.name} ♡`, 100);
      toast(`finished streaming ${file.name} via P2P ♡`, 'success');
      soundSparkle();
      setTimeout(() => {
        if (!state.sending) el.sendProgress.hidden = true;
      }, 2200);
    } catch (err) {
      el.sendProgress.hidden = true;
      toast(`P2P stream interrupted: ${err.message || 'connection closed'}`, 'error');
    }
  }

  async function downloadP2pFile(transfer, file, buttonEl) {
    if (p2pDownloadedBlobs.has(file.id)) {
      const link = document.createElement('a');
      link.href = p2pDownloadedBlobs.get(file.id);
      link.download = file.name || 'file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    // For direct-to-disk streaming (essential for multi-GB / 25 GB files without RAM limits),
    // try opening a native FileSystemWritableFileStream right inside the user click gesture!
    let diskWritable = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: file.name || 'download',
        });
        diskWritable = await handle.createWritable();
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user cancelled save picker
        diskWritable = null; // fallback to in-memory Blob download (e.g. inside cross-origin iframe)
      }
    }

    const sessionId = makeId();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel('kurizu-p2p', { ordered: true });
    dc.binaryType = 'arraybuffer';

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.innerHTML = `${icon('i-bolt')}connecting P2P...`;
    }
    updateP2pDialogProgress(`connecting direct P2P tunnel to ${transfer.from?.name || 'sender'}...`, 0, true);

    return new Promise(async (resolve, reject) => {
      let receivedBytes = 0;
      const totalBytes = Math.max(1, Number(file.size) || 1);
      const memChunks = [];
      let writeChain = Promise.resolve();
      let finished = false;
      const t0 = Date.now();

      const cleanup = () => {
        p2pSessions.delete(sessionId);
        try { dc.close(); } catch {}
        try { pc.close(); } catch {}
      };

      const failStream = async (err) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (diskWritable) {
          try { await diskWritable.abort(); } catch {}
        }
        updateP2pDialogProgress(`P2P failed: ${err.message || 'could not connect'}`, 0, false);
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.innerHTML = `${icon('i-download')}retry P2P`;
        }
        toast(err.message || 'P2P connection timed out — make sure sender tab is still open!', 'error');
        reject(err);
      };

      const timeoutId = setTimeout(() => {
        if (receivedBytes === 0 && !finished) {
          failStream(new Error('P2P handshake timed out — sender tab must stay open.'));
        }
      }, 15000);

      p2pSessions.set(sessionId, {
        pc,
        iceQueue: [],
        remoteDescSet: false,
        onError: failStream,
      });

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendP2pSignal(transfer.fromId, transfer.id, {
            type: 'p2p-ice',
            sessionId,
            candidate: ev.candidate,
          }).catch(() => {});
        }
      };

      dc.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }
          if (msg.eof && !finished) {
            finished = true;
            clearTimeout(timeoutId);
            writeChain
              .then(async () => {
                if (diskWritable) {
                  await diskWritable.close();
                } else {
                  const blob = new Blob(memChunks, { type: file.type || 'application/octet-stream' });
                  const url = URL.createObjectURL(blob);
                  p2pDownloadedBlobs.set(file.id, url);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = file.name || 'file';
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }
                cleanup();
                updateP2pDialogProgress(`saved ${file.name} (${fmtBytes(file.size)}) via P2P ♡`, 100, true);
                if (buttonEl) {
                  buttonEl.disabled = false;
                  buttonEl.innerHTML = `${icon('i-check')}saved`;
                }
                toast(`saved ${file.name} via direct P2P ♡`, 'success');
                soundSparkle();
                resolve();
              })
              .catch(failStream);
          }
          return;
        }

        const chunk = ev.data;
        const byteLen = chunk.byteLength || 0;
        receivedBytes += byteLen;

        if (diskWritable) {
          writeChain = writeChain.then(() => diskWritable.write(chunk));
        } else {
          memChunks.push(new Uint8Array(chunk));
        }

        const pct = Math.min(100, (receivedBytes / totalBytes) * 100);
        const elapsed = Math.max(0.2, (Date.now() - t0) / 1000);
        const speedMbps = (receivedBytes / (1024 * 1024) / elapsed).toFixed(1);
        updateP2pDialogProgress(
          `streaming P2P · ${fmtBytes(receivedBytes)} / ${fmtBytes(totalBytes)} (${speedMbps} MB/s)`,
          pct,
          true
        );
        if (buttonEl) {
          buttonEl.innerHTML = `${icon('i-bolt')}${Math.round(pct)}%`;
        }
      };

      dc.onerror = () => failStream(new Error('WebRTC data channel error'));

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendP2pSignal(transfer.fromId, transfer.id, {
          type: 'p2p-offer',
          sessionId,
          fileId: file.id,
          sdp: pc.localDescription,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        failStream(err);
      }
    });
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
    if (!el.incomingDialog.open) {
      try { el.incomingDialog.showModal(); } catch { /* ancient browser */ }
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
        <div class="progress" id="p2pDialogProgress" hidden aria-live="polite" style="margin-top:10px">
          <div class="progress__label"><span id="p2pDialogLabel">streaming P2P...</span><b id="p2pDialogPct">0%</b></div>
          <div class="progress__track"><span id="p2pDialogBar"></span></div>
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

  async function downloadFile(file, transfer, buttonEl) {
    if (file.p2p && !demoMode && transfer) {
      await downloadP2pFile(transfer, file, buttonEl);
      return;
    }
    const link = document.createElement('a');
    link.href = demoBlobs.get(file.id) || `${API_BASE}/api/file/${encodeURIComponent(file.id)}?download=1`;
    link.download = file.name || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadAll(transfer) {
    const files = transfer.files || [];
    if (!files.length) return;
    if (transfer.p2p && !demoMode) {
      for (const file of files) {
        const btn = el.incomingBody.querySelector(`[data-download="${CSS.escape(file.id)}"]`);
        try {
          await downloadP2pFile(transfer, file, btn);
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
          downloadAll(transfer);
          allButton.disabled = true;
        }
        return;
      }

      const oneButton = event.target.closest('[data-download]');
      if (oneButton) {
        const transfer = state.transfers.get(state.activeOfferId);
        const file = transfer?.files?.find((f) => f.id === oneButton.dataset.download);
        if (file) {
          if (file.p2p && !demoMode) {
            downloadFile(file, transfer, oneButton);
          } else {
            downloadFile(file, transfer, oneButton);
            oneButton.disabled = true;
            oneButton.innerHTML = `${icon('i-check')}saved`;
          }
        }
      }
    });

    el.incomingDialog.addEventListener('close', () => {
      state.activeOfferId = null;
      setTimeout(maybeShowOffer, 240);
    });

    document.addEventListener('keydown', (event) => {
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
      if (state.sending) {
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
