const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const svg2img = require('svg2img');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { h } = require('koishi');

const TIME_ZONE = 'Asia/Shanghai';
const CACHE_DIR = '/app/data/jrlp-cache';
const ASSET_DIR = path.join(CACHE_DIR, 'assets');
const BESTDORI_URL = 'https://bestdori.com';
const STAR_ICON_URL = `${BESTDORI_URL}/res/icon/star_trained.png`;

const OUTPUT_SIZE = 1000;
const BASE_SIZE = 72;
const SCALE = OUTPUT_SIZE / BASE_SIZE;

const COVER_SIZE = 66.5;
const COVER_OFFSET = 3;
const FRAME_SIZE = 72;
const BAND_SIZE = 20;
const ATTR_SIZE = 18;
const STAR_SIZE = 12;
const BAND_X = 0;
const BAND_Y = 0.71875;
const ATTR_X = 53.28125;
const ATTR_Y = 1.4375;
const STAR_X = 1.4375;
const STAR_Y = [57.59375, 48.59375, 39.59375, 30.59375, 21.59375];
const AVATAR_ZOOM = 1;

const PRESETS = [
  { id: 'morfonica-pure', bandId: 21, attribute: 'pure' },
  { id: 'roselia-cool', bandId: 4, attribute: 'cool' },
  { id: 'ppp-happy', bandId: 1, attribute: 'happy' },
  { id: 'ag-powerful', bandId: 2, attribute: 'powerful' },
  { id: 'hhw-happy', bandId: 5, attribute: 'happy' },
  { id: 'pastel-pure', bandId: 3, attribute: 'pure' },
];

try {
  registerFont('/app/fonts/FangZhengHeiTi_GBK.ttf', { family: 'FangZhengHeiTi' });
} catch (_) {}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function dateInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getChannelId(session) {
  return String(
    session?.guildId ||
      session?.channelId ||
      session?.groupId ||
      session?.event?.group_id ||
      session?.event?.channel?.id ||
      '',
  );
}

function isGroupChannel(session) {
  return /^\d{5,}$/.test(getChannelId(session));
}

function safeString(value, fallback = '') {
  const text = value == null ? fallback : String(value);
  return text.trim() || fallback;
}

function isDigits(value) {
  return /^\d+$/.test(String(value || ''));
}

function hashKey(input) {
  return crypto.createHash('md5').update(String(input)).digest('hex');
}

function assetFilePath(url, ext = '.bin') {
  return path.join(ASSET_DIR, `${hashKey(url)}${ext}`);
}

function svgToPng(svgBuffer) {
  return new Promise((resolve, reject) => {
    svg2img(svgBuffer.toString('utf8'), { format: 'png' }, (err, buffer) => {
      if (err) return reject(err);
      resolve(buffer);
    });
  });
}

async function readOrDownload(url) {
  ensureDir(ASSET_DIR);
  const parsed = new URL(url);
  const isSvg = parsed.pathname.toLowerCase().endsWith('.svg');
  const cachePath = assetFilePath(url, isSvg ? '.png' : path.extname(parsed.pathname) || '.bin');
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath);

  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  let buffer = Buffer.from(resp.data);
  const contentType = String(resp.headers?.['content-type'] || '').toLowerCase();
  const shouldConvertSvg = isSvg || contentType.includes('image/svg') || contentType.includes('image/svg+xml');

  if (shouldConvertSvg) {
    buffer = await svgToPng(buffer);
  }

  fs.writeFileSync(cachePath, buffer);
  return buffer;
}

async function loadRemoteImage(url) {
  const buffer = await readOrDownload(url);
  return await loadImage(buffer);
}

function qqAvatarUrl(qqNumber) {
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(String(qqNumber))}&s=640`;
}

function pickFirst(...values) {
  for (const value of values) {
    const text = safeString(value, '');
    if (text) return text;
  }
  return '';
}

function normalizeMember(member, botSelfId) {
  const id = pickFirst(
    member?.id,
    member?.userId,
    member?.uid,
    member?.tiny_id,
    member?.user?.id,
    member?.user?.userId,
    member?.user?.tiny_id,
    member?.user?.tinyId,
  );
  if (!id) return null;

  const groupName = pickFirst(
    member?.nick,
    member?.card,
    member?.groupNick,
    member?.group_name,
    member?.groupName,
    member?.groupCard,
    member?.remark,
    member?.title,
    member?.user?.card,
    member?.user?.nick,
    member?.user?.groupNick,
    member?.user?.group_name,
    member?.user?.groupName,
    member?.user?.remark,
  );

  const qqName = pickFirst(
    member?.name,
    member?.nickname,
    member?.username,
    member?.user?.name,
    member?.user?.nickname,
    member?.user?.username,
    member?.user?.nick,
    member?.title,
    id,
  );

  const avatarUrl = pickFirst(
    isDigits(id) ? qqAvatarUrl(id) : '',
    member?.avatarUrl,
    member?.avatar,
    member?.user?.avatarUrl,
    member?.user?.avatar,
    member?.user?.headImgUrl,
  );

  const isBot =
    Boolean(member?.bot) ||
    Boolean(member?.isBot) ||
    String(id) === String(botSelfId) ||
    String(member?.role || '').toLowerCase() === 'bot';

  return {
    id,
    qqName,
    groupName,
    displayName: groupName || qqName || id,
    avatarUrl,
    isBot,
  };
}

function uniqueById(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

async function fetchMembersByMethod(bot, methodName, guildId) {
  if (typeof bot[methodName] !== 'function') return [];
  const members = [];
  const seen = new Set();
  const pushMembers = (items) => {
    for (const raw of items || []) {
      const normalized = normalizeMember(raw, bot.selfId);
      if (!normalized || seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      members.push(normalized);
    }
  };

  try {
    if (methodName.endsWith('Iter')) {
      for await (const raw of bot[methodName](guildId)) pushMembers([raw]);
    } else {
      let cursor;
      for (let i = 0; i < 30; i++) {
        const res =
          bot[methodName].length >= 2
            ? await bot[methodName](guildId, cursor)
            : await bot[methodName](guildId);
        if (Array.isArray(res)) {
          pushMembers(res);
          break;
        }
        const list = res?.data || res?.list || res?.members || res?.items || [];
        pushMembers(list);
        const next = res?.next || res?.nextCursor || res?.pageToken || res?.continuationToken || null;
        if (!next || next === cursor) break;
        cursor = next;
      }
    }
  } catch (_) {}

  return members;
}

async function fetchGuildMembers(session, guildId) {
  const bot = session.bot;
  const methods = [
    'getGuildMemberIter',
    'getGuildMemberList',
    'getGuildMembers',
    'getGroupMemberIter',
    'getGroupMemberList',
    'getGroupMembers',
    'getChannelMemberIter',
    'getChannelMemberList',
    'getChannelMembers',
  ];

  const members = [];
  for (const method of methods) {
    const part = await fetchMembersByMethod(bot, method, guildId);
    if (part.length) members.push(...part);
    if (members.length) break;
  }

  return uniqueById(members)
    .filter((member) => !member.isBot)
    .filter((member) => String(member.id) !== String(bot.selfId));
}

async function resolveMemberProfile(session, guildId, userId) {
  const bot = session.bot;
  const methods = ['getGuildMember', 'getGuildMemberInfo', 'getGroupMemberInfo', 'getMemberInfo'];

  for (const method of methods) {
    if (typeof bot[method] !== 'function') continue;
    try {
      const raw = await bot[method](guildId, userId);
      const normalized = normalizeMember(raw, bot.selfId);
      if (normalized) return normalized;
    } catch (_) {}
  }

  return null;
}

function pickRandom(list, excludeId) {
  const pool = excludeId ? list.filter((item) => item.id !== excludeId) : list.slice();
  const target = pool.length ? pool : list;
  if (!target.length) return null;
  return target[Math.floor(Math.random() * target.length)];
}

function pickPreset(excludeId) {
  const pool = PRESETS.filter((item) => item.id !== excludeId);
  const source = pool.length ? pool : PRESETS;
  return source[Math.floor(Math.random() * source.length)];
}

function pickStarCount() {
  return 1 + Math.floor(Math.random() * 5);
}

async function readState(ctx, guildId) {
  const rows = await ctx.database.get('channel', { id: guildId });
  return rows[0]?.jrlpState || null;
}

async function saveState(ctx, guildId, state) {
  await ctx.database.set('channel', { id: guildId }, { jrlpState: state });
}

function summaryText(member) {
  const name = member.displayName || member.groupName || member.qqName || member.id;
  return `你今天的老婆是：\n${name}（${member.id}）哦`;
}

function drawRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawAvatarFallback(name) {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#ffe3ee');
  grad.addColorStop(1, '#d8ecff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#7d5b66';
  ctx.font = 'bold 72px FangZhengHeiTi, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((String(name || '?').trim().slice(0, 1) || '?'), 128, 132);
  return canvas;
}

async function loadAvatar(member) {
  const candidates = [];
  if (isDigits(member.id)) candidates.push(qqAvatarUrl(member.id));
  if (member.avatarUrl) candidates.push(member.avatarUrl);
  for (const url of candidates) {
    try {
      const buffer = await readOrDownload(url);
      return await loadImage(buffer);
    } catch (_) {}
  }
  const fallback = drawAvatarFallback(member.displayName || member.groupName || member.qqName || member.id);
  return await loadImage(fallback.toBuffer('image/png'));
}

async function renderCard(member, preset) {
  const canvas = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(SCALE, SCALE);

  const avatar = await loadAvatar(member);
  ctx.save();
  drawRoundRect(ctx, COVER_OFFSET, COVER_OFFSET, COVER_SIZE, COVER_SIZE, 0);
  ctx.clip();
  const scale = Math.max(COVER_SIZE / avatar.width, COVER_SIZE / avatar.height) * AVATAR_ZOOM;
  const drawW = avatar.width * scale;
  const drawH = avatar.height * scale;
  ctx.drawImage(
    avatar,
    COVER_OFFSET + (COVER_SIZE - drawW) / 2,
    COVER_OFFSET + (COVER_SIZE - drawH) / 2,
    drawW,
    drawH,
  );
  ctx.restore();

  const frame = await loadRemoteImage(`${BESTDORI_URL}/res/image/card-5.png`);
  ctx.drawImage(frame, 0, 0, FRAME_SIZE, FRAME_SIZE);

  const bandIcon = await loadRemoteImage(`${BESTDORI_URL}/res/icon/band_${preset.bandId}.svg`);
  const attrIcon = await loadRemoteImage(`${BESTDORI_URL}/res/icon/${preset.attribute}.svg`);
  const starIcon = await loadRemoteImage(STAR_ICON_URL);

  ctx.drawImage(bandIcon, BAND_X, BAND_Y, BAND_SIZE, BAND_SIZE);
  ctx.drawImage(attrIcon, ATTR_X, ATTR_Y, ATTR_SIZE, ATTR_SIZE);
  const starCount = Math.max(0, Math.min(5, Number(member.starCount || 0)));
  for (const y of STAR_Y.slice(0, starCount)) {
    ctx.drawImage(starIcon, STAR_X, y, STAR_SIZE, STAR_SIZE);
  }

  return canvas.toBuffer('image/png');
}

async function getCurrentSelection(ctx, session, guildId, force) {
  const today = dateInShanghai();
  const members = await fetchGuildMembers(session, guildId);
  if (!members.length) return { error: '没有取到可用的群成员列表。' };

  const state = await readState(ctx, guildId);
  const cachedValid = state && state.date === today;

  if (!force && cachedValid) {
    const fallbackSelected = {
      id: state.memberId,
      qqName: state.memberQqName || state.memberName || state.memberId,
      groupName: state.memberGroupName || '',
      displayName: state.memberGroupName || state.memberName || state.memberQqName || state.memberId,
      avatarUrl: state.avatarUrl || '',
    };
    const selectedFromList = members.find((m) => String(m.id) === String(state.memberId)) || fallbackSelected;
    const preset = PRESETS.find((item) => item.id === state.presetId) || pickPreset();
    const starCount =
      Number.isInteger(state.starCount) && state.starCount >= 1 && state.starCount <= 5
        ? state.starCount
        : pickStarCount();
    const resolved = (await resolveMemberProfile(session, guildId, state.memberId)) || selectedFromList;

    return {
      today,
      members,
      selected: {
        ...selectedFromList,
        ...resolved,
        starCount,
      },
      preset,
      state: {
        ...state,
        memberName: resolved.displayName || resolved.qqName || selectedFromList.displayName || state.memberId,
        memberQqName: resolved.qqName || selectedFromList.qqName || state.memberId,
        memberGroupName: resolved.groupName || selectedFromList.groupName || '',
        starCount,
        updatedAt: state.updatedAt || Date.now(),
      },
    };
  }

  const excludeId = force ? state?.memberId : null;
  const picked = pickRandom(members, excludeId) || pickRandom(members);
  if (!picked) return { error: '当前群里没有可用成员，无法抽取。' };

  const preset = pickPreset(force ? state?.presetId : null);
  const starCount = pickStarCount();
  const resolved = (await resolveMemberProfile(session, guildId, picked.id)) || picked;
  const merged = {
    ...picked,
    ...resolved,
    starCount,
  };
  const newState = {
    date: today,
    memberId: merged.id,
    memberName: merged.displayName || merged.qqName || merged.id,
    memberQqName: merged.qqName || merged.id,
    memberGroupName: merged.groupName || '',
    avatarUrl: merged.avatarUrl,
    presetId: preset.id,
    starCount,
    updatedAt: Date.now(),
  };

  return { today, members, selected: merged, preset, state: newState };
}

async function buildResponse(ctx, session, force) {
  const guildId = getChannelId(session);
  if (!guildId) return '没有获取到群号，暂时无法使用这个功能。';
  if (!isGroupChannel(session)) return '请在群聊里使用这个功能。';

  ensureDir(CACHE_DIR);
  const result = await getCurrentSelection(ctx, session, guildId, force);
  if (result.error) return result.error;

  if (result.state && result.state.updatedAt) {
    await saveState(ctx, guildId, result.state);
  }

  const image = await renderCard(result.selected, result.preset);
  return `${summaryText(result.selected)}\n${h.image(image, 'image/png')}`;
}

function buildPlugin() {
  return {
    name: 'jrlp',
    inject: ['database'],
    apply(ctx) {
      ctx.model.extend('channel', {
        jrlpState: { type: 'json', initial: null },
      });

      ctx.command('jrlp', '今日群友老婆卡')
        .alias('hlp')
        .alias('今日老婆')
        .usage('返回当前群当天固定的老婆卡。')
        .example('hlp')
        .action(async ({ session }) => {
          try {
            return await buildResponse(ctx, session, false);
          } catch (e) {
            ctx.logger('jrlp').warn('generate failed:', e);
            return `生成失败：${e.message || e}`;
          }
        });

      ctx.command('换老婆', '重新抽取今日群友老婆卡')
        .usage('重新随机当前群今日老婆，并覆盖当天缓存。')
        .example('换老婆')
        .action(async ({ session }) => {
          try {
            return await buildResponse(ctx, session, true);
          } catch (e) {
            ctx.logger('jrlp').warn('reroll failed:', e);
            return `重新抽取失败：${e.message || e}`;
          }
        });
    },
  };
}

module.exports = buildPlugin();
