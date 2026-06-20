/*
 * 消息去重
 * LLBot 同一消息上报多个 message-created，每个 messageId 不同。
 * 用原始事件数据做指纹：(channel + user + content) + 2秒窗口。
 * 命中则直接返回 '' 阻断事件链。
 */

module.exports = {
  name: 'dedup',
  apply(ctx) {
    const seen = new Map(); // key → timestamp

    setInterval(() => {
      const cutoff = Date.now() - 5000;
      for (const [key, ts] of seen) {
        if (ts < cutoff) seen.delete(key);
      }
    }, 10000);

    ctx.middleware(async (session, next) => {
      // 只用 event 原始数据，不用 session 的懒加载属性
      const ev = session.event || {};
      const channelId = ev.channel?.id || '';
      const userId = ev.user?.id || '';
      const content = ev.message?.content || '';
      const fingerprint = `${channelId}|${userId}|${content}`;

      if (!fingerprint || fingerprint === '||') return next();

      const now = Date.now();
      const last = seen.get(fingerprint);

      if (last !== undefined && (now - last) < 2000) {
        return '';
      }

      seen.set(fingerprint, now);
      return next();
    });
  },
};
