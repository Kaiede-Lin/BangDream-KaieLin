function toString(value) {
  return String(value ?? '').trim();
}

function isNumericId(value) {
  return /^\d{6,}$/.test(toString(value));
}

function isGroupSession(session) {
  const channelId = toString(session.channelId || session.event?.channel?.id);
  const guildId = toString(session.guildId || session.event?.guild?.id);
  return isNumericId(channelId) || isNumericId(guildId);
}

function getQuotedMessageId(session) {
  const quote = session.quote || session.event?.message?.quote || session.event?.quote;
  const candidates = [
    quote?.id,
    quote?.message_id,
    quote?.messageId,
    quote?.message_id,
    quote?.messageID,
    session.event?.message?.reply?.id,
    session.event?.message?.reply?.messageId,
    session.event?.message?.reply?.message_id,
    session.event?.message?.reply?.messageID,
    session.event?.reply?.id,
    session.event?.reply?.messageId,
    session.event?.reply?.message_id,
    session.event?.reply?.messageID,
  ];

  for (const candidate of candidates) {
    const id = toString(candidate);
    if (id) return id;
  }

  return '';
}

function collectText(session) {
  const parts = [];

  if (typeof session.content === 'string') parts.push(session.content);
  if (typeof session.event?.message?.content === 'string') parts.push(session.event.message.content);

  const elements = session.elements || session.event?.message?.elements || [];
  for (const element of elements) {
    if (!element) continue;
    const type = String(element.type || '').toLowerCase();
    if (type !== 'text') continue;
    const text = element.data?.text;
    if (typeof text === 'string' && text) parts.push(text);
  }

  return parts.join(' ');
}

function collectEmojiCandidates(text) {
  const input = String(text || '');
  const output = [];
  const seen = new Set();

  const emojiRegex = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}))*|(?:[#*0-9]\uFE0F?\u20E3)|(?:[\u{1F1E6}-\u{1F1FF}]{2})/gu;
  let match;
  while ((match = emojiRegex.exec(input))) {
    const emoji = match[0];
    if (seen.has(emoji)) continue;
    seen.add(emoji);
    output.push(emoji);
  }

  return output;
}

function normalizeEmojiCluster(cluster) {
  return String(cluster || '').replace(/\uFE0F/g, '').trim();
}

function unicodeEmojiToReactionId(emoji) {
  const normalized = normalizeEmojiCluster(emoji);
  if (!normalized) return '';

  const codePoints = Array.from(normalized);
  if (codePoints.length !== 1) return '';

  const codePoint = normalized.codePointAt(0);
  if (!Number.isFinite(codePoint)) return '';
  return String(codePoint);
}

function splitGraphemes(text) {
  const input = String(text || '');
  if (!input) return [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(input), (item) => item.segment);
  }
  return Array.from(input);
}

function isEmojiCluster(cluster) {
  return collectEmojiCandidates(cluster).length > 0;
}

function extractEmojis(text) {
  const clusters = splitGraphemes(text);
  const result = [];
  const seen = new Set();

  for (const cluster of clusters) {
    if (!isEmojiCluster(cluster)) continue;
    for (const emoji of collectEmojiCandidates(cluster)) {
      if (seen.has(emoji)) continue;
      seen.add(emoji);
      result.push(emoji);
    }
  }

  return result;
}

async function callSetMsgEmojiLike(session, messageId, emojiId) {
  const bot = session.bot;
  const onebot = session.onebot;
  const payload = { message_id: messageId, emoji_id: emojiId, set: true };

  if (typeof bot?.createReaction === 'function') {
    const channelId = toString(session.channelId || session.event?.channel?.id || session.guildId || session.event?.guild?.id);
    if (channelId) {
      return await bot.createReaction(channelId, messageId, emojiId);
    }
  }

  const internal = bot?.internal;
  if (internal) {
    if (typeof internal.setMsgEmojiLike === 'function') {
      return await internal.setMsgEmojiLike(messageId, emojiId, true);
    }
    if (typeof internal.set_msg_emoji_like === 'function') {
      return await internal.set_msg_emoji_like(messageId, emojiId, true);
    }
  }

  if (typeof bot?.call === 'function') {
    return await bot.call('set_msg_emoji_like', payload);
  }

  if (typeof bot?.callAction === 'function') {
    return await bot.callAction('set_msg_emoji_like', payload);
  }

  if (typeof onebot?._request === 'function') {
    return await onebot._request('set_msg_emoji_like', payload);
  }

  throw new Error('set_msg_emoji_like is not available on this session');
}

function resolveEmojiId(config, emoji) {
  const map = config?.emojiMap || {};
  if (Object.prototype.hasOwnProperty.call(map, emoji)) {
    const mapped = map[emoji];
    if (mapped === null || mapped === undefined || mapped === '') return '';
    return toString(mapped);
  }
  return unicodeEmojiToReactionId(emoji);
}

module.exports = {
  name: 'emoji-like',
  apply(ctx, config = {}) {
    const logger = ctx.logger('emoji-like');

    ctx.middleware(async (session, next) => {
      const result = await next();

      try {
        if (!isGroupSession(session)) return;
        if (session.isDirect) return;

        const selfId = toString(session.selfId || session.event?.selfId);
        const userId = toString(session.userId || session.event?.user?.id);
        if (selfId && userId && selfId === userId) return;
        if (session.event?.user?.bot) return;

        const quoteMessageId = getQuotedMessageId(session);
        if (!quoteMessageId) return;

        const text = collectText(session);
        if (!text) return;

        const emojis = extractEmojis(text);
        if (!emojis.length) return;

        logger.info(`inspect reply: channel=${toString(session.channelId || session.event?.channel?.id)} quote=${quoteMessageId} emojis=${emojis.join(' ')}`);
        for (const emoji of emojis) {
          try {
            const emojiId = resolveEmojiId(config, emoji);
            if (!emojiId) continue;
            logger.info(`reaction attempt: quote=${quoteMessageId} emoji=${emoji} emojiId=${emojiId}`);
            await callSetMsgEmojiLike(session, quoteMessageId, emojiId);
          } catch {
            // silent best-effort reaction
          }
        }
      } catch {
        // silent best-effort reaction
      }

      return result;
    });
  },
};
