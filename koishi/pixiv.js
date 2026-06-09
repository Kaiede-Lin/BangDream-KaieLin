const { h } = require('koishi');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const BANGDREAM_ALIAS_PATHS = [
  '/app/backend-config/fuzzy_search_settings.json',
  '/app/data/fuzzy_search_settings.json',
];
const SEARCH_URL = 'https://www.pixiv.net/ajax/search/artworks/';
const ILLUSTRATION_URL = 'https://www.pixiv.net/ajax/illust/';
const DEFAULT_KEYWORDS = ['オリジナル', '猫', '女の子', 'かわいい', '創作', 'イラスト'];
const MAX_SEARCH_PAGES = 10;
const MAX_ATTEMPTS = 8;
const ALIAS_CACHE_TTL = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 20000;

const JSON_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  accept: 'application/json,text/plain,*/*',
  referer: 'https://www.pixiv.net/',
};

const IMAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  referer: 'https://www.pixiv.net/',
  origin: 'https://www.pixiv.net',
};

function sanitizeText(value, fallback = '') {
  const text = value == null ? fallback : String(value);
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function normalizeAliasText(value) {
  // 统一全角/半角并去掉标点，让角色别名的模糊匹配更稳定。
  return sanitizeText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .trim();
}

function randomItem(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function uniqueRandomPages(maxPage, count) {
  const pages = new Set([1]);
  const limit = Math.max(1, Math.min(Number(maxPage) || 1, MAX_SEARCH_PAGES));
  const target = Math.max(1, Math.min(limit, count));

  while (pages.size < target) {
    pages.add(1 + Math.floor(Math.random() * limit));
  }

  return [...pages];
}

function extensionFromUrl(url) {
  try {
    return path.extname(new URL(url).pathname).toLowerCase();
  } catch (_) {
    return '';
  }
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
    case '.png':
    default:
      return 'image/png';
  }
}

function mimeFromResponse(contentType, url) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('image/')) return type;
  return mimeFromExt(extensionFromUrl(url) || '.png');
}

const bangdreamAliasCache = {
  loadedAt: 0,
  sourcePath: '',
  entries: [],
};

function buildBangdreamAliasEntries(raw) {
  const entries = [];

  for (const kind of ['characterId', 'bandId']) {
    const typeConfig = raw?.[kind];
    if (!typeConfig || typeof typeConfig !== 'object') continue;

    for (const [id, aliases] of Object.entries(typeConfig)) {
      const aliasEntries = [];

      for (const alias of Array.isArray(aliases) ? aliases : []) {
        const text = sanitizeText(alias);
        const norm = normalizeAliasText(text);
        if (!text || !norm) continue;
        aliasEntries.push({ text, norm });
      }

      if (aliasEntries.length) {
        entries.push({
          kind,
          id: String(id),
          aliases: aliasEntries,
        });
      }
    }
  }

  return entries;
}

function loadBangdreamAliasEntries() {
  const now = Date.now();
  if (bangdreamAliasCache.entries.length && now - bangdreamAliasCache.loadedAt < ALIAS_CACHE_TTL) {
    return bangdreamAliasCache.entries;
  }

  for (const filePath of BANGDREAM_ALIAS_PATHS) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const entries = buildBangdreamAliasEntries(raw);
      bangdreamAliasCache.loadedAt = now;
      bangdreamAliasCache.sourcePath = filePath;
      bangdreamAliasCache.entries = entries;
      return entries;
    } catch (_) {
      bangdreamAliasCache.loadedAt = now;
      bangdreamAliasCache.sourcePath = filePath;
      bangdreamAliasCache.entries = [];
      return [];
    }
  }

  bangdreamAliasCache.loadedAt = now;
  bangdreamAliasCache.sourcePath = '';
  bangdreamAliasCache.entries = [];
  return [];
}

function matchAliasEntry(entry, normalizedKeyword) {
  if (!entry || !normalizedKeyword) return false;

  for (const alias of entry.aliases) {
    if (alias.norm === normalizedKeyword) return true;
  }

  if (normalizedKeyword.length < 2) return false;

  for (const alias of entry.aliases) {
    if (alias.norm.includes(normalizedKeyword) || normalizedKeyword.includes(alias.norm)) {
      return true;
    }
  }

  return false;
}

function buildSearchCandidates(keyword) {
  const base = sanitizeText(keyword);
  const fallback = base || randomItem(DEFAULT_KEYWORDS);
  const normalized = normalizeAliasText(fallback);
  const entries = loadBangdreamAliasEntries();
  if (!entries.length || !normalized) {
    return [fallback];
  }

  const matchedEntries = entries.filter((entry) => matchAliasEntry(entry, normalized));
  if (!matchedEntries.length) {
    return [fallback];
  }

  const candidates = [];
  const pushCandidate = (text) => {
    const value = sanitizeText(text);
    if (!value) return;
    candidates.push(value);
  };

  for (const entry of matchedEntries) {
    for (const alias of entry.aliases) {
      pushCandidate(alias.text);
    }
  }
  pushCandidate(fallback);

  return candidates.length ? candidates : [fallback];
}

function collectPreferredAliasTexts(keyword) {
  const normalized = normalizeAliasText(sanitizeText(keyword));
  if (!normalized) return [];

  const entries = loadBangdreamAliasEntries().filter((entry) => matchAliasEntry(entry, normalized));
  const preferred = [];

  for (const entry of entries) {
    for (const alias of entry.aliases) {
      preferred.push(alias.text);
    }
  }

  return preferred;
}

function buildDetailSearchText(detail) {
  const tags = Array.isArray(detail?.tags?.tags)
    ? detail.tags.tags.map((tag) => sanitizeText(tag?.tag)).join(' ')
    : '';

  return [
    detail?.title,
    detail?.illustTitle,
    detail?.userName,
    tags,
  ]
    .map((value) => sanitizeText(value))
    .filter(Boolean)
    .join(' ');
}

function isStrongPreferredTerm(term) {
  const norm = normalizeAliasText(term);
  if (!norm) return false;
  return norm.length >= 4 || /[^\x00-\x7F]/.test(norm);
}

function detailMatchesPreferred(detail, preferredTerms) {
  const strongTerms = preferredTerms
    .map((term) => sanitizeText(term))
    .map((term) => normalizeAliasText(term))
    .filter((term) => term && isStrongPreferredTerm(term));

  if (!strongTerms.length) return true;

  const haystack = normalizeAliasText(buildDetailSearchText(detail));
  if (!haystack) return false;

  return strongTerms.some((term) => haystack.includes(term));
}

async function requestJson(url) {
  const response = await axios.get(url, {
    headers: JSON_HEADERS,
    timeout: REQUEST_TIMEOUT,
  });
  return response.data;
}

async function fetchSearchPage(keyword, page) {
  const encoded = encodeURIComponent(keyword);
  const url = `${SEARCH_URL}${encoded}?word=${encoded}&order=date_d&mode=all&p=${page}&s_mode=s_tag_full`;
  const data = await requestJson(url);
  const body = data?.body?.illustManga || {};
  const items = Array.isArray(body.data)
    ? body.data.filter((item) => item && !item.isAdContainer && item.id)
    : [];
  const lastPage = Math.max(1, Number(body.lastPage) || 1);
  return { items, lastPage };
}

async function fetchIllustrationDetail(id) {
  const data = await requestJson(`${ILLUSTRATION_URL}${id}`);
  return data?.body || null;
}

async function fetchIllustrationPages(id) {
  const data = await requestJson(`${ILLUSTRATION_URL}${id}/pages`);
  return Array.isArray(data?.body) ? data.body : [];
}

async function downloadImage(url, referer) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: REQUEST_TIMEOUT,
    maxContentLength: 20 * 1024 * 1024,
    headers: {
      ...IMAGE_HEADERS,
      referer: referer || IMAGE_HEADERS.referer,
    },
  });

  const buffer = Buffer.from(response.data);
  if (!buffer.length) {
    throw new Error('empty image response');
  }

  const contentType = response.headers?.['content-type'];
  if (contentType && !String(contentType).toLowerCase().startsWith('image/')) {
    throw new Error(`unexpected content-type: ${contentType}`);
  }

  return { buffer, mime: mimeFromResponse(contentType, url) };
}

async function downloadImageCandidates(urls, referer) {
  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      return await downloadImage(url, referer);
    } catch (_) {}
  }
  return null;
}

async function resolveArtworkImage(detail) {
  if (!detail) return null;
  if (Number(detail.illustType) === 2) return null;

  const referer = `https://www.pixiv.net/artworks/${detail.id}`;
  const candidates = [];

  if (Number(detail.pageCount) > 1) {
    try {
      const pages = await fetchIllustrationPages(detail.id);
      const page = randomItem(pages);
      if (page?.urls) {
        candidates.push([
          page.urls.original,
          page.urls.regular,
          page.urls.small,
          page.urls.thumb_mini,
        ]);
      }
    } catch (_) {}
  }

  const urls = detail.urls || {};
  candidates.push([
    urls.original,
    urls.regular,
    urls.small,
    urls.thumb,
  ]);

  for (const group of candidates) {
    const image = await downloadImageCandidates(group, referer);
    if (image) return image;
  }

  return null;
}

function pickKeyword(rawKeyword) {
  const keyword = sanitizeText(rawKeyword);
  return keyword || randomItem(DEFAULT_KEYWORDS);
}

function buildCaption(keyword, detail, queryUsed = '') {
  const title = sanitizeText(detail?.title || detail?.illustTitle, '无题');
  const author = sanitizeText(detail?.userName, '未知作者');
  const userId = sanitizeText(detail?.userId, '');
  const workId = sanitizeText(detail?.id, '');
  const source = workId ? `https://www.pixiv.net/artworks/${workId}` : 'https://www.pixiv.net/';
  const lines = [`关键词：${sanitizeText(keyword, queryUsed || '随机')}`];

  if (queryUsed && sanitizeText(keyword) !== sanitizeText(queryUsed)) {
    lines.push(`检索：${queryUsed}`);
  }

  lines.push(
    `标题：${title}`,
    `作者：${author}${userId ? `（${userId}）` : ''}`,
    source,
  );

  return lines.join('\n');
}

async function pickArtworkByQuery(query, preferredTerms = []) {
  const searchQuery = sanitizeText(query);
  if (!searchQuery) {
    throw new Error('search query is empty');
  }

  const firstPage = await fetchSearchPage(searchQuery, 1);
  if (!firstPage.items.length) {
    throw new Error(`关键词「${searchQuery}」没有搜到可用图片`);
  }

  const pages = uniqueRandomPages(firstPage.lastPage, MAX_ATTEMPTS);
  let lastError = null;
  let fallbackResult = null;

  for (const page of pages) {
    const pageData =
      page === 1
        ? firstPage
        : await fetchSearchPage(searchQuery, page).catch((error) => {
            lastError = error;
            return null;
          });
    if (!pageData?.items?.length) continue;

    const shuffled = [...pageData.items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (const item of shuffled.slice(0, 3)) {
      try {
        const detail = await fetchIllustrationDetail(item.id);
        if (!detail || Number(detail.illustType) === 2) continue;
        const image = await resolveArtworkImage(detail);
        if (!image) continue;
        const result = { query: searchQuery, detail, image };
        if (!fallbackResult) fallbackResult = result;
        if (detailMatchesPreferred(detail, preferredTerms)) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (fallbackResult) return fallbackResult;

  throw lastError || new Error(`关键词「${searchQuery}」没有找到可用图片`);
}

async function pickRandomArtwork(keyword) {
  const candidates = buildSearchCandidates(keyword);
  const preferredTerms = collectPreferredAliasTexts(keyword);
  let lastError = null;

  for (const query of candidates) {
    try {
      return await pickArtworkByQuery(query, preferredTerms);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`关键词「${sanitizeText(keyword) || '随机'}」没有找到可用图片`);
}

function buildSearchingNotice(keyword) {
  const label = sanitizeText(keyword, '随机') || '随机';
  return `正在搜索「${label}」的图片，请稍等…`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderPixivReply(keyword, session) {
  if (session?.send) {
    await session.send(buildSearchingNotice(keyword));
    await delay(250);
  }

  const result = await pickRandomArtwork(keyword);
  const caption = buildCaption(keyword, result.detail, result.query);
  return `${caption}\n${h.image(result.image.buffer, result.image.mime)}`;
}

module.exports = {
  name: 'pixiv-random',
  apply(ctx) {
    ctx.middleware(async (session, next) => {
      const content = sanitizeText(session.content, '');
      if (!content) return next();

      const prefix = content.startsWith('检车到来点')
        ? '检车到来点'
        : content.startsWith('检索到来点')
          ? '检索到来点'
          : content.startsWith('来点')
            ? '来点'
            : '';

      if (!prefix) return next();

      const keyword = sanitizeText(content.slice(prefix.length));
      ctx.logger('pixiv').info('triggered by %s keyword=%s', prefix, keyword || '(default)');

      try {
        return await renderPixivReply(keyword, session);
      } catch (error) {
        ctx.logger('pixiv').warn('middleware pixiv failed:', error);
        return `没找到可用图片：${error.message || error}`;
      }
    });

    ctx.command('pixiv [keyword:text]', '随机返回一张 Pixiv 图片')
      .alias('来点pixiv')
      .alias('来点')
      .alias('检车到来点')
      .alias('检索到来点')
      .alias('pixiv随机')
      .alias('p站')
      .example('pixiv 猫')
      .example('pixiv')
      .action(async ({ session }, keyword) => {
        try {
          return await renderPixivReply(keyword, session);
        } catch (error) {
          ctx.logger('pixiv').warn('pixiv failed:', error);
          return `没找到可用图片：${error.message || error}`;
        }
      });
  },
};
