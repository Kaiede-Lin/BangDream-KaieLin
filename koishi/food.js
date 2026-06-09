const { h } = require('koishi');
const fs = require('fs');
const path = require('path');

const FOOD_ROOT = '/app/data/food-libs';
const CATEGORY_CONFIG = {
  eat: {
    dir: path.join(FOOD_ROOT, 'eat'),
    fallback: '吃的',
  },
  drink: {
    dir: path.join(FOOD_ROOT, 'drink'),
    fallback: '喝的',
  },
};

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.apng',
]);

const CACHE_TTL = 30 * 1000;
const libraryCache = new Map();

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function prettifySegment(segment) {
  return String(segment)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericLabel(text) {
  const value = prettifySegment(text).toLowerCase().replace(/\s+/g, '');
  if (!value) return true;
  if (/^\d+$/.test(value)) return true;
  return /^(img|image|pic|picture|photo|photos|screenshot|screen|file|new|tmp|temp|output)$/i.test(value);
}

function mimeFromExt(ext) {
  switch (String(ext).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.apng':
    case '.png':
    default:
      return 'image/png';
  }
}

function deriveLabel(filePath, rootDir, fallback) {
  const relative = path.relative(rootDir, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  const candidates = [];

  if (parts.length) {
    candidates.push(path.parse(parts[parts.length - 1]).name);
    for (let i = parts.length - 2; i >= 0; i--) {
      candidates.push(parts[i]);
    }
  }

  for (const candidate of candidates) {
    const text = prettifySegment(candidate);
    if (text && !isGenericLabel(text)) return text;
  }

  return fallback;
}

function walkImages(dir, rootDir, fallback, items = []) {
  if (!fs.existsSync(dir)) return items;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(fullPath, rootDir, fallback, items);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    items.push({
      filePath: fullPath,
      mime: mimeFromExt(ext),
      label: deriveLabel(fullPath, rootDir, fallback),
    });
  }

  return items;
}

function getLibrary(category) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return [];

  ensureDir(config.dir);

  const cached = libraryCache.get(category);
  const now = Date.now();
  if (cached && now - cached.loadedAt < CACHE_TTL) {
    return cached.items;
  }

  const items = walkImages(config.dir, config.dir, config.fallback);
  libraryCache.set(category, { loadedAt: now, items });
  return items;
}

function pickRandom(list) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function buildResponse(category) {
  const config = CATEGORY_CONFIG[category];
  const items = getLibrary(category);
  if (!items.length) {
    return `还没有找到本地图库。\n请把图片放到：\n${config.dir}\n可以按子文件夹分库管理。`;
  }

  const picked = pickRandom(items);
  if (!picked) {
    return `本地图库里没有可用图片。\n请检查目录：\n${config.dir}`;
  }

  const buffer = fs.readFileSync(picked.filePath);
  const text = `试试（${picked.label}）吧`;
  return `${text}\n${h.image(buffer, picked.mime)}`;
}

module.exports = {
  name: 'food-picker',
  apply(ctx) {
    ensureDir(FOOD_ROOT);
    ensureDir(CATEGORY_CONFIG.eat.dir);
    ensureDir(CATEGORY_CONFIG.drink.dir);

    ctx.command('吃什么', '随机推荐吃的')
      .alias('吃点什么')
      .example('吃什么')
      .action(async () => buildResponse('eat'));

    ctx.command('喝什么', '随机推荐喝的')
      .alias('喝点什么')
      .example('喝什么')
      .action(async () => buildResponse('drink'));
  },
};
