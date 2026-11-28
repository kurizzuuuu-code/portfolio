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
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".woff2": "font/woff2", ".webp": "image/webp"
};

/* ------------------------------ operator auth (Kurizu-only moderation) ------------------------------ */
const ADMIN_PASSWORD_HASH =
  process.env.KURIZU_ADMIN_PASSWORD_HASH ||
  "pbkdf2_sha256$310000$55a8f83169ae893b5dad6f03fa246b58$7cbc55208c357e1fdf0d17e5684115aefae903d5f683fdded84ff02fa56a2d11";
const ADMIN_TOKEN_SECRET = process.env.KURIZU_TOKEN_SECRET
  ? Buffer.from(process.env.KURIZU_TOKEN_SECRET, "utf8")
  : crypto.randomBytes(32);
const ADMIN_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const ADMIN_MAX_SESSIONS = 20;
const ADMIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
const ADMIN_MAX_FAILS = 5;

const adminSessions = new Map(); // sid -> { expiresAt, ip }
const adminFailTracker = new Map(); // ip -> { count, windowStart, lockedUntil }

function clientIpFromReq(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim() || "unknown";
}

function pruneAdminSessions(now = Date.now()) {
  for (const [sid, s] of adminSessions.entries()) {
    if (!s || s.expiresAt <= now) adminSessions.delete(sid);
  }
  while (adminSessions.size > ADMIN_MAX_SESSIONS) {
    const oldest = adminSessions.keys().next().value;
    if (!oldest) break;
    adminSessions.delete(oldest);
  }
}

function verifyPasswordHash(password, spec = ADMIN_PASSWORD_HASH) {
  if (typeof password !== "string" || !password) return false;
  const parts = String(spec || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expectedHex = parts[3];
  if (!Number.isFinite(iterations) || iterations < 10000 || !salt || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const derived = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signAdminSession(sid, exp) {
  return crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(`${sid}.${exp}`).digest("base64url");
}

function createAdminSession(ip) {
  const now = Date.now();
  pruneAdminSessions(now);
  const sid = crypto.randomBytes(18).toString("hex");
  const expiresAt = now + ADMIN_SESSION_TTL_MS;
  adminSessions.set(sid, { expiresAt, ip });
  const token = `v1.${sid}.${expiresAt}.${signAdminSession(sid, expiresAt)}`;
  return { sid, token, expiresAt };
}

function verifyAdminToken(req) {
  const auth = String(req.headers["authorization"] || "").trim();
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, sid, expStr, sig] = parts;
  if (!/^[0-9a-f]{16,64}$/i.test(sid)) return null;
  const exp = Number(expStr);
  const now = Date.now();
  if (!Number.isFinite(exp) || exp <= now) {
    adminSessions.delete(sid);
    return null;
  }
  const expectedSig = signAdminSession(sid, exp);
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  const session = adminSessions.get(sid);
  if (!session || session.expiresAt <= now) {
    adminSessions.delete(sid);
    return null;
  }
  return { sid, expiresAt: session.expiresAt };
}

function readJsonBody(req, limitBytes = 32768) {
  return new Promise((resolve, reject) => {
    let body = "";
    let exceeded = false;
    req.on("data", chunk => {
      if (exceeded) return;
      body += chunk;
      if (body.length > limitBytes) {
        exceeded = true;
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (exceeded) return;
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function handleAdminApi(req, res, pathname) {
  const noStore = { "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") { sendJson(res, 204, {}, noStore); return; }

  if (pathname === "/api/admin/verify" && req.method === "GET") {
    const verified = verifyAdminToken(req);
    if (!verified) { sendJson(res, 401, { ok: false, error: "Unauthorized" }, noStore); return; }
    sendJson(res, 200, { ok: true, expiresAt: verified.expiresAt }, noStore);
    return;
  }

  if (pathname === "/api/admin/logout" && req.method === "POST") {
    const verified = verifyAdminToken(req);
    if (verified) adminSessions.delete(verified.sid);
    sendJson(res, 200, { ok: true }, noStore);
    return;
  }

  if (pathname === "/api/admin/login" && req.method === "POST") {
    const ip = clientIpFromReq(req);
    const now = Date.now();
    let tracker = adminFailTracker.get(ip);
    if (tracker && tracker.lockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((tracker.lockedUntil - now) / 1000));
      sendJson(res, 429, { ok: false, error: "Too many failed attempts. Try again later.", retryAfterSec }, noStore);
      return;
    }
    readJsonBody(req, 8192).then(data => {
      const pwd = typeof data.password === "string" ? data.password : "";
      if (verifyPasswordHash(pwd)) {
        adminFailTracker.delete(ip);
        const session = createAdminSession(ip);
        sendJson(res, 200, { ok: true, token: session.token, expiresAt: session.expiresAt }, noStore);
        return;
      }
      if (!tracker || now - tracker.windowStart > ADMIN_FAIL_WINDOW_MS) {
        tracker = { count: 0, windowStart: now, lockedUntil: 0 };
      }
      tracker.count += 1;
      if (tracker.count >= ADMIN_MAX_FAILS) {
        tracker.lockedUntil = now + ADMIN_LOCKOUT_MS;
      }
      adminFailTracker.set(ip, tracker);
      setTimeout(() => {
        if (tracker.lockedUntil > Date.now()) {
          const retryAfterSec = Math.max(1, Math.ceil((tracker.lockedUntil - Date.now()) / 1000));
          sendJson(res, 429, { ok: false, error: "Too many failed attempts. Try again later.", retryAfterSec }, noStore);
          return;
        }
        const remaining = Math.max(0, ADMIN_MAX_FAILS - tracker.count);
        sendJson(res, 401, { ok: false, error: "Wrong passphrase.", remainingAttempts: remaining }, noStore);
      }, 600);
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || "Bad request" }, noStore);
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" }, noStore);
}

/* ------------------------------ portfolio reviews & ratings API ------------------------------ */
const REVIEWS_FILE = path.join(ROOT, "reviews.json");
let reviewStore = {}; // { [projectId]: { ratings: { [clientId]: 1..5 }, comments: [...], deletedIds: [], deletedReplyIds: [] } }
try {
  if (fs.existsSync(REVIEWS_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
    if (parsed && typeof parsed === "object") reviewStore = parsed;
  }
} catch (e) { reviewStore = {}; }

function saveReviews() {
  try { fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviewStore, null, 2), "utf8"); } catch (e) {}
}
function cleanProjectId(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
}
function cleanCommentId(s) {
  return String(s || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}
function normalizeTag(tag) {
  return tag === "fixed" || tag === "not_fixed" ? tag : null;
}
function ensureProjectStore(pid) {
  if (!reviewStore[pid] || typeof reviewStore[pid] !== "object") {
    reviewStore[pid] = { ratings: {}, comments: [], deletedIds: [], deletedReplyIds: [] };
  }
  const entry = reviewStore[pid];
  if (!entry.ratings || typeof entry.ratings !== "object") entry.ratings = {};
  if (!Array.isArray(entry.comments)) entry.comments = [];
  if (!Array.isArray(entry.deletedIds)) entry.deletedIds = [];
  if (!Array.isArray(entry.deletedReplyIds)) entry.deletedReplyIds = [];
  entry.comments = entry.comments.map(c => ({
    ...c,
    tag: normalizeTag(c.tag),
    isOperator: Boolean(c.isOperator),
    replies: Array.isArray(c.replies)
      ? c.replies.map(r => ({ ...r, isOperator: Boolean(r.isOperator) })).slice(0, 50)
      : []
  }));
  return entry;
}
function pushTombstone(arr, id, cap = 500) {
  if (!id || arr.includes(id)) return;
  arr.unshift(id);
  if (arr.length > cap) arr.length = cap;
}
function projectSummary(id) {
  const entry = ensureProjectStore(id);
  const vals = Object.values(entry.ratings || {}).filter(v => v >= 1 && v <= 5);
  const count = vals.length;
  const avg = count ? +(vals.reduce((a, b) => a + b, 0) / count).toFixed(1) : 0;
  return { avg, count, commentsCount: (entry.comments || []).length };
}
function sendJson(res, status, obj, extraHeaders = {}) {
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache"
  }, extraHeaders));
  res.end(JSON.stringify(obj));
}
const reviewCooldown = new Map();

function buildProjectPayload(pid, extra = {}) {
  const entry = ensureProjectStore(pid);
  const sum = projectSummary(pid);
  return Object.assign({
    project: pid,
    avg: sum.avg,
    count: sum.count,
    comments: (entry.comments || []).slice(0, 100),
    deletedIds: entry.deletedIds || [],
    deletedReplyIds: entry.deletedReplyIds || []
  }, extra);
}

function handleReviewsApi(req, res) {
  if (req.method === "OPTIONS") { sendJson(res, 204, {}); return; }
  const qStr = (req.url || "").split("?")[1] || "";
  const params = new URLSearchParams(qStr);
  if (req.method === "GET") {
    const pid = cleanProjectId(params.get("project"));
    if (pid) {
      sendJson(res, 200, buildProjectPayload(pid));
      return;
    }
    const projects = {};
    for (const k of Object.keys(reviewStore)) projects[k] = projectSummary(k);
    sendJson(res, 200, { projects });
    return;
  }

  if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
    const ip = clientIpFromReq(req);
    const now = Date.now();
    const isAdmin = Boolean(verifyAdminToken(req));

    readJsonBody(req, 32768).then(data => {
      const pid = cleanProjectId(data.project || params.get("project"));
      if (!pid) { sendJson(res, 400, { error: "Missing project id" }); return; }

      const action = req.method === "DELETE"
        ? "delete"
        : (req.method === "PATCH" ? "tag" : String(data.action || "").toLowerCase());

      // Operator-only: delete comment or reply
      if (action === "delete") {
        if (!isAdmin) { sendJson(res, 401, { error: "Operator authentication required." }); return; }
        const cid = cleanCommentId(data.commentId || params.get("commentId"));
        const rid = cleanCommentId(data.replyId || params.get("replyId"));
        if (!cid) { sendJson(res, 400, { error: "Missing comment id" }); return; }
        const entry = ensureProjectStore(pid);
        if (rid) {
          const target = entry.comments.find(c => c.id === cid);
          if (target && Array.isArray(target.replies)) {
            target.replies = target.replies.filter(r => r.id !== rid);
          }
          pushTombstone(entry.deletedReplyIds, rid);
        } else {
          entry.comments = entry.comments.filter(c => c.id !== cid);
          if (entry.ratings && Object.prototype.hasOwnProperty.call(entry.ratings, `c_${cid}`)) {
            delete entry.ratings[`c_${cid}`];
          }
          pushTombstone(entry.deletedIds, cid);
        }
        saveReviews();
        sendJson(res, 200, buildProjectPayload(pid, { ok: true }));
        return;
      }

      // Operator-only: set or clear comment tag ("fixed" | "not_fixed" | null)
      if (action === "tag") {
        if (!isAdmin) { sendJson(res, 401, { error: "Operator authentication required." }); return; }
        const cid = cleanCommentId(data.commentId);
        if (!cid) { sendJson(res, 400, { error: "Missing comment id" }); return; }
        if (data.tag !== null && data.tag !== "" && data.tag !== undefined && data.tag !== "fixed" && data.tag !== "not_fixed") {
          sendJson(res, 400, { error: "Invalid tag" });
          return;
        }
        const nextTag = normalizeTag(data.tag);
        const entry = ensureProjectStore(pid);
        const target = entry.comments.find(c => c.id === cid);
        if (!target) { sendJson(res, 404, { error: "Comment not found" }); return; }
        target.tag = nextTag;
        saveReviews();
        sendJson(res, 200, buildProjectPayload(pid, { ok: true }));
        return;
      }

      // Public + Operator: reply to an existing comment
      if (action === "reply") {
        if (!isAdmin && now - (reviewCooldown.get(ip) || 0) < 1800) {
          sendJson(res, 429, { error: "Slow down a bit — try again in a few seconds." });
          return;
        }
        const cid = cleanCommentId(data.commentId);
        const text = String(data.text || "").trim().slice(0, 300);
        const rawName = String(data.name || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 24);
        const name = isAdmin ? "kurizu" : (rawName || "anonymous");
        if (!cid || !text) { sendJson(res, 400, { error: "Reply text is required." }); return; }
        const entry = ensureProjectStore(pid);
        if (entry.deletedIds.includes(cid)) {
          sendJson(res, 404, { error: "Comment was removed." });
          return;
        }
        const target = entry.comments.find(c => c.id === cid);
        if (!target) { sendJson(res, 404, { error: "Comment not found" }); return; }
        reviewCooldown.set(ip, now);
        const rid = cleanCommentId(data.replyId) || ("rep_" + crypto.randomBytes(6).toString("hex"));
        if (!Array.isArray(target.replies)) target.replies = [];
        target.replies = target.replies.filter(r => r.id !== rid);
        target.replies.push({
          id: rid,
          name,
          text,
          ts: now,
          isOperator: isAdmin
        });
        if (target.replies.length > 50) target.replies = target.replies.slice(-50);
        saveReviews();
        sendJson(res, 200, buildProjectPayload(pid, { ok: true }));
        return;
      }

      const isSync = Boolean(data.sync);
      if (!isSync && !isAdmin && now - (reviewCooldown.get(ip) || 0) < 1800) {
        sendJson(res, 429, { error: "Slow down a bit — try again in a few seconds." });
        return;
      }

      const entry = ensureProjectStore(pid);
      const clientId = String(data.clientId || ip || crypto.randomBytes(6).toString("hex")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36);

      // Handle background re-sync of cached comments/ratings after a cold boot
      if (isSync && Array.isArray(data.syncComments)) {
        const deletedSet = new Set(entry.deletedIds || []);
        const deletedRepSet = new Set(entry.deletedReplyIds || []);
        const rating = Math.round(Number(data.rating) || 0);
        if (rating >= 1 && rating <= 5 && !entry.ratings[clientId]) {
          entry.ratings[clientId] = rating;
        }
        const existingKeys = new Set(
          (entry.comments || []).map(c => `${c.id || ""}|${(c.name || "").toLowerCase()}|${(c.text || "").toLowerCase()}`)
        );
        for (const item of data.syncComments.slice(0, 50)) {
          const cText = String(item?.text || "").trim().slice(0, 400);
          if (!cText) continue;
          const cId = cleanCommentId(item?.id) || crypto.randomBytes(6).toString("hex");
          if (deletedSet.has(cId)) continue;
          const cName = String(item?.name || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 24) || "anonymous";
          const cRating = Math.round(Number(item?.rating) || 0);
          const validCRating = cRating >= 1 && cRating <= 5 ? cRating : 0;
          const cTs = Number(item?.ts) > 1000000000000 ? Number(item.ts) : now;
          const dedupKey = `${cId}|${cName.toLowerCase()}|${cText.toLowerCase()}`;
          const existing = (entry.comments || []).find(
            c => c.id === cId || ((c.name || "").toLowerCase() === cName.toLowerCase() && (c.text || "").toLowerCase() === cText.toLowerCase())
          );
          if (!existing && !existingKeys.has(dedupKey)) {
            existingKeys.add(dedupKey);
            const cleanReplies = Array.isArray(item?.replies)
              ? item.replies
                  .filter(r => r && r.text && !deletedRepSet.has(cleanCommentId(r.id)))
                  .slice(0, 50)
                  .map(r => ({
                    id: cleanCommentId(r.id) || crypto.randomBytes(5).toString("hex"),
                    name: String(r.name || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 24) || "anonymous",
                    text: String(r.text || "").trim().slice(0, 300),
                    ts: Number(r.ts) > 1000000000000 ? Number(r.ts) : now,
                    isOperator: false
                  }))
              : [];
            entry.comments.push({
              id: cId,
              name: cName,
              rating: validCRating,
              text: cText,
              ts: cTs,
              tag: null,
              isOperator: false,
              replies: cleanReplies
            });
            if (validCRating && !entry.ratings[`c_${cId}`]) {
              entry.ratings[`c_${cId}`] = validCRating;
            }
          }
        }
        entry.comments.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        if (entry.comments.length > 100) entry.comments.length = 100;
        saveReviews();
        sendJson(res, 200, buildProjectPayload(pid, { ok: true }));
        return;
      }

      const rating = Math.round(Number(data.rating) || 0);
      const validRating = rating >= 1 && rating <= 5 ? rating : 0;
      const text = String(data.text || "").trim().slice(0, 400);
      const rawName = String(data.name || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 24);
      const name = isAdmin ? "kurizu" : (rawName || "anonymous");
      if (!validRating && !text) {
        sendJson(res, 400, { error: "Add a star rating or a comment first." });
        return;
      }
      reviewCooldown.set(ip, now);
      if (validRating) entry.ratings[clientId] = validRating;
      if (text) {
        const cid = cleanCommentId(data.id) || crypto.randomBytes(6).toString("hex");
        entry.comments = (entry.comments || []).filter(c => c.id !== cid);
        entry.comments.unshift({
          id: cid,
          name,
          rating: validRating,
          text,
          ts: now,
          tag: null,
          isOperator: isAdmin,
          replies: []
        });
        if (entry.comments.length > 100) entry.comments.length = 100;
      }
      saveReviews();
      sendJson(res, 200, buildProjectPayload(pid, { ok: true }));
    }).catch(err => {
      sendJson(res, 400, { error: err.message || "Invalid request" });
    });
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

/* ------------------------------ KURIZU.dropship API (SSE + File Relay for Netlify) ------------------------------ */
const DS_UPLOAD_DIR = path.join(os.tmpdir(), "kurizu-dropship-uploads");
try { fs.mkdirSync(DS_UPLOAD_DIR, { recursive: true }); } catch (e) {}

const DS_T0 = Date.now();
const DS_MAX_FILE_BYTES = 250 * 1024 * 1024; // 250 MB per file on cloud relay
const DS_P2P_MAX_FILE_BYTES = 25 * 1024 * 1024 * 1024; // 25 GB per file via WebRTC P2P direct stream
const DS_MAX_FILES = 50;
const DS_AVATARS = ["mascot", "avatar", "pet", "idle", "dance"];
const DS_TYPES = ["desktop", "laptop", "phone", "tablet", "console", "tv", "unknown"];
const dsDevices = new Map();   // deviceId -> device
const dsTransfers = new Map(); // transferId -> transfer
const dsFiles = new Map();     // fileId -> file

function dsCorsHeaders(extra = {}) {
  return Object.assign({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-File-Name, X-File-Type",
    "Cache-Control": "no-store"
  }, extra);
}

function dsJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, dsCorsHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  }));
  res.end(body);
}

function dsFail(res, status, msg) {
  dsJson(res, status, { ok: false, error: msg });
}

function dsClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "lan")
    .split(",")[0]
    .trim()
    .replace(/^::ffff:/, "") || "lan";
}

function dsRoomOf(req, queryRoom) {
  const r = String(queryRoom || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  if (r) return "room:" + r;
  const ip = dsClientIp(req);
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) return "lan:local";
  return "ip:" + ip;
}

function dsPublicDevice(d) {
  return { id: d.id, name: d.name, avatar: d.avatar, type: d.type, ip: d.ip, room: d.room };
}

function dsPublicFile(f) {
  return { id: f.id, name: f.name, size: f.size, type: f.type, p2p: Boolean(f.p2p) };
}

function dsPublicTransfer(t) {
  return {
    id: t.id,
    fromId: t.fromId,
    toId: t.toId,
    from: t.from,
    to: t.to,
    files: (t.files || []).map(dsPublicFile),
    message: t.message,
    p2p: Boolean(t.p2p),
    status: t.status,
    createdAt: t.createdAt,
    respondedAt: t.respondedAt || null
  };
}

function dsDeviceList(room) {
  return [...dsDevices.values()]
    .filter(d => !d.gone && (!room || d.room === room))
    .map(dsPublicDevice)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function dsSseSend(device, event, data) {
  if (!device || !device.res || device.res.writableEnded) return;
  try {
    device.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (e) {}
}

function dsBroadcastDevices(room) {
  const payload = { devices: dsDeviceList(room) };
  for (const d of dsDevices.values()) {
    if (!room || d.room === room) dsSseSend(d, "devices", payload);
  }
}

function dsReadJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error("Request body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function handleDropshipApi(req, res, pathname, searchParams) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, dsCorsHeaders());
    res.end();
    return;
  }

  // 1. SSE Presence (/api/events)
  if (pathname === "/api/events" && req.method === "GET") {
    const rawId = String(searchParams.get("deviceId") || "").trim();
    const id = /^[A-Za-z0-9_-]{6,64}$/.test(rawId) ? rawId : crypto.randomUUID();
    const room = dsRoomOf(req, searchParams.get("room"));
    const now = Date.now();

    res.writeHead(200, dsCorsHeaders({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    }));
    res.write("retry: 2500\n\n");

    const prev = dsDevices.get(id);
    if (prev && prev.timer) { clearTimeout(prev.timer); prev.timer = null; }
    if (prev && prev.res && prev.res !== res && !prev.res.writableEnded) {
      try { prev.res.end(); } catch (e) {}
    }

    const cleanName = String(searchParams.get("name") || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 32) || `purple-${id.slice(0, 4)}`;
    const av = DS_AVATARS.includes(searchParams.get("avatar")) ? searchParams.get("avatar") : DS_AVATARS[0];
    const tp = DS_TYPES.includes(searchParams.get("type")) ? searchParams.get("type") : "unknown";

    const device = {
      id,
      name: cleanName,
      avatar: av,
      type: tp,
      ip: dsClientIp(req),
      room,
      res,
      connectedAt: prev?.connectedAt || now,
      lastSeen: now,
      gone: false,
      timer: null
    };
    dsDevices.set(id, device);

    const related = [...dsTransfers.values()]
      .filter(t => t.fromId === id || t.toId === id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
      .map(dsPublicTransfer);

    dsSseSend(device, "hello", {
      self: dsPublicDevice(device),
      room,
      devices: dsDeviceList(room),
      avatars: DS_AVATARS,
      limits: {
        maxFileBytes: DS_P2P_MAX_FILE_BYTES,
        maxRelayBytes: DS_MAX_FILE_BYTES,
        maxTransferBytes: DS_P2P_MAX_FILE_BYTES * 2,
        maxFiles: DS_MAX_FILES,
        maxNoteChars: 2000
      },
      server: { name: "KURIZU.DROPSHIP", port: PORT, startedAt: DS_T0 },
      transfers: related
    });

    dsBroadcastDevices(room);

    const ping = setInterval(() => {
      if (res.writableEnded) return;
      try { res.write(`: ping ${Date.now()}\n\n`); } catch (e) {}
    }, 20000);

    req.on("close", () => {
      clearInterval(ping);
      const cur = dsDevices.get(id);
      if (!cur || cur.res !== res) return;
      cur.timer = setTimeout(() => {
        const still = dsDevices.get(id);
        if (still && still.res === res) {
          dsDevices.delete(id);
          dsBroadcastDevices(room);
        }
      }, 3000);
    });
    return;
  }

  // 2. Profile & Room update (/api/profile or /api/me)
  if ((pathname === "/api/profile" || pathname === "/api/me") && req.method === "POST") {
    const id = req.headers["x-device-id"];
    const device = dsDevices.get(id);
    if (!device) return dsFail(res, 401, "This device is not connected.");
    let body;
    try { body = await dsReadJson(req); } catch (e) { return dsFail(res, 400, e.message); }
    if (body.name !== undefined) {
      const n = String(body.name || "").trim().slice(0, 32);
      if (!n) return dsFail(res, 400, "Give your device a name first.");
      device.name = n;
    }
    if (body.avatar !== undefined && DS_AVATARS.includes(body.avatar)) device.avatar = body.avatar;
    if (body.room !== undefined) {
      const prevRoom = device.room;
      device.room = dsRoomOf(req, body.room);
      if (prevRoom && prevRoom !== device.room) dsBroadcastDevices(prevRoom);
    }
    dsBroadcastDevices(device.room);
    return dsJson(res, 200, { ok: true, self: dsPublicDevice(device), room: device.room, devices: dsDeviceList(device.room) });
  }

  // 2b. WebRTC P2P Signaling Relay (/api/signal)
  if (pathname === "/api/signal" && req.method === "POST") {
    const sender = dsDevices.get(req.headers["x-device-id"]);
    if (!sender) return dsFail(res, 401, "This device is not connected.");
    let body;
    try { body = await dsReadJson(req, 256 * 1024); } catch (e) { return dsFail(res, 400, e.message); }
    const target = dsDevices.get(String(body.to || ""));
    if (!target) return dsFail(res, 404, "Peer device is offline.");
    dsSseSend(target, "signal", {
      from: sender.id,
      fromDevice: dsPublicDevice(sender),
      transferId: body.transferId || null,
      signal: body.signal || null
    });
    return dsJson(res, 200, { ok: true });
  }

  // 3. File upload (/api/upload)
  if (pathname === "/api/upload" && req.method === "POST") {
    const sender = dsDevices.get(req.headers["x-device-id"]);
    if (!sender) return dsFail(res, 401, "This device is not connected.");
    const to = searchParams.get("to");
    if (!to || to === sender.id) return dsFail(res, 400, "Pick another device.");
    if (!dsDevices.get(to)) return dsFail(res, 409, "That device went offline.");

    let decodedName = "file";
    try { decodedName = decodeURIComponent(String(req.headers["x-file-name"] || "file")); }
    catch (e) { decodedName = String(req.headers["x-file-name"] || "file"); }
    const name = decodedName.replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_").trim().slice(0, 160) || "file";
    const type = String(req.headers["x-file-type"] || "application/octet-stream").slice(0, 120);

    const fileId = crypto.randomUUID();
    const partial = path.join(DS_UPLOAD_DIR, `${fileId}.part`);
    const final = path.join(DS_UPLOAD_DIR, fileId);
    let received = 0;

    const limiter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        if (received > DS_MAX_FILE_BYTES) { cb(new Error("File exceeds relay size limit.")); return; }
        cb(null, chunk);
      }
    });

    try {
      await pipeline(req, limiter, fs.createWriteStream(partial, { flags: "wx" }));
      if (received === 0) {
        await fsp.rm(partial, { force: true }).catch(() => {});
        return dsFail(res, 400, "That file is empty.");
      }
      await fsp.rename(partial, final);
    } catch (e) {
      await fsp.rm(partial, { force: true }).catch(() => {});
      if (!res.writableEnded) dsFail(res, 400, e.message || "Upload failed.");
      return;
    }

    const file = { id: fileId, ownerId: sender.id, name, size: received, type, path: final, transferId: null, createdAt: Date.now() };
    dsFiles.set(fileId, file);
    return dsJson(res, 200, { ok: true, file: dsPublicFile(file) });
  }

  // 4. Send Offer (/api/offer) — supports both WebRTC P2P direct files (up to 25 GB) and relayed files
  if (pathname === "/api/offer" && req.method === "POST") {
    const sender = dsDevices.get(req.headers["x-device-id"]);
    if (!sender) return dsFail(res, 401, "This device is not connected.");
    let body;
    try { body = await dsReadJson(req, 128 * 1024); } catch (e) { return dsFail(res, 400, e.message); }
    const recipient = dsDevices.get(String(body.to || ""));
    if (!recipient) return dsFail(res, 409, "That device went offline.");
    if (recipient.id === sender.id) return dsFail(res, 400, "You cannot send to yourself.");

    const message = String(body.message || "").trim().slice(0, 2000);
    const incomingIds = Array.isArray(body.fileIds) ? body.fileIds : [];
    const incomingP2p = Array.isArray(body.p2pFiles) ? body.p2pFiles : [];
    if (!incomingIds.length && !incomingP2p.length && !message) return dsFail(res, 400, "Add a file or a note first.");

    const selected = [];
    for (const fid of incomingIds) {
      const f = dsFiles.get(fid);
      if (!f || f.ownerId !== sender.id || f.transferId) return dsFail(res, 400, "One of those files is no longer available.");
      selected.push(f);
    }

    const p2pMetas = [];
    for (const pf of incomingP2p.slice(0, DS_MAX_FILES)) {
      const sz = Math.max(0, Number(pf?.size) || 0);
      if (!sz || sz > DS_P2P_MAX_FILE_BYTES) return dsFail(res, 400, "A file exceeds the 25 GB P2P limit.");
      p2pMetas.push({
        id: String(pf.id || crypto.randomUUID()).slice(0, 64),
        name: String(pf.name || "file").replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_").trim().slice(0, 160) || "file",
        size: sz,
        type: String(pf.type || "application/octet-stream").slice(0, 120),
        p2p: true
      });
    }

    const allFiles = [...selected.map(dsPublicFile), ...p2pMetas];
    const isP2p = p2pMetas.length > 0 || Boolean(body.p2p);

    const transfer = {
      id: crypto.randomUUID(),
      fromId: sender.id,
      toId: recipient.id,
      from: dsPublicDevice(sender),
      to: dsPublicDevice(recipient),
      files: allFiles,
      p2p: isP2p,
      message,
      status: "pending",
      createdAt: Date.now(),
      respondedAt: null
    };
    for (const f of selected) f.transferId = transfer.id;
    dsTransfers.set(transfer.id, transfer);

    dsSseSend(recipient, "offer", { transfer: dsPublicTransfer(transfer) });
    return dsJson(res, 200, { ok: true, transfer: dsPublicTransfer(transfer) });
  }

  // 5. Respond to Offer (/api/respond)
  if (pathname === "/api/respond" && req.method === "POST") {
    const device = dsDevices.get(req.headers["x-device-id"]);
    if (!device) return dsFail(res, 401, "This device is not connected.");
    let body;
    try { body = await dsReadJson(req); } catch (e) { return dsFail(res, 400, e.message); }
    const transfer = dsTransfers.get(String(body.transferId || ""));
    if (!transfer) return dsFail(res, 404, "That transfer no longer exists.");
    if (transfer.toId !== device.id) return dsFail(res, 403, "That transfer is not for you.");
    if (transfer.status !== "pending") return dsJson(res, 200, { ok: true, transfer: dsPublicTransfer(transfer), unchanged: true });

    const action = body.action === "accept" ? "accepted" : "declined";
    transfer.status = action;
    transfer.respondedAt = Date.now();

    if (action === "declined") {
      for (const meta of transfer.files) {
        const f = dsFiles.get(meta.id);
        if (f) { dsFiles.delete(f.id); fsp.rm(f.path, { force: true }).catch(() => {}); }
      }
    }

    const payload = { transfer: dsPublicTransfer(transfer), by: dsPublicDevice(device) };
    const senderDevice = dsDevices.get(transfer.fromId);
    if (senderDevice) dsSseSend(senderDevice, "transfer-update", payload);
    dsSseSend(device, "transfer-update", payload);
    return dsJson(res, 200, { ok: true, transfer: dsPublicTransfer(transfer) });
  }

  // 6. Download File (/api/file/:id)
  if (pathname.startsWith("/api/file/") && req.method === "GET") {
    const fileId = decodeURIComponent(pathname.slice("/api/file/".length));
    const file = dsFiles.get(fileId);
    if (!file) return dsFail(res, 404, "This file has expired or was removed.");
    let stat;
    try { stat = await fsp.stat(file.path); } catch (e) { return dsFail(res, 404, "File no longer on disk."); }
    const inline = searchParams.get("inline") === "1" && file.type.startsWith("image/");
    const safeName = file.name.replace(/["\\\r\n]/g, "_");
    res.writeHead(200, dsCorsHeaders({
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": stat.size,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`
    }));
    fs.createReadStream(file.path).on("error", () => res.destroy()).pipe(res);
    return;
  }

  dsFail(res, 404, "Not found");
}

// Periodic cleanup of old temporary dropship uploads (>1 hour old)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [fid, f] of dsFiles.entries()) {
    if (f.createdAt < cutoff) {
      dsFiles.delete(fid);
      fsp.rm(f.path, { force: true }).catch(() => {});
    }
  }
}, 10 * 60 * 1000).unref();

/* ------------------------------ static files ------------------------------ */
const server = http.createServer((req, res) => {
  let parsedUrl;
  try { parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`); }
  catch (e) { res.writeHead(400); res.end(); return; }
  let url = "/";
  try { url = decodeURIComponent(parsedUrl.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  if (url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
  if (url === "/api/admin/login" || url === "/api/admin/verify" || url === "/api/admin/logout") {
    handleAdminApi(req, res, url);
    return;
  }
  if (url === "/api/reviews") { handleReviewsApi(req, res); return; }
  if (url === "/api/events" || url === "/api/profile" || url === "/api/me" || url === "/api/signal" || url === "/api/upload" || url === "/api/offer" || url === "/api/respond" || url.startsWith("/api/file/")) {
    handleDropshipApi(req, res, url, parsedUrl.searchParams);
    return;
  }
  if (url === "/") url = "/index.html";
  const file = path.join(ROOT, path.normalize(url));
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  if (!file.startsWith(ROOT + path.sep) || base.startsWith(".") || base === "server.js" || base === "package.json" || base === "reviews.json" || !MIME[ext]) {
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
function cleanChar(s) { return s === "reiru" ? "reiru" : "kurizu"; }
function randomCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) { let s = ""; for (let i = 0; i < 4; i++) s += L[(Math.random() * L.length) | 0]; if (!rooms.has(s)) return s; }
}
function roster(room) {
  return { players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, char: p.char || "kurizu" })), hostId: room.hostId };
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
  }, 2800);
}

function join(c, msg) {
  if (c.room) return;
  let code = cleanRoom(msg.room) || randomCode();
  let room = rooms.get(code);
  if (!room) { room = { code, players: new Map(), hostId: null, phase: "lobby", door: null, cr: null, order: [], seed: 0 }; rooms.set(code, room); }
  if (room.players.size >= MAX_PLAYERS) { send(c, { t: "err", msg: "Room is full (" + MAX_PLAYERS + " max)." }); return; }
  c.id = nextId++;
  c.name = cleanName(msg.name);
  c.char = cleanChar(msg.char);
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
    case "char":
      if (room.phase === "lobby") {
        c.char = cleanChar(m.char);
        broadcast(room, Object.assign({ t: "roster" }, roster(room)));
      }
      break;
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
