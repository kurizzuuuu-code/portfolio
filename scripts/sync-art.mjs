import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ARTS_DIR = path.join(ROOT, "assets", "arts");
const MANIFEST_PATH = path.join(ARTS_DIR, "manifest.json");
const CATEGORIES = ["digital", "traditional"];
const IMAGE_RE = /\.(webp|png|jpe?g|gif|avif)$/i;
const FULL_SUFFIX_RE = /-full$/i;

function stemOf(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(FULL_SUFFIX_RE, "")
    .toLowerCase();
}

function isFullVariant(filename) {
  return FULL_SUFFIX_RE.test(filename.replace(/\.[^.]+$/, ""));
}

async function scanCategory(category) {
  const dir = path.join(ARTS_DIR, category);
  let dirents = [];
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  const groups = new Map();

  for (const d of dirents) {
    if (!d.isFile()) continue;
    const name = d.name;
    if (!name || name.startsWith(".") || !IMAGE_RE.test(name)) continue;

    const info = await stat(path.join(dir, name));
    const stem = stemOf(name);
    let group = groups.get(stem);
    if (!group) {
      group = { thumb: null, full: null, mtimeMs: 0 };
      groups.set(stem, group);
    }

    if (info.mtimeMs > group.mtimeMs) group.mtimeMs = info.mtimeMs;

    if (isFullVariant(name)) {
      if (!group.full) group.full = name;
    } else if (!group.thumb) {
      group.thumb = name;
    }
  }

  const entries = [];
  for (const group of groups.values()) {
    const file = group.thumb || group.full;
    if (!file) continue;
    const entry = {
      file,
      animated: /\.gif$/i.test(file),
      mtime: Math.round(group.mtimeMs),
    };
    if (group.full && group.full !== file) {
      entry.full = group.full;
    }
    entries.push(entry);
  }

  entries.sort((a, b) => {
    if (b.mtime !== a.mtime) return b.mtime - a.mtime;
    return a.file.localeCompare(b.file, undefined, { numeric: true, sensitivity: "base" });
  });

  return entries;
}

async function main() {
  await mkdir(ARTS_DIR, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
  };

  for (const cat of CATEGORIES) {
    manifest[cat] = await scanCategory(cat);
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `[sync-art] wrote manifest.json (${manifest.digital.length} digital, ${manifest.traditional.length} traditional)`
  );
}

main().catch((err) => {
  console.error("[sync-art] failed:", err);
  process.exitCode = 1;
});
