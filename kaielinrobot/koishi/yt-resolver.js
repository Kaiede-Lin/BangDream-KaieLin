const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { h } = require('koishi');

const DEFAULTS = {
  resolverUrl: 'http://yt-resolver:8088',
  resolveTimeoutMs: 30 * 60 * 1000,
  pollIntervalMs: 2000,
  groupCooldownMs: 5 * 60 * 1000,
  duplicateTtlMs: 10 * 60 * 1000,
  keepMediaAfterSend: false,
};

const HOST_PATTERNS = [
  /(^|\.)bilibili\.com$/i,
  /(^|\.)b23\.tv$/i,
  /(^|\.)douyin\.com$/i,
  /(^|\.)iesdouyin\.com$/i,
  /(^|\.)kuaishou\.com$/i,
  /(^|\.)kuaishou\.cn$/i,
  /(^|\.)xhslink\.com$/i,
  /(^|\.)xiaohongshu\.com$/i,
  /(^|\.)weibo\.com$/i,
  /(^|\.)weishi\.qq\.com$/i,
  /(^|\.)acfun\.cn$/i,
  /(^|\.)ixigua\.com$/i,
  /(^|\.)toutiao\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)tiktok\.com$/i,
];

const SHORTENER_HOST_PATTERNS = [
  /(^|\.)b23\.tv$/i,
  /(^|\.)xhslink\.com$/i,
  /(^|\.)v\.douyin\.com$/i,
  /(^|\.)mqqapi\.qq\.com$/i,
  /(^|\.)c\.pc\.qq\.com$/i,
];

const BARE_URL_PATTERNS = [
  /\b(b23\.tv\/[A-Za-z0-9_-]+)\b/gi,
  /\b(v\.douyin\.com\/[A-Za-z0-9_-]+)\b/gi,
  /\b(xhslink\.com\/[A-Za-z0-9_-]+)\b/gi,
  /\b(www\.[^\s<>"'`]+\.[a-z]{2,}[^\s<>"'`]*)/gi,
];

const WRAPPER_PARAM_KEYS = new Set([
  'url',
  'u',
  'targeturl',
  'target_url',
  'jumpurl',
  'jump_url',
  'shareurl',
  'share_url',
  'pfurl',
  'innerurl',
  'inner_url',
  'redirect',
  'redirect_url',
  'rurl',
  'link',
  'dest',
  'destination',
  'srcurl',
  'src_url',
  'surl',
]);

function normalizeUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    url.hash = '';
    return url.toString();
  } catch {
    return String(raw || '').trim();
  }
}

function safeDecodeURIComponent(input) {
  try {
    return decodeURIComponent(String(input));
  } catch {
    return String(input);
  }
}

function isLikelyUrlText(text) {
  return /https?:\/\/|^[a-z][a-z0-9+.-]*:\/\/|%3A%2F%2F|\\\//i.test(String(text || ''));
}

function collectUrlSearchVariants(text) {
  const seed = String(text || '').trim();
  const queue = [seed];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current) || seen.size > 20) continue;
    seen.add(current);

    const htmlDecoded = current
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (htmlDecoded !== current) queue.push(htmlDecoded);

    const slashDecoded = current.replace(/\\\//g, '/');
    if (slashDecoded !== current) queue.push(slashDecoded);

    if (/%[0-9A-Fa-f]{2}/.test(current)) {
      const decoded = safeDecodeURIComponent(current);
      if (decoded !== current) queue.push(decoded);
    }

    if ((current.startsWith('{') && current.endsWith('}')) || (current.startsWith('[') && current.endsWith(']'))) {
      try {
        queue.push(JSON.stringify(JSON.parse(current)));
      } catch {
        // ignore malformed JSON-like text
      }
    }
  }

  return [...seen];
}

function extractUrlsFromText(text) {
  const result = [];
  const variants = collectUrlSearchVariants(text);
  const regex = /(?:https?|mqqapi|qqdoc|qqmusic|weixin|alipays|mqqwpa):\/\/[^\s<>"'`]+/gi;

  for (const input of variants) {
    let match;
    while ((match = regex.exec(input))) {
      const url = normalizeUrl(match[0].replace(/[)\],.。！？!?]+$/g, ''));
      if (url) result.push(url);
    }
    for (const pattern of BARE_URL_PATTERNS) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(input))) {
        const candidate = match[1] || match[0];
        const url = normalizeUrl(`https://${candidate.replace(/[)\],.。！？!?]+$/g, '')}`);
        if (url) result.push(url);
      }
    }
  }

  return [...new Set(result)];
}

function expandWrappedUrl(url, seen = new Set(), depth = 0, out = []) {
  if (!url || depth > 4) return out;

  const normalized = normalizeUrl(url);
  if (!normalized || seen.has(normalized)) return out;
  seen.add(normalized);
  out.push(normalized);

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return out;
  }

  for (const [key, value] of parsed.searchParams.entries()) {
    const decoded = safeDecodeURIComponent(value).replace(/\\\//g, '/');
    const keyLower = key.toLowerCase();
    if (!decoded) continue;

    const looksLikeUrl = isLikelyUrlText(decoded) || WRAPPER_PARAM_KEYS.has(keyLower);
    if (!looksLikeUrl) continue;

    const nested = extractUrlsFromText(decoded);
    for (const nestedUrl of nested) {
      expandWrappedUrl(nestedUrl, seen, depth + 1, out);
    }
  }

  const decodedWhole = safeDecodeURIComponent(normalized).replace(/\\\//g, '/');
  if (decodedWhole !== normalized && isLikelyUrlText(decodedWhole)) {
    for (const nestedUrl of extractUrlsFromText(decodedWhole)) {
      expandWrappedUrl(nestedUrl, seen, depth + 1, out);
    }
  }

  return out;
}

function collectStrings(value, out = [], depth = 0) {
  if (value == null || depth > 6 || out.length > 200) return out;
  if (typeof value === 'string') {
    out.push(value);
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        collectStrings(JSON.parse(trimmed), out, depth + 1);
      } catch {
        // ignore malformed JSON-like text
      }
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
  }
  return out;
}

function extractCandidateUrls(session) {
  const urls = [];
  const segments = Array.isArray(session.event?.message)
    ? session.event.message
    : Array.isArray(session.message)
      ? session.message
      : Array.isArray(session.elements)
        ? session.elements
        : [];

  for (const segment of segments) {
    const type = String(segment?.type || '').toLowerCase();
    const data = segment?.data || {};
    const payloads = [];

    if (type === 'text') {
      payloads.push(data.text);
    } else if (type === 'share') {
      payloads.push(data.url, data.title, data.content, data.image);
    } else if (type === 'music') {
      payloads.push(data.url, data.audio, data.title, data.content, data.image);
    } else if (type === 'json' || type === 'xml') {
      payloads.push(data.data, data.text, data.url);
      if (typeof data.data === 'string' && type === 'json') {
        try {
          payloads.push(...collectStrings(JSON.parse(data.data)));
        } catch {
          // ignore
        }
      }
    } else {
      payloads.push(...collectStrings(data));
    }

    for (const payload of payloads.filter(Boolean)) {
      const extracted = extractUrlsFromText(payload);
      for (const url of extracted) {
        urls.push(...expandWrappedUrl(url));
      }
    }
  }

  if (!urls.length) {
    const fallback = collectStrings({
      content: session.content,
      quote: session.quote,
      raw: session.raw,
      event: session.event,
    }).filter(Boolean);
    for (const blob of fallback) {
      for (const url of extractUrlsFromText(blob)) {
        urls.push(...expandWrappedUrl(url));
      }
    }
  }

  return [...new Set(urls)]
    .map((url) => normalizeUrl(url))
    .filter(Boolean)
    .filter((url) => !/^(?:https?:\/\/)?(?:q\.qlogo\.cn|multimedia\.nt\.qq\.com\.cn|open\.gtimg\.cn|qq\.ugcimg\.cn)\b/i.test(url));
}

function isSupportedUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HOST_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function isShortenerUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SHORTENER_HOST_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function compareResolvedUrls(a, b) {
  const aShort = isShortenerUrl(a) ? 1 : 0;
  const bShort = isShortenerUrl(b) ? 1 : 0;
  if (aShort !== bShort) return aShort - bShort;
  return b.length - a.length;
}

function formatDuration(duration) {
  const total = Number(duration || 0);
  if (!Number.isFinite(total) || total <= 0) return 'unknown';
  const sec = Math.floor(total % 60);
  const min = Math.floor((total / 60) % 60);
  const hour = Math.floor(total / 3600);
  if (hour > 0) return `${hour}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function truncateText(text, limit = 120) {
  const str = String(text || '').trim();
  if (str.length <= limit) return str;
  return `${str.slice(0, limit - 1)}…`;
}

function shortUrlForLog(url, limit = 180) {
  const str = String(url || '').trim();
  if (str.length <= limit) return str;
  return `${str.slice(0, limit - 1)}…`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || body || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data;
}

async function resolveJob(baseUrl, url, timeoutMs, pollIntervalMs) {
  const submitted = await httpJson(`${baseUrl}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: { 'content-type': 'application/json' },
  });

  const jobId = submitted.id;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await httpJson(`${baseUrl}/job/${jobId}`);
    if (job.status === 'done') return job;
    if (job.status === 'failed') throw new Error(job.error || 'resolve failed');
    await sleep(pollIntervalMs);
  }

  throw new Error('resolve timeout');
}

async function consumeJob(resolverUrl, jobId) {
  if (!jobId) return;
  await httpJson(`${resolverUrl}/job/${jobId}/consume`, {
    method: 'POST',
  });
}

function isGroupSession(session) {
  const channelId = String(session.channelId || session.event?.channel?.id || '');
  const guildId = String(session.guildId || session.event?.guild?.id || '');
  return /^\d{6,}$/.test(channelId) || /^\d{6,}$/.test(guildId);
}

function getChannelId(session) {
  return String(session.channelId || session.event?.channel?.id || session.guildId || session.event?.guild?.id || '');
}

function makeFingerprint(channelId, url) {
  return crypto.createHash('sha1').update(`${channelId}|${url}`).digest('hex');
}

function buildForwardMessage(session, job, sourceUrl) {
  const author = {
    id: String(session.selfId || 'yt-resolver'),
    name: '视频解析',
  };

  const summaryMessage = h(
    'message',
    {},
    h('author', author),
    [
      `标题：${truncateText(job.title || 'unknown')}`,
      `作者：${truncateText(job.uploader || 'unknown')}`,
      `平台：${truncateText(job.platform || 'unknown')}`,
      `时长：${formatDuration(job.duration)}`,
      `原链接：${sourceUrl}`,
    ].join('\n'),
  );

  const resultMessage = h(
    'message',
    {},
    h('author', author),
    '视频已解析完成，下面是可直接观看的完整视频。',
  );

  return h('message', { forward: true }, summaryMessage, resultMessage);
}

async function sendSummary(session, job, sourceUrl) {
  try {
    await session.send(buildForwardMessage(session, job, sourceUrl));
  } catch {
    const summary = [
      '视频解析完成',
      `标题：${job.title || 'unknown'}`,
      `作者：${job.uploader || 'unknown'}`,
      `平台：${job.platform || 'unknown'}`,
      `时长：${formatDuration(job.duration)}`,
      `原链接：${sourceUrl}`,
    ].join('\n');
    await session.send(summary);
    if (job.thumbnailPath) {
      try {
        await session.send(h.image(`file://${path.resolve(job.thumbnailPath)}`));
      } catch {
        // ignore thumbnail failures
      }
    }
  }
}

async function sendVideo(session, job) {
  if (!job.mediaPath) throw new Error('media is not ready');
  await session.send(h.video(`file://${path.resolve(job.mediaPath)}`));
}

async function processVideoJob(session, logger, resolverUrl, resolveTimeoutMs, pollIntervalMs, sourceUrl, keepMediaAfterSend) {
  const startedAt = Date.now();
  try {
    const job = await resolveJob(resolverUrl, sourceUrl, resolveTimeoutMs, pollIntervalMs);
    const resolveElapsed = Date.now() - startedAt;
    logger.info(`job done: url=${shortUrlForLog(sourceUrl)} elapsed=${resolveElapsed}ms title=${truncateText(job.title || 'unknown', 60)}`);

    const mediaPath = job.mediaPath ? path.resolve(job.mediaPath) : '';
    if (!mediaPath || !fs.existsSync(mediaPath)) {
      throw new Error('resolved media file not found');
    }

    await sendSummary(session, { ...job, mediaPath }, sourceUrl);
    const uploadStartedAt = Date.now();
    await sendVideo(session, { ...job, mediaPath });
    logger.info(`video sent: url=${shortUrlForLog(sourceUrl)} resolve=${resolveElapsed}ms upload=${Date.now() - uploadStartedAt}ms total=${Date.now() - startedAt}ms`);

    if (!keepMediaAfterSend) {
      try {
        await consumeJob(resolverUrl, job.id);
        logger.info(`cache consumed: job=${job.id} url=${shortUrlForLog(sourceUrl)}`);
      } catch (error) {
        logger.warn(`cache consume failed: ${error.message}`);
      }
    }
  } catch (error) {
    logger.warn(`auto resolve failed: ${error.message}`);
    try {
      await session.send(`视频解析失败：${error.message}`);
    } catch {
      // ignore
    }
  }
}

module.exports = {
  name: 'yt-resolver',

  apply(ctx, config = {}) {
    const logger = ctx.logger('yt-resolver');
    const resolverUrl = String(config.resolverUrl || process.env.YT_RESOLVER_URL || DEFAULTS.resolverUrl).replace(/\/+$/, '');
    const resolveTimeoutMs = Number(config.resolveTimeoutMs || process.env.YT_RESOLVE_TIMEOUT_MS || DEFAULTS.resolveTimeoutMs);
    const pollIntervalMs = Number(config.pollIntervalMs || process.env.YT_RESOLVE_POLL_INTERVAL_MS || DEFAULTS.pollIntervalMs);
    const groupCooldownMs = Number(config.groupCooldownMs || process.env.YT_GROUP_COOLDOWN_MS || DEFAULTS.groupCooldownMs);
    const duplicateTtlMs = Number(config.duplicateTtlMs || process.env.YT_DUPLICATE_TTL_MS || DEFAULTS.duplicateTtlMs);
    const keepMediaAfterSend = toBoolean(config.keepMediaAfterSend ?? process.env.YT_KEEP_MEDIA_AFTER_SEND, DEFAULTS.keepMediaAfterSend);

    const seen = new Map();
    const cooldown = new Map();

    setInterval(() => {
      const seenThreshold = Date.now() - duplicateTtlMs;
      for (const [key, value] of seen) {
        if (value < seenThreshold) seen.delete(key);
      }
      const cooldownThreshold = Date.now() - groupCooldownMs;
      for (const [key, value] of cooldown) {
        if (value < cooldownThreshold) cooldown.delete(key);
      }
    }, 60_000);

    ctx.middleware(async (session, next) => {
      try {
        if (!isGroupSession(session)) return next();

        const channelId = getChannelId(session);
        const candidates = extractCandidateUrls(session);
        logger.info(`inspect message: channel=${channelId} candidates=${candidates.length}`);
        if (candidates.length) {
          logger.info(`candidate urls: ${candidates.slice(0, 5).map((url) => shortUrlForLog(url)).join(' | ')}`);
        }

        const urls = candidates.filter(isSupportedUrl).sort(compareResolvedUrls);
        logger.info(`supported urls: ${urls.length}`);
        if (!urls.length) return next();

        const url = urls[0];
        const fingerprint = makeFingerprint(channelId, url);
        const now = Date.now();
        const lastSeen = seen.get(fingerprint);
        const lastCooldown = cooldown.get(channelId);
        if (lastSeen && now - lastSeen < duplicateTtlMs) return '';
        if (lastCooldown && now - lastCooldown < groupCooldownMs) return '';

        seen.set(fingerprint, now);
        cooldown.set(channelId, now);

        await session.send('收到，正在解析完整视频，请稍等。');
        void processVideoJob(session, logger, resolverUrl, resolveTimeoutMs, pollIntervalMs, url, keepMediaAfterSend);
        return '';
      } catch (error) {
        logger.warn(`auto resolve failed: ${error.message}`);
        try {
          await session.send(`视频解析失败：${error.message}`);
        } catch {
          // ignore
        }
        return '';
      }
    });
  },
};
