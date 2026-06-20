const fs = require('fs');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const { h } = require('koishi');

const DEFAULT_BASE_URL = 'http://meme-generator:2233';
const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_KEYS_TTL = 10 * 60 * 1000;
const DEFAULT_INFO_TTL = 30 * 60 * 1000;
const DEFAULT_CATALOG_TTL = 30 * 60 * 1000;

const HELP_IMAGE_WIDTH = 1800;
const HELP_IMAGE_MARGIN = 44;
const HELP_IMAGE_COLUMNS = 5;
const HELP_CARD_HEIGHT = 92;
const HELP_CARD_GAP = 14;
const HELP_SECTION_HEADER_HEIGHT = 90;
const HELP_TITLE_HEIGHT = 118;
const HELP_FOOTER_HEIGHT = 88;

const COMMAND_PREFIXES = new Set(['meme', '生成', '表情', '梗图']);
const HELP_ALIASES = new Set(['help']);
const LIST_ALIASES = new Set(['list', 'ls']);
const INFO_ALIASES = new Set(['info', 'show']);
const PREVIEW_ALIASES = new Set(['preview']);

const MEDIA_PATTERN = /<at\s+id="(\d+)"\s*\/?>|<img\b[^>]*src="([^"]+)"[^>]*\/?>/gi;
const DISPLAY_NAME_OVERRIDES = new Map([
  ['out', '出局'],
  ['google', '谷歌'],
  ['pornhub', 'P站'],
  ['douyin', '抖音'],
  ['youtube', '油管'],
  ['intel_inside', '英特尔 inside'],
  ['osu', 'osu 音游'],
]);

const EXTRA_ALIAS_OVERRIDES = new Map([
  ['out', ['出局', '出界']],
  ['google', ['谷歌', '谷歌搜索']],
  ['pornhub', ['P站', 'p站', '黄站']],
  ['douyin', ['抖音', '抖音短视频', 'tiktok']],
  ['youtube', ['油管', '优兔', 'yt']],
  ['intel_inside', ['英特尔', 'intel', 'intel inside', '英特尔inside']],
  ['osu', ['osu!', '奥苏', '音游']],
]);

module.exports = {
  name: 'meme-generator',

  apply(ctx, config = {}) {
    const logger = ctx.logger('meme-generator');
    const baseUrl = String(config.baseUrl || process.env.MEME_GENERATOR_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const pageSize = Math.max(1, Number(config.pageSize || DEFAULT_PAGE_SIZE));
    const keysTtl = Math.max(30_000, Number(config.keysTtl || DEFAULT_KEYS_TTL));
    const infoTtl = Math.max(60_000, Number(config.infoTtl || DEFAULT_INFO_TTL));

    const keysCache = {
      value: [],
      loadedAt: 0,
      promise: null,
    };

    const infoCache = new Map();
    const catalogCache = {
      value: null,
      loadedAt: 0,
      promise: null,
    };
    const helpFontFamily = 'MemeHelpFont';
    const helpFontPath = '/app/fonts/FangZhengHeiTi_GBK.ttf';
    let helpFontRegistered = false;

    function ensureHelpFont() {
      if (helpFontRegistered) return;
      helpFontRegistered = true;
      try {
        if (fs.existsSync(helpFontPath)) {
          registerFont(helpFontPath, { family: helpFontFamily });
        }
      } catch (error) {
        logger.warn(`failed to register help font: ${error.message}`);
      }
    }

    function normalizeText(text) {
      return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function stripMediaTags(text) {
      return String(text || '')
        .replace(/<at\s+id="(\d+)"\s*\/?>/gi, ' ')
        .replace(/<img\b[^>]*\/?>/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function splitTokens(text) {
      return normalizeText(text).split(' ').filter(Boolean);
    }

    function parsePage(value) {
      const page = Number(value);
      return Number.isInteger(page) && page > 0 ? page : 1;
    }

    async function requestJson(resourcePath, init = {}) {
      const res = await fetch(`${baseUrl}${resourcePath}`, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init.headers || {}),
        },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
      }
      return await res.json();
    }

    async function requestBinary(resourcePath, init = {}) {
      const res = await fetch(`${baseUrl}${resourcePath}`, init);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
      }
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        mime: res.headers.get('content-type') || 'image/png',
      };
    }

    async function loadKeys(force = false) {
      const fresh = !force && keysCache.value.length && Date.now() - keysCache.loadedAt < keysTtl;
      if (fresh) return keysCache.value;
      if (keysCache.promise) return keysCache.promise;

      keysCache.promise = (async () => {
        const keys = await requestJson('/memes/keys');
        if (!Array.isArray(keys)) throw new Error('invalid meme key list');
        keysCache.value = keys.map((item) => String(item));
        keysCache.loadedAt = Date.now();
        return keysCache.value;
      })().finally(() => {
        keysCache.promise = null;
      });

      return keysCache.promise;
    }

    async function loadInfo(key) {
      const cacheKey = String(key);
      const cached = infoCache.get(cacheKey);
      if (cached && Date.now() - cached.loadedAt < infoTtl) {
        return cached.value;
      }
      const value = await requestJson(`/memes/${encodeURIComponent(cacheKey)}/info`);
      infoCache.set(cacheKey, { value, loadedAt: Date.now() });
      return value;
    }

    async function loadCatalog(force = false) {
      const fresh = !force && catalogCache.value && Date.now() - catalogCache.loadedAt < DEFAULT_CATALOG_TTL;
      if (fresh) return catalogCache.value;
      if (catalogCache.promise) return catalogCache.promise;

      catalogCache.promise = (async () => {
        const keys = await loadKeys(force);
        const infos = await Promise.all(keys.map((key) => loadInfo(key).catch((error) => {
          logger.warn(`failed to load meme catalog info for ${key}: ${error.message}`);
          return null;
        })));

        const items = keys.map((key, index) => {
          const info = infos[index];
          const params = info?.params_type || {};
          const imageCount = Number(params.min_images) || 0;
          const maxImages = Number(params.max_images) || 0;
          const textCount = Number(params.min_texts) || 0;
          const maxTexts = Number(params.max_texts) || 0;
          const needsImage = maxImages > 0 || imageCount > 0;
          const displayName = getDisplayName(key, info);
          return {
            key,
            displayName,
            info,
            needsImage,
            imageRange: formatRange(imageCount, maxImages),
            textRange: formatRange(textCount, maxTexts),
            keywords: formatKeywords(info?.keywords),
            shortcuts: formatShortcuts(info?.shortcuts),
            tags: formatTags(info?.tags),
            aliases: collectItemAliases(key, info, displayName),
          };
        });

        const aliasIndex = new Map();
        for (const item of items) {
          for (const alias of item.aliases) {
            if (!aliasIndex.has(alias)) {
              aliasIndex.set(alias, item.key);
            }
          }
        }

        const catalog = {
          all: items,
          textOnly: items.filter((item) => !item.needsImage),
          imageNeeded: items.filter((item) => item.needsImage),
          aliasIndex,
          loadedAt: Date.now(),
        };
        catalogCache.value = catalog;
        catalogCache.loadedAt = catalog.loadedAt;
        return catalog;
      })().finally(() => {
        catalogCache.promise = null;
      });

      return catalogCache.promise;
    }

    function normalizeCandidates(values) {
      return Array.isArray(values)
        ? values
            .flatMap((item) => {
              if (item == null) return [];
              if (typeof item === 'string' || typeof item === 'number') return [String(item)];
              if (typeof item === 'object') {
                return [item.key, item.humanized, item.name, item.value, item.text]
                  .filter((v) => v != null)
                  .map(String);
              }
              return [String(item)];
            })
            .map((item) => normalizeText(item).toLowerCase())
            .filter(Boolean)
        : [];
    }

    function isChineseText(value) {
      return /[\u3400-\u9fff]/.test(String(value || ''));
    }

    function getDisplayName(key, info) {
      const keywords = Array.isArray(info?.keywords) ? info.keywords.map((item) => String(item)).filter(Boolean) : [];
      const chineseKeyword = keywords.find((item) => isChineseText(item));
      if (chineseKeyword) return chineseKeyword;
      if (DISPLAY_NAME_OVERRIDES.has(key)) return DISPLAY_NAME_OVERRIDES.get(key);
      if (keywords[0]) return keywords[0];
      return String(key || '').replace(/[_-]+/g, ' ');
    }

    function normalizeAliasText(value) {
      return normalizeText(value).normalize('NFKC').toLowerCase();
    }

    function normalizeAliasVariants(value) {
      const normalized = normalizeAliasText(value);
      if (!normalized) return [];

      const variants = new Set([normalized]);
      variants.add(normalized.replace(/[\s_-]+/g, ''));
      variants.add(normalized.replace(/[\s-]+/g, '_'));
      variants.add(normalized.replace(/[_-]+/g, ' '));

      return [...variants].filter(Boolean);
    }

    function collectItemAliases(key, info, displayName) {
      const aliases = new Set();
      const add = (value) => {
        for (const variant of normalizeAliasVariants(value)) {
          if (variant) aliases.add(variant);
        }
      };

      add(key);
      add(displayName);
      add(String(key || '').replace(/[_-]/g, ' '));
      add(info?.name);

      const extraAliases = EXTRA_ALIAS_OVERRIDES.get(key);
      if (Array.isArray(extraAliases)) {
        for (const alias of extraAliases) add(alias);
      }

      if (Array.isArray(info?.keywords)) {
        for (const keyword of info.keywords) add(keyword);
      }

      if (Array.isArray(info?.shortcuts)) {
        for (const shortcut of info.shortcuts) {
          add(shortcut?.key);
          add(shortcut?.humanized);
          add(shortcut?.name);
          add(shortcut?.value);
          add(shortcut?.text);
        }
      }

      if (Array.isArray(info?.tags)) {
        for (const tag of info.tags) add(tag);
      }

      return [...aliases];
    }

    function stripAtMentions(text) {
      return normalizeText(text)
        .replace(/<at\s+id="(\d+)"\s*\/?>/gi, ' ')
        .replace(/\[CQ:at,qq=(\d+)\]/gi, ' ')
        .replace(/@[^\s]+(?:\s*\(\d+\))?/g, ' ')
        .replace(/\(\d+\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function readMessageSegments(session) {
      return Array.isArray(session?.event?.message)
        ? session.event.message
        : Array.isArray(session?.message)
          ? session.message
          : Array.isArray(session?.elements)
            ? session.elements
            : [];
    }

    function collectAtTargets(session) {
      const targets = [];
      const seen = new Set();
      const segments = readMessageSegments(session);
      for (const segment of segments) {
        if (!segment) continue;
        const type = String(segment.type || '').toLowerCase();
        if (type !== 'at') continue;
        const data = segment.data || {};
        const candidates = [
          data.id,
          data.qq,
          data.user_id,
          data.userId,
          data.uid,
          data.target,
        ];
        for (const candidate of candidates) {
          const value = normalizeText(candidate);
          if (!value || seen.has(value)) continue;
          seen.add(value);
          targets.push(value);
        }
      }

      if (!targets.length) {
        const rawText = normalizeText([
          session?.content,
          session?.event?.message?.content,
          session?.message?.content,
          session?.raw,
        ].filter(Boolean).join(' '));
        const textMatches = rawText.matchAll(/@[^@]*?(?:\((\d{5,})\)|(\d{5,}))/g);
        for (const match of textMatches) {
          const value = normalizeText(match[1] || match[2]);
          if (!value || seen.has(value)) continue;
          seen.add(value);
          targets.push(value);
        }
      }

      return targets;
    }

    const KEYWORD_OVERRIDES = new Map([
      ['\u9524', 'hammer'],
      ['\u6253\u9524', 'hammer'],
      ['\u8df3', 'jump'],
      ['\u6495', 'tear'],
      ['\u9876', 'top_notch'],
      ['\u9876\u5c16', 'top_notch'],
      ['\u8e22\u7403', 'kick_ball'],
      ['\u4e0a\u763e', 'addiction'],
      ['\u5bfb\u72d7\u542f\u793a', 'find_dog'],
      ['\u5bfb\u72d7\u542f\u4e8b', 'find_dog'],
      ['\u7c73\u54c8\u6e38', 'mihoyo'],
    ]);

    async function resolveKey(query) {
      const catalog = await loadCatalog().catch(() => null);
      const keys = catalog?.all?.map((item) => item.key) || await loadKeys();
      const normalized = normalizeAliasText(query);
      const candidates = normalizeAliasVariants(query);

      for (const candidate of candidates) {
        const directOverride = KEYWORD_OVERRIDES.get(candidate);
        if (directOverride) {
          const direct = keys.find((key) => key.toLowerCase() === directOverride.toLowerCase());
          if (direct) return direct;
        }
      }
      if (!normalized) return null;

      for (const candidate of candidates) {
        const direct = catalog?.aliasIndex?.get(candidate);
        if (direct) return direct;
      }

      const exact = keys.find((key) => key.toLowerCase() === normalized);
      if (exact) return exact;

      const matches = keys.filter((key) => {
        const lower = key.toLowerCase();
        return lower.includes(normalized) || normalized.includes(lower);
      });
      if (matches.length === 1) return matches[0];

      const infoMatches = [];
      for (const key of matches.length ? matches : keys) {
        try {
          const info = catalog?.all?.find((item) => item.key === key)?.info || await loadInfo(key);
          const aliases = [
            key,
            ...(Array.isArray(info?.keywords) ? info.keywords : []),
            ...normalizeCandidates(info?.shortcuts),
            ...normalizeCandidates(info?.tags),
          ].flatMap(normalizeAliasVariants).filter(Boolean);
          if (aliases.some((candidate) => candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate))) {
            infoMatches.push(key);
            if (infoMatches.length > 1) break;
          }
        } catch (error) {
          logger.warn(`failed to resolve meme key ${key}: ${error.message}`);
        }
      }

      if (infoMatches.length === 1) return infoMatches[0];

      return null;
    }

    function extractAtMentionText(session) {
      const segments = readMessageSegments(session);
      if (segments.length) {
        const textFromSegments = normalizeText(segments
          .filter((segment) => String(segment?.type || '').toLowerCase() === 'text')
          .map((segment) => segment?.data?.text || '')
          .join(' '));
        if (textFromSegments) return textFromSegments;
      }

      return stripAtMentions(String(session?.content || session?.event?.message?.content || session?.message?.content || session?.raw || ''));
    }

    function hasAtMention(session) {
      const segments = readMessageSegments(session);
      if (segments.some((segment) => String(segment?.type || '').toLowerCase() === 'at')) {
        return true;
      }

      const raw = normalizeText([
        session?.content,
        session?.event?.message?.content,
        session?.message?.content,
        session?.raw,
      ].filter(Boolean).join(' '));
      return /<at\s+id="\d+"\s*\/?>/i.test(raw)
        || /\[CQ:at,qq=\d+\]/i.test(raw)
        || /@[^@]*\(\d{5,}\)/.test(raw);
    }

    function formatRange(min, max) {
      const minNum = Number(min) || 0;
      const maxNum = Number(max) || 0;
      return maxNum > minNum ? `${minNum}~${maxNum}` : String(minNum);
    }

    function formatKeywords(keywords = []) {
      const items = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 6) : [];
      return items.length ? items.join(' / ') : '无';
    }

    function formatShortcuts(shortcuts = []) {
      const items = Array.isArray(shortcuts)
        ? shortcuts.map((item) => item?.humanized || item?.key).filter(Boolean).slice(0, 6)
        : [];
      return items.length ? items.join(' / ') : '无';
    }

    function formatTags(tags = []) {
      const items = Array.isArray(tags) ? tags.filter(Boolean).slice(0, 6) : [];
      return items.length ? items.join(' / ') : '无';
    }

    function truncateText(ctx, text, maxWidth) {
      const value = String(text || '');
      if (!value) return value;
      if (ctx.measureText(value).width <= maxWidth) return value;
      let result = '';
      for (const char of value) {
        const next = result + char;
        if (ctx.measureText(`${next}...`).width > maxWidth) break;
        result = next;
      }
      return `${result}...`;
    }

    function drawRoundRect(ctx, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
      const lines = [];
      let current = '';
      for (const char of String(text || '')) {
        const next = current + char;
        if (ctx.measureText(next).width > maxWidth && current) {
          lines.push(current);
          current = char;
          if (lines.length >= maxLines) break;
        } else {
          current = next;
        }
      }
      if (current && lines.length < maxLines) lines.push(current);
      if (lines.length > maxLines) lines.length = maxLines;
      for (let index = 0; index < lines.length; index += 1) {
        ctx.fillText(lines[index], x, y + index * lineHeight);
      }
      return lines.length;
    }

    async function renderCatalogImage(pageInput = 1) {
      ensureHelpFont();
      const catalog = await loadCatalog();
      const page = Math.max(1, Number(pageInput) || 1);
      const textPerPage = 10;
      const imagePerPage = 10;
      const textTotalPages = Math.max(1, Math.ceil(catalog.textOnly.length / textPerPage));
      const imageTotalPages = Math.max(1, Math.ceil(catalog.imageNeeded.length / imagePerPage));
      const activeTextPage = Math.min(textTotalPages, page);
      const activeImagePage = Math.min(imageTotalPages, page);
      const textItems = catalog.textOnly.slice((activeTextPage - 1) * textPerPage, activeTextPage * textPerPage);
      const imageItems = catalog.imageNeeded.slice((activeImagePage - 1) * imagePerPage, activeImagePage * imagePerPage);

      const imageColumns = HELP_IMAGE_COLUMNS;
      const cardWidth = Math.floor((HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2 - HELP_CARD_GAP * (imageColumns - 1)) / imageColumns);
      const textRows = Math.max(1, Math.ceil(textItems.length / imageColumns));
      const imageRows = Math.max(1, Math.ceil(imageItems.length / imageColumns));
      const textBlockHeight = HELP_SECTION_HEADER_HEIGHT + textRows * HELP_CARD_HEIGHT + Math.max(0, textRows - 1) * HELP_CARD_GAP + 18;
      const imageBlockHeight = HELP_SECTION_HEADER_HEIGHT + imageRows * HELP_CARD_HEIGHT + Math.max(0, imageRows - 1) * HELP_CARD_GAP + 18;
      const height = HELP_TITLE_HEIGHT + textBlockHeight + imageBlockHeight + HELP_FOOTER_HEIGHT + 40;

      const canvas = createCanvas(HELP_IMAGE_WIDTH, height);
      const ctx = canvas.getContext('2d');

      const bg = ctx.createLinearGradient(0, 0, HELP_IMAGE_WIDTH, height);
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(1, '#111827');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, HELP_IMAGE_WIDTH, height);

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 12; i += 1) {
        ctx.beginPath();
        ctx.arc(120 + i * 140, 90 + (i % 3) * 86, 50 + (i % 4) * 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = `bold 54px "${helpFontFamily}"`;
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('Meme 模板帮助', HELP_IMAGE_MARGIN, 72);
      ctx.font = `28px "${helpFontFamily}"`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('左侧是纯文本模板，右侧是需要头像 / 图片的模板。卡片里同时显示中文名和英文 key。', HELP_IMAGE_MARGIN, 116);

      let y = HELP_TITLE_HEIGHT;
      const sections = [
        {
          title: `文字模板 (${catalog.textOnly.length})`,
          subtitle: `当前页 ${activeTextPage}/${textTotalPages}，每页 ${textPerPage} 个`,
          items: textItems,
          accent: '#60a5fa',
        },
        {
          title: `图片 / 头像模板 (${catalog.imageNeeded.length})`,
          subtitle: `当前页 ${activeImagePage}/${imageTotalPages}，每页 ${imagePerPage} 个`,
          items: imageItems,
          accent: '#f97316',
        },
      ];

      for (const section of sections) {
        const sectionTop = y;
        const sectionHeight = section.title.includes('文字') ? textBlockHeight : imageBlockHeight;
        const sectionBottom = sectionTop + sectionHeight;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        drawRoundRect(ctx, HELP_IMAGE_MARGIN, sectionTop, HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2, sectionHeight, 28);
        ctx.fill();

        ctx.strokeStyle = `${section.accent}66`;
        ctx.lineWidth = 2;
        drawRoundRect(ctx, HELP_IMAGE_MARGIN, sectionTop, HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2, sectionHeight, 28);
        ctx.stroke();

        ctx.font = `bold 42px "${helpFontFamily}"`;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(section.title, HELP_IMAGE_MARGIN + 28, sectionTop + 58);
        ctx.font = `26px "${helpFontFamily}"`;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(section.subtitle, HELP_IMAGE_MARGIN + 28, sectionTop + 94);

        const items = section.items;
        const baseY = sectionTop + HELP_SECTION_HEADER_HEIGHT + 2;
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const col = index % imageColumns;
          const row = Math.floor(index / imageColumns);
          const x = HELP_IMAGE_MARGIN + col * (cardWidth + HELP_CARD_GAP);
          const cardY = baseY + row * (HELP_CARD_HEIGHT + HELP_CARD_GAP);

          ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
          drawRoundRect(ctx, x, cardY, cardWidth, HELP_CARD_HEIGHT, 20);
          ctx.fill();

          ctx.strokeStyle = `${section.accent}55`;
          ctx.lineWidth = 1.5;
          drawRoundRect(ctx, x, cardY, cardWidth, HELP_CARD_HEIGHT, 20);
          ctx.stroke();

          ctx.font = `bold 28px "${helpFontFamily}"`;
          ctx.fillStyle = '#f8fafc';
          ctx.fillText(truncateText(ctx, `${item.displayName} / ${item.key}`, cardWidth - 28), x + 16, cardY + 34);

          ctx.font = `22px "${helpFontFamily}"`;
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(`图 ${item.imageRange}  文 ${item.textRange}`, x + 16, cardY + 60);

          ctx.font = `18px "${helpFontFamily}"`;
          ctx.fillStyle = '#94a3b8';
          const keywordText = truncateText(ctx, `关键词 ${item.keywords || '无'}${item.shortcuts && item.shortcuts !== '无' ? ` | 快捷 ${item.shortcuts}` : ''}`, cardWidth - 28);
          ctx.fillText(keywordText, x + 16, cardY + 82);
        }

        y += sectionHeight + 18;
      }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      drawRoundRect(ctx, HELP_IMAGE_MARGIN, height - HELP_FOOTER_HEIGHT, HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2, HELP_FOOTER_HEIGHT - 6, 22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.stroke();

      ctx.font = `24px "${helpFontFamily}"`;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('常用命令：meme help | meme list | meme info <模板名> | meme preview <模板名> | meme <模板名> [文本...]', HELP_IMAGE_MARGIN + 24, height - 44);
      ctx.font = `20px "${helpFontFamily}"`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('遇到 @ 群友 时，优先把头像作为素材；如果模板本身不需要图，系统会直接按文本模板处理。', HELP_IMAGE_MARGIN + 24, height - 18);

      return h.image(canvas.toBuffer('image/png'), 'image/png');
    }

    async function renderCatalogImageV2() {
      ensureHelpFont();
      const catalog = await loadCatalog();
      const sections = [
        {
          title: '文字模板',
          subtitle: `无需图片，当前 ${catalog.textOnly.length} 个`,
          items: catalog.textOnly,
          accent: '#2563eb',
        },
        {
          title: '图片 / 头像模板',
          subtitle: `需要 @ 群友或上传图片，当前 ${catalog.imageNeeded.length} 个`,
          items: catalog.imageNeeded,
          accent: '#f97316',
        },
      ];

      const columns = 5;
      const columnGap = 18;
      const rowGap = 12;
      const headerHeight = 86;
      const titleHeight = 112;
      const footerHeight = 92;
      const cardHeight = 74;
      const sectionGap = 30;
      const sectionPadding = 20;
      const cardWidth = Math.floor((HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2 - columnGap * (columns - 1)) / columns);

      const sectionHeights = sections.map((section) => {
        const rows = Math.max(1, Math.ceil(section.items.length / columns));
        return headerHeight + rows * cardHeight + Math.max(0, rows - 1) * rowGap + sectionPadding;
      });

      const height = titleHeight + sectionHeights.reduce((sum, value) => sum + value, 0) + sectionGap * (sections.length - 1) + footerHeight + 32;
      const canvas = createCanvas(HELP_IMAGE_WIDTH, height);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, HELP_IMAGE_WIDTH, height);

      ctx.fillStyle = '#0f172a';
      ctx.font = `bold 56px "${helpFontFamily}"`;
      ctx.fillText('Meme 模板帮助', HELP_IMAGE_MARGIN, 74);
      ctx.font = `26px "${helpFontFamily}"`;
      ctx.fillStyle = '#475569';
      ctx.fillText('左边是纯文本模板，右边是需要头像或图片的模板。卡片里同时显示中文名和英文 key。', HELP_IMAGE_MARGIN, 120);

      let y = titleHeight;
      for (let index = 0; index < sections.length; index += 1) {
        const section = sections[index];
        const sectionHeight = sectionHeights[index];

        ctx.fillStyle = '#f8fafc';
        drawRoundRect(ctx, HELP_IMAGE_MARGIN, y, HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2, sectionHeight, 24);
        ctx.fill();
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        drawRoundRect(ctx, HELP_IMAGE_MARGIN, y, HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2, sectionHeight, 24);
        ctx.stroke();

        ctx.fillStyle = section.accent;
        ctx.fillRect(HELP_IMAGE_MARGIN + 20, y + 20, 8, 30);

        ctx.font = `bold 40px "${helpFontFamily}"`;
        ctx.fillStyle = '#111827';
        ctx.fillText(section.title, HELP_IMAGE_MARGIN + 40, y + 46);
        ctx.font = `24px "${helpFontFamily}"`;
        ctx.fillStyle = '#64748b';
        ctx.fillText(section.subtitle, HELP_IMAGE_MARGIN + 40, y + 82);

        const baseY = y + headerHeight;
        for (let itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) {
          const item = section.items[itemIndex];
          const col = itemIndex % columns;
          const row = Math.floor(itemIndex / columns);
          const x = HELP_IMAGE_MARGIN + col * (cardWidth + columnGap);
          const cardY = baseY + row * (cardHeight + rowGap);
          const keywordItems = Array.isArray(item.info?.keywords) ? item.info.keywords.filter(Boolean).slice(0, 6) : [];
          const shortcutItems = Array.isArray(item.info?.shortcuts)
            ? item.info.shortcuts.map((entry) => entry?.humanized || entry?.key).filter(Boolean).slice(0, 6)
            : [];
          const keywordText = keywordItems.length ? keywordItems.join(' / ') : '无';
          const shortcutText = shortcutItems.length ? shortcutItems.join(' / ') : '无';

          ctx.fillStyle = '#ffffff';
          drawRoundRect(ctx, x, cardY, cardWidth, cardHeight, 18);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          drawRoundRect(ctx, x, cardY, cardWidth, cardHeight, 18);
          ctx.stroke();

          ctx.font = `bold 22px "${helpFontFamily}"`;
          ctx.fillStyle = '#0f172a';
          ctx.fillText(truncateText(ctx, `${item.displayName} / ${item.key}`, cardWidth - 108), x + 14, cardY + 30);

          ctx.font = `18px "${helpFontFamily}"`;
          ctx.fillStyle = '#475569';
          ctx.textAlign = 'right';
          ctx.fillText(`图 ${item.imageRange}  文 ${item.textRange}`, x + cardWidth - 14, cardY + 30);
          ctx.textAlign = 'left';

          ctx.font = `17px "${helpFontFamily}"`;
          ctx.fillStyle = '#2563eb';
          const tailText = shortcutText !== '无' ? ` | 快捷 ${shortcutText}` : '';
          ctx.fillText(truncateText(ctx, `关键词 ${keywordText}${tailText}`, cardWidth - 28), x + 14, cardY + 56);
        }

        y += sectionHeight + sectionGap;
      }

      ctx.fillStyle = '#f8fafc';
      drawRoundRect(ctx, HELP_IMAGE_MARGIN, height - footerHeight, HELP_IMAGE_WIDTH - HELP_IMAGE_MARGIN * 2, footerHeight - 6, 20);
      ctx.fill();
      ctx.strokeStyle = '#e5e7eb';
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.font = `24px "${helpFontFamily}"`;
      ctx.fillText('常用命令：meme help | meme list | meme info <模板名> | meme preview <模板名> | meme <模板名> [文本...]', HELP_IMAGE_MARGIN + 24, height - 44);
      ctx.fillStyle = '#64748b';
      ctx.font = `20px "${helpFontFamily}"`;
      ctx.fillText('检索优先使用关键词，其次是快捷方式和标签；需要头像的模板请 @ 一位群友或上传图片。', HELP_IMAGE_MARGIN + 24, height - 18);

      return h.image(canvas.toBuffer('image/png'), 'image/png');
    }

    function formatListLine(key, info) {
      const params = info?.params_type || {};
      const imageRange = formatRange(params.min_images, params.max_images);
      const textRange = formatRange(params.min_texts, params.max_texts);
      const displayName = getDisplayName(key, info);
      return `- ${displayName} / ${key} | 图 ${imageRange} | 文 ${textRange} | 关键词 ${formatKeywords(info?.keywords)} | 快捷 ${formatShortcuts(info?.shortcuts)} | 标签 ${formatTags(info?.tags)}`;
    }

    function formatInfoText(key, info) {
      const params = info?.params_type || {};
      const displayName = getDisplayName(key, info);
      const lines = [
        `模板：${displayName} / ${key}`,
        `关键词：${formatKeywords(info?.keywords)}`,
        `快捷：${formatShortcuts(info?.shortcuts)}`,
        `标签：${formatTags(info?.tags)}`,
        `图片要求：${formatRange(params.min_images, params.max_images)}`,
        `文本要求：${formatRange(params.min_texts, params.max_texts)}`,
      ];

      if (Array.isArray(params.default_texts) && params.default_texts.length) {
        lines.push(`默认文本：${params.default_texts.join(' | ')}`);
      }

      if (params.args_type?.parser_options?.length) {
        lines.push('特殊参数：');
        for (const option of params.args_type.parser_options) {
          const names = Array.isArray(option.names) ? option.names.join(' | ') : '';
          const helpText = option.help_text ? ` - ${option.help_text}` : '';
          lines.push(`  * ${names}${helpText}`);
        }
      }

      return lines.join('\n');
    }

    function parseMediaSources(rawText) {
      const items = [];
      for (const match of String(rawText || '').matchAll(MEDIA_PATTERN)) {
        if (match[1]) {
          items.push({ type: 'at', value: match[1] });
        } else if (match[2]) {
          items.push({ type: 'image', value: match[2] });
        }
      }
      return items;
    }

    async function fetchAvatarBuffer(qqNumber) {
      const url = `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qqNumber)}&s=640`;
      const res = await fetch(url, {
        headers: {
          'user-agent': 'tsugu-koishi-meme-generator',
        },
      });
      if (!res.ok) {
        throw new Error(`头像下载失败: ${res.status} ${res.statusText}`);
      }
      return Buffer.from(await res.arrayBuffer());
    }

    async function fetchImageBuffer(source) {
      const text = String(source || '');
      if (!text) throw new Error('empty image source');

      if (text.startsWith('base64://')) {
        return Buffer.from(text.slice('base64://'.length), 'base64');
      }

      if (text.startsWith('data:')) {
        const index = text.indexOf(',');
        if (index === -1) throw new Error('invalid data url');
        const payload = text.slice(index + 1);
        return Buffer.from(payload, text.includes(';base64,') ? 'base64' : 'utf8');
      }

      if (text.startsWith('file://')) {
        return fs.readFileSync(text.slice('file://'.length));
      }

      const res = await fetch(text, {
        headers: {
          'user-agent': 'tsugu-koishi-meme-generator',
        },
      });
      if (!res.ok) {
        throw new Error(`图片下载失败: ${res.status} ${res.statusText}`);
      }
      return Buffer.from(await res.arrayBuffer());
    }

    function extractTextPayload(text) {
      return normalizeText(text).replace(/(?:^|\s)--args\s+.+$/, '').trim();
    }

    function extractArgs(text) {
      const raw = normalizeText(text);
      const match = raw.match(/(?:^|\s)--args\s+(.+)$/);
      if (!match) return {};

      const value = match[1].trim();
      if (!value) return {};

      try {
        return JSON.parse(value);
      } catch {
        const result = {};
        for (const pair of value.split(/\s+/).filter(Boolean)) {
          const index = pair.indexOf('=');
          if (index === -1) continue;
          const key = pair.slice(0, index).trim();
          const val = pair.slice(index + 1).trim();
          if (key) result[key] = val;
        }
        return result;
      }
    }

    function extractTexts(text, params) {
      const raw = extractTextPayload(text);
      const min = Number(params.min_texts) || 0;
      const max = Number(params.max_texts) || 0;
      const defaults = Array.isArray(params.default_texts) ? params.default_texts.filter(Boolean) : [];

      if (min === 0 && max === 0) {
        return [];
      }

      if (!raw) {
        if (defaults.length >= min && (max === 0 || defaults.length <= max)) {
          return defaults;
        }
        return [];
      }

      if (raw.includes('|')) {
        const parts = raw.split('|').map((item) => item.trim()).filter(Boolean);
        if (max > 0 && parts.length > max) return null;
        if (parts.length < min) return null;
        return parts;
      }

      if (max <= 1) {
        return [raw];
      }

      const chunks = raw.split(/\s+/).filter(Boolean);
      if (chunks.length >= min && (max === 0 || chunks.length <= max)) {
        return chunks;
      }

      return null;
    }

    async function collectImages(rawText, maxImages) {
      const items = parseMediaSources(rawText);
      const buffers = [];

      for (const item of items) {
        try {
          if (item.type === 'at') {
            buffers.push(await fetchAvatarBuffer(item.value));
          } else {
            buffers.push(await fetchImageBuffer(item.value));
          }
        } catch (error) {
          logger.warn(`failed to load meme image source: ${error.message}`);
        }

        if (maxImages > 0 && buffers.length >= maxImages) break;
      }

      return buffers;
    }

    async function collectAtAvatarBuffers(session, maxImages) {
      const buffers = [];
      const targets = collectAtTargets(session);
      for (const target of targets) {
        try {
          buffers.push(await fetchAvatarBuffer(target));
        } catch (error) {
          logger.warn(`failed to load @ avatar ${target}: ${error.message}`);
        }
        if (maxImages > 0 && buffers.length >= maxImages) break;
      }
      return buffers;
    }

    async function listPage() {
      return await renderCatalogImageV2();
    }

    async function renderHelpPage() {
      return await renderCatalogImageV2();
    }

    async function renderInfo(query) {
      const key = await resolveKey(query);
      if (!key) {
        const keys = await loadKeys();
        const needle = normalizeText(query).toLowerCase();
        const candidates = keys.filter((item) => item.toLowerCase().includes(needle)).slice(0, 8);
        if (candidates.length) {
          return `未找到完全匹配的模板：${query}\n你可以试试：\n${candidates.map((item) => `- ${item}`).join('\n')}`;
        }
        return `未找到模板：${query}`;
      }

      const info = await loadInfo(key);
      return formatInfoText(key, info);
    }

    async function renderPreview(query) {
      const key = await resolveKey(query);
      if (!key) return `未找到模板：${query}`;
      const { buffer, mime } = await requestBinary(`/memes/${encodeURIComponent(key)}/preview`);
      return h.image(buffer, mime);
    }

    async function renderMeme(query, textPart, rawMessage, session) {
      const key = await resolveKey(query);
      if (!key) {
        const keys = await loadKeys().catch(() => []);
        const needle = normalizeText(query).toLowerCase();
        const candidates = keys.filter((item) => item.toLowerCase().includes(needle)).slice(0, 8);
        if (candidates.length) {
          return `未找到完全匹配的模板：${query}\n你可以试试：\n${candidates.map((item) => `- ${item}`).join('\n')}`;
        }
        return `未找到模板：${query}\n发送 meme help 查看可用模板`;
      }

      const info = await loadInfo(key);
      const params = info?.params_type || {};
      const textSource = normalizeText(textPart);
      const texts = extractTexts(textSource, params);
      if (texts === null) {
        return `模板 ${key} 的文本数量不匹配，请使用 | 分隔多段文本`;
      }

      const minImages = Number(params.min_images) || 0;
      const maxImages = Number(params.max_images) || 0;
      const images = [];
      if (minImages > 0 || maxImages > 0) {
        const atBuffers = await collectAtAvatarBuffers(session, maxImages);
        images.push(...atBuffers);
        if (maxImages <= 0 || images.length < maxImages) {
          const remaining = maxImages > 0 ? Math.max(0, maxImages - images.length) : maxImages;
          const fallbackBuffers = await collectImages(rawMessage || textSource, remaining);
          images.push(...fallbackBuffers);
        }
      }
      if (images.length < minImages) {
        return `模板 ${key} 需要至少 ${minImages} 张图，请 @ 群友或上传图片后再试`;
      }

      const minTexts = Number(params.min_texts) || 0;
      const maxTexts = Number(params.max_texts) || 0;
      if (texts.length < minTexts) {
        return `模板 ${key} 需要至少 ${minTexts} 段文本`;
      }
      if (maxTexts > 0 && texts.length > maxTexts) {
        return `模板 ${key} 最多只能填写 ${maxTexts} 段文本`;
      }

      const form = new FormData();
      images.forEach((buffer, index) => {
        form.append('images', new Blob([buffer]), `image-${index + 1}.png`);
      });
      texts.forEach((text) => {
        form.append('texts', text);
      });
      form.append('args', JSON.stringify(extractArgs(textSource)));

      const res = await fetch(`${baseUrl}/memes/${encodeURIComponent(key)}/`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return `模板 ${key} 生成失败：${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || 'image/png';
      return h.image(buffer, mime);
    }

    async function handleTextInput(session, input, rawMessage = '') {
      const normalized = normalizeText(input);
      logger.info(`text-input raw=${JSON.stringify(String(input || ''))} normalized=${JSON.stringify(normalized)}`);
      if (!normalized) {
        return await listPage(1);
      }

      const [head, ...rest] = splitTokens(normalized);
      const tail = rest.join(' ');

      if (HELP_ALIASES.has(head)) {
        const page = parsePage(rest[0]);
        const list = await listPage(page);
        return [
          'Meme 使用说明',
          'meme help [页码]：查看帮助与模板列表',
          'meme list [页码]：分页查看全部模板',
          'meme info <模板名>：查看模板详情',
          'meme preview <模板名>：查看模板预览',
          'meme <模板名> [文本...]：生成 meme',
          '@某人 <模板名> [文本...]：直接用群友头像生成',
          '多段文本请使用 | 分隔',
          '',
          list,
        ].join('\n');
      }

      if (LIST_ALIASES.has(head)) {
        return await renderHelpPage();
      }

      if (INFO_ALIASES.has(head)) {
        if (!tail) return '请提供模板名，例如：meme info slap';
        return await renderInfo(tail);
      }

      if (PREVIEW_ALIASES.has(head)) {
        if (!tail) return '请提供模板名，例如：meme preview slap';
        return await renderPreview(tail);
      }

      if (head === 'help') {
        return await renderHelpPage();
      }

      if (COMMAND_PREFIXES.has(head)) {
        if (!tail) return '请提供模板名，例如：meme slap';
        const [nextHead, ...nextRest] = splitTokens(tail);
        return await handleTextInput(session, [nextHead, ...nextRest].join(' '), rawMessage || input);
      }

      logger.info(`render-meme head=${JSON.stringify(head)} tail=${JSON.stringify(tail)} raw=${JSON.stringify(String(rawMessage || ''))}`);
      return await renderMeme(head, tail, rawMessage || input, session);
    }

    async function handleAtMessage(session) {
      const raw = String(session.content || '');
      logger.info(`at-message raw=${JSON.stringify(raw)} hasAt=${hasAtMention(session)} cleaned=${JSON.stringify(extractAtMentionText(session))}`);
      if (!hasAtMention(session)) return null;

      const cleaned = extractAtMentionText(session);
      if (!cleaned) return null;

      const [head, ...rest] = splitTokens(cleaned);
      logger.info(`at-message head=${JSON.stringify(head)} rest=${JSON.stringify(rest)}`);
      if (!head) return null;

      if (COMMAND_PREFIXES.has(head)) {
        const payload = rest.join(' ');
        if (!payload) return null;
        return await handleTextInput(session, payload, raw);
      }

      const key = await resolveKey(head);
      logger.info(`at-message resolved=${JSON.stringify(key)} from=${JSON.stringify(head)}`);
      if (!key) return null;

      const payload = rest.join(' ');
      return await renderMeme(key, payload, raw, session);
    }

    ctx.command('meme [input:text]', '生成 meme、查看模板帮助与预览')
      .usage([
        'meme help [页码]        -> 查看帮助与模板列表',
        'meme list [页码]        -> 分页查看全部模板',
        'meme info <模板名>      -> 查看模板详情',
        'meme preview <模板名>   -> 查看模板预览',
        'meme <模板名> [文本...] -> 生成 meme',
        '@某人 <模板名> [文本...] -> 直接用群友头像生成',
      ].join('\n'))
      .action(async ({ session }, input) => handleTextInput(session, input));

    ctx.middleware(async (session, next) => {
      logger.info(`middleware probe raw=${JSON.stringify(String(session.content || ''))} hasAt=${hasAtMention(session)}`);
      if (!hasAtMention(session)) return next();

      try {
        const result = await handleAtMessage(session);
        if (result) {
          if (typeof session?.send === 'function') {
            return await session.send(result);
          }
          return result;
        }
      } catch (error) {
        logger.warn(`middleware error: ${error.message}`);
        return `Meme 处理失败：${error.message}`;
      }

      return next();
    });

    // 预热失败不影响功能，避免容器启动阶段刷警告
    loadKeys().catch(() => {});
  },
};
