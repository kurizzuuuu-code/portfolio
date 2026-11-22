/*
  DO NOT STOP — Phase 4 multiplayer server.
  No dependencies: just   node server.js
  It serves the game files (index.html, three.min.js, ...) AND the WebSocket rooms on the same port,
  so one deploy (Render, Railway, Fly, a VPS, your own PC...) is enough.

  Roles
    - every client sends its own position ("p") ~15x/s; the server relays it to the rest of the room
    - the room HOST (first player in, passes on if they leave) runs the creature's AI and sends it ("c")
    - the host tells the server who got caught ("caught"); the first player to finish opening the door wins ("win")
*/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".woff2": "font/woff2", ".webp": "image/webp"
};

/* ------------------------------ static files ------------------------------ */
const server = http.createServer((req, res) => {
  let url = "/";
  try { url = decodeURIComponent((req.url || "/").split("?")[0]); } catch (e) { res.writeHead(400); res.end(); return; }
  if (url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
  if (url === "/") url = "/index.html";
  const file = path.join(ROOT, path.normalize(url));
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  if (!file.startsWith(ROOT + path.sep) || base.startsWith(".") || base === "server.js" || base === "package.json" || !MIME[ext]) {
    res.writeHead(404); res.end("Not found"); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "no-cache" });
    res.end(data);
  });
});

/* ------------------------------ tiny WebSocket (RFC 6455) ------------------------------ */
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(payload, op) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const n = data.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, data]);
}
function sendRaw(c, buf) { if (c.socket && !c.socket.destroyed && c.socket.writable) { try { c.socket.write(buf); } catch (e) {} } }
function send(c, obj) { sendRaw(c, frame(JSON.stringify(obj), 1)); }

function readFrames(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 32768) { c.socket.destroy(); return; }
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return;
    let payload = Buffer.from(b.slice(off + maskLen, off + maskLen + len));
    if (masked) { const m = b.slice(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
    c.buf = b.slice(off + maskLen + len);
    if (op === 8) { sendRaw(c, frame(Buffer.alloc(0), 8)); c.socket.end(); return; }
    if (op === 9) { sendRaw(c, frame(payload, 10)); continue; }
    if (op === 10) { c.lastPong = Date.now(); continue; }
    if (op === 1 || op === 0) {
      c.frag = c.frag ? Buffer.concat([c.frag, payload]) : payload;
      if (c.frag.length > 32768) { c.socket.destroy(); return; }
      if (fin) { const text = c.frag.toString("utf8"); c.frag = null; onMessage(c, text); }
    }
  }
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  socket.setNoDelay(true);
  const c = { socket, buf: Buffer.alloc(0), frag: null, room: null, id: null, name: "", color: 0, tokens: 60, lastPong: Date.now() };
  socket.on("data", d => { c.buf = Buffer.concat([c.buf, d]); readFrames(c); });
  socket.on("close", () => leave(c));
  socket.on("error", () => { try { socket.destroy(); } catch (e) {} });
});

/* ------------------------------ rooms ------------------------------ */
const rooms = new Map();
let nextId = 1;

function cleanName(s) { return String(s || "").replace(/[^\w \-]/g, "").trim().slice(0, 12) || "RUNNER"; }
function cleanRoom(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
function randomCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) { let s = ""; for (let i = 0; i < 4; i++) s += L[(Math.random() * L.length) | 0]; if (!rooms.has(s)) return s; }
}
function roster(room) {
  return { players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })), hostId: room.hostId };
}
function broadcast(room, obj, exceptId) {
  const buf = frame(JSON.stringify(obj), 1);
  for (const p of room.players.values()) if (p.id !== exceptId) sendRaw(p, buf);
}
function roundInfo(room) { return { door: room.door, cr: room.cr, order: room.order, seed: room.seed }; }

function checkAllDead(room) {
  if (room.phase !== "playing" || room.players.size === 0) return;
  for (const p of room.players.values()) {
    if (!p.dead) return;
  }
  room.phase = "lobby";
  setTimeout(() => {
    if (rooms.get(room.code) === room && room.phase === "lobby") {
      broadcast(room, { t: "all_dead" });
    }
  }, 2200);
}

function join(c, msg) {
  if (c.room) return;
  let code = cleanRoom(msg.room) || randomCode();
  let room = rooms.get(code);
  if (!room) { room = { code, players: new Map(), hostId: null, phase: "lobby", door: null, cr: null, order: [], seed: 0 }; rooms.set(code, room); }
  if (room.players.size >= MAX_PLAYERS) { send(c, { t: "err", msg: "Room is full (" + MAX_PLAYERS + " max)." }); return; }
  c.id = nextId++;
  c.name = cleanName(msg.name);
  c.dead = false;
  const used = new Set([...room.players.values()].map(p => p.color));
  c.color = 0; while (used.has(c.color)) c.color++;
  c.room = room;
  room.players.set(c.id, c);
  if (room.hostId === null) room.hostId = c.id;
  send(c, Object.assign({ t: "welcome", id: c.id, room: code, phase: room.phase }, roster(room), room.phase === "playing" ? roundInfo(room) : {}));
  if (room.phase === "playing") room.order.push(c.id);
  broadcast(room, Object.assign({ t: "roster" }, roster(room)), c.id);
}

function leave(c) {
  const room = c.room;
  if (!room) return;
  c.room = null;
  room.players.delete(c.id);
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (room.hostId === c.id) room.hostId = room.players.keys().next().value;
  broadcast(room, Object.assign({ t: "roster", left: c.id }, roster(room)));
  if (room.phase === "playing") checkAllDead(room);
}

function startRound(room) {
  const ang = Math.random() * Math.PI * 2, dist = 56 + Math.random() * 10;
  let ca = Math.random() * Math.PI * 2, cd = 65 + Math.random() * 11;
  const clamp = v => Math.max(-68, Math.min(68, v));
  let cx = clamp(Math.cos(ca) * cd), cz = clamp(Math.sin(ca) * cd);
  if (Math.hypot(cx, cz - 8) < 58) { cx = clamp(-cx); cz = clamp(-cz); }
  room.phase = "playing";
  room.door = { a: ang, d: dist };
  room.cr = { x: cx, z: cz };
  room.order = [...room.players.keys()];
  room.seed = (Math.random() * 2 ** 31) | 0;
  for (const p of room.players.values()) p.dead = false;
  broadcast(room, Object.assign({ t: "start" }, roundInfo(room)));
}

function onMessage(c, text) {
  // simple flood guard: ~60 messages per second per client
  const now = Date.now();
  c.tokens = Math.min(60, c.tokens + (now - (c.lastMsg || now)) * 0.06);
  c.lastMsg = now;
  if (--c.tokens < 0) return;
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m.t !== "string") return;
  if (m.t === "join") { join(c, m); return; }
  const room = c.room;
  if (!room) return;
  const isHost = room.hostId === c.id;
  switch (m.t) {
    case "ping": send(c, { t: "pong" }); break;
    case "start": if (isHost && room.phase === "lobby") startRound(room); break;
    case "p": m.id = c.id; broadcast(room, m, c.id); break;                       // player state
    case "c": if (isHost) broadcast(room, m, c.id); break;                         // creature state (host only)
    case "caught":
      if (isHost && room.phase === "playing") {
        const tgt = room.players.get(m.id);
        if (tgt) tgt.dead = true;
        broadcast(room, { t: "caught", id: m.id });
        checkAllDead(room);
      }
      break;
    case "open": if (room.phase === "playing") broadcast(room, { t: "open", id: c.id }); break;
    case "win":
      if (room.phase === "playing") {
        room.phase = "lobby";
        broadcast(room, { t: "win", id: c.id, name: c.name });
      }
      break;
  }
}

setInterval(() => {      // keep idle connections (and free hosts) awake
  const ping = frame(Buffer.alloc(0), 9);
  for (const room of rooms.values()) for (const p of room.players.values()) sendRaw(p, ping);
}, 25000);

server.listen(PORT, () => console.log("DO NOT STOP multiplayer server on http://localhost:" + PORT));
