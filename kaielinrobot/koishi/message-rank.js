/*
 * 发言排行系统
 * ============
 * 发言排行          → 查看今日群内发言排行（前20名，含头像+柱状图）
 * 发言排行 日期     → 查看指定日期排行，如：发言排行 2026-06-05
 *
 * 规则：
 * - 按群隔离，不同群的排行独立统计
 * - 每日自动归零，历史数据保留
 * - 仅统计群聊消息，私聊不计入
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const { h } = require('koishi');

// 加载中文字体
try {
  registerFont('/app/fonts/FangZhengHeiTi_GBK.ttf', { family: 'FangZhengHeiTi' });
} catch (e) {
  // 忽略
}

const FONT_FAMILY = '"FangZhengHeiTi", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif';

module.exports = {
  name: 'message-rank',
  inject: ['database'],

  apply(ctx, config) {
    // 扩展 channel 表
    ctx.model.extend('channel', {
      'msgStats': { type: 'json', initial: {} },
    });

    // ==========================================
    // 内存缓存：避免每次消息都写数据库
    // ==========================================
    // cache[channelId][date][userId] = { name, count }
    const cache = new Map();

    function today() {
      return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }

    function ensureCache(channelId, date) {
      if (!cache.has(channelId)) cache.set(channelId, new Map());
      const dateMap = cache.get(channelId);
      if (!dateMap.has(date)) dateMap.set(date, new Map());
      return dateMap.get(date);
    }

    function getChannelId(session) {
      // QQ 群聊中 channelId 就是群号
      return session.channelId || session.event?.channel?.id || '';
    }

    function getUserName(session) {
      return session.username
        || session.author?.name
        || session.author?.nick
        || session.event?.user?.name
        || session.event?.user?.nick
        || String(session.userId);
    }

    function isGroupMessage(session) {
      // 有 guildId 或 channelId 看起来像群号（纯数字且 > 100000）
      const cid = getChannelId(session);
      const gid = session.guildId || session.event?.guild?.id;
      // QQ 群号特征：纯数字且长度 >= 6
      return /^\d{6,}$/.test(cid) || (!!gid && /^\d{6,}$/.test(gid));
    }

    // ==========================================
    // 中间件：统计每条群聊消息
    // ==========================================
    ctx.middleware(async (session, next) => {
      if (!isGroupMessage(session)) return next();

      const channelId = getChannelId(session);
      const userId = String(session.userId || session.event?.user?.id || '');
      if (!userId) return next();

      const userName = getUserName(session);
      const date = today();
      const dayCache = ensureCache(channelId, date);

      if (dayCache.has(userId)) {
        dayCache.get(userId).count++;
        dayCache.get(userId).name = userName; // 更新昵称
      } else {
        dayCache.set(userId, { name: userName, count: 1 });
      }

      return next();
    });

    // ==========================================
    // 定时刷入数据库（每 60 秒）
    // ==========================================
    async function flushCache() {
      if (cache.size === 0) return;

      const snapshot = new Map(cache);
      cache.clear();

      for (const [channelId, dateMap] of snapshot) {
        try {
          // 读取当前 DB 数据
          const channels = await ctx.database.get('channel', { id: channelId });
          if (!channels.length) continue;

          const dbStats = channels[0].msgStats || {};
          const merged = JSON.parse(JSON.stringify(dbStats));

          for (const [date, userMap] of dateMap) {
            if (!merged[date]) merged[date] = {};
            for (const [userId, data] of userMap) {
              if (!merged[date][userId]) {
                merged[date][userId] = { name: data.name, count: 0 };
              }
              merged[date][userId].count += data.count;
              merged[date][userId].name = data.name;
            }
          }

          await ctx.database.set('channel', { id: channelId }, { msgStats: merged });
        } catch (e) {
          ctx.logger('msg-rank').warn('flush error for channel', channelId, e.message);
          // 失败时把数据放回缓存
          for (const [date, userMap] of dateMap) {
            const dayCache = ensureCache(channelId, date);
            for (const [userId, data] of userMap) {
              if (dayCache.has(userId)) {
                dayCache.get(userId).count += data.count;
              } else {
                dayCache.set(userId, data);
              }
            }
          }
        }
      }
    }

    setInterval(flushCache, 60000);

    // 进程退出前刷一次
    ctx.on('dispose', async () => {
      await flushCache();
    });

    // ==========================================
    // 获取排行数据（合并缓存 + 数据库）
    // ==========================================
    async function getRankingData(channelId, targetDate) {
      // 先刷缓存
      await flushCache();

      const channels = await ctx.database.get('channel', { id: channelId });
      if (!channels.length) return [];

      const dbStats = channels[0].msgStats || {};
      const dayData = dbStats[targetDate] || {};

      // 转换为排序数组
      const list = Object.entries(dayData).map(([userId, data]) => ({
        userId,
        name: data.name || String(userId),
        count: data.count || 0,
      }));

      list.sort((a, b) => b.count - a.count);
      return list.slice(0, 20);
    }

    // ==========================================
    // 获取 QQ 头像
    // ==========================================
    async function fetchAvatar(qqNumber) {
      const url = `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=100`;
      try {
        const resp = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 5000,
        });
        return Buffer.from(resp.data);
      } catch {
        return null;
      }
    }

    // ==========================================
    // 绘制排行图片
    // ==========================================
    async function drawRanking(channelId, targetDate, rankingData) {
      const W = 780;
      const HEADER_H = 140;
      const ROW_H = 50;
      const AVATAR_SIZE = 36;
      const PADDING_LEFT = 60;
      const PADDING_RIGHT = 40;
      const BAR_AREA_LEFT = 200;  // 柱状图起始 x
      const BAR_MAX_WIDTH = W - BAR_AREA_LEFT - PADDING_RIGHT - 80; // 留 80px 给数字

      const H = HEADER_H + ROW_H * Math.max(rankingData.length, 1) + 40;

      const canvas = createCanvas(W, H);
      const ctx2d = canvas.getContext('2d');

      // 背景
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(0, 0, W, H);

      // 顶部装饰条
      const barGrad = ctx2d.createLinearGradient(0, 0, W, 0);
      barGrad.addColorStop(0, '#667eea');
      barGrad.addColorStop(1, '#764ba2');
      ctx2d.fillStyle = barGrad;
      ctx2d.fillRect(0, 0, W, 6);

      // 标题
      ctx2d.fillStyle = '#2d3748';
      ctx2d.font = `bold 28px ${FONT_FAMILY}`;
      ctx2d.textAlign = 'center';
      ctx2d.fillText(`💬 群发言排行`, W / 2, 50);

      // 日期 + 群号
      ctx2d.fillStyle = '#718096';
      ctx2d.font = `16px ${FONT_FAMILY}`;
      ctx2d.fillText(`${targetDate}  ·  群 ${channelId}`, W / 2, 80);

      // 总发言数
      const totalMsg = rankingData.reduce((sum, u) => sum + u.count, 0);
      ctx2d.fillText(`今日总发言 ${totalMsg} 条  ·  Top ${rankingData.length}`, W / 2, 105);

      // 无数据
      if (rankingData.length === 0) {
        ctx2d.fillStyle = '#a0aec0';
        ctx2d.font = `20px ${FONT_FAMILY}`;
        ctx2d.fillText('今天还没有人发言哦~', W / 2, HEADER_H + 80);
        return canvas.toBuffer('image/png');
      }

      // 最大值用于柱状图比例
      const maxCount = rankingData[0].count || 1;

      // 遍历绘制每一行
      for (let i = 0; i < rankingData.length; i++) {
        const user = rankingData[i];
        const y = HEADER_H + i * ROW_H;

        // 排名徽章（用绘图代替 emoji，避免缺少字体导致乱码）
        const medalCX = PADDING_LEFT - 20;
        const medalCY = y + ROW_H / 2;
        if (i === 0) {
          drawMedal(ctx2d, medalCX, medalCY, 0, 28);
        } else if (i === 1) {
          drawMedal(ctx2d, medalCX, medalCY, 1, 28);
        } else if (i === 2) {
          drawMedal(ctx2d, medalCX, medalCY, 2, 28);
        } else {
          ctx2d.textAlign = 'right';
          ctx2d.fillStyle = '#a0aec0';
          ctx2d.font = `bold 16px ${FONT_FAMILY}`;
          ctx2d.fillText(`#${i + 1}`, PADDING_LEFT - 15, y + 30);
        }

        // 头像
        try {
          const avatarBuf = await fetchAvatar(user.userId);
          if (avatarBuf) {
            const avatar = await loadImage(avatarBuf);
            const ax = PADDING_LEFT;
            const ay = y + (ROW_H - AVATAR_SIZE) / 2;
            // 圆形裁剪
            ctx2d.save();
            ctx2d.beginPath();
            ctx2d.arc(ax + AVATAR_SIZE / 2, ay + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
            ctx2d.closePath();
            ctx2d.clip();
            ctx2d.drawImage(avatar, ax, ay, AVATAR_SIZE, AVATAR_SIZE);
            ctx2d.restore();
          }
        } catch {
          // 头像加载失败就跳过
        }

        // 名字
        const nameX = PADDING_LEFT + AVATAR_SIZE + 12;
        ctx2d.textAlign = 'left';
        ctx2d.fillStyle = '#2d3748';
        ctx2d.font = `15px ${FONT_FAMILY}`;
        const displayName = user.name.length > 10
          ? user.name.slice(0, 9) + '…'
          : user.name;
        ctx2d.fillText(displayName, nameX, y + 30);

        // 柱状图
        const barW = Math.max((user.count / maxCount) * BAR_MAX_WIDTH, 4);
        const barY = y + 12;
        const barH = ROW_H - 24;
        const rankBarGrad = ctx2d.createLinearGradient(BAR_AREA_LEFT, 0, BAR_AREA_LEFT + barW, 0);
        if (i === 0) {
          rankBarGrad.addColorStop(0, '#f6ad55');
          rankBarGrad.addColorStop(1, '#ed8936');
        } else if (i === 1) {
          rankBarGrad.addColorStop(0, '#a0aec0');
          rankBarGrad.addColorStop(1, '#718096');
        } else if (i === 2) {
          rankBarGrad.addColorStop(0, '#ecc94b');
          rankBarGrad.addColorStop(1, '#d69e2e');
        } else {
          rankBarGrad.addColorStop(0, '#667eea');
          rankBarGrad.addColorStop(0.5, '#764ba2');
          rankBarGrad.addColorStop(1, '#667eea');
        }
        ctx2d.fillStyle = rankBarGrad;
        ctx2d.beginPath();
        const radius = Math.min(barH / 2, 8);
        drawRoundRect(ctx2d, BAR_AREA_LEFT, barY, barW, barH, radius);
        ctx2d.fill();

        // 数字
        ctx2d.fillStyle = '#4a5568';
        ctx2d.font = `bold 14px ${FONT_FAMILY}`;
        ctx2d.textAlign = 'left';
        ctx2d.fillText(String(user.count), BAR_AREA_LEFT + barW + 8, y + 30);
      }

      // 底部
      ctx2d.fillStyle = '#a0aec0';
      ctx2d.font = `12px ${FONT_FAMILY}`;
      ctx2d.textAlign = 'center';
      ctx2d.fillText('数据每 60 秒刷新  ·  Powered by Kaiede', W / 2, H - 12);

      return canvas.toBuffer('image/png');
    }

    // 奖牌徽章绘制函数（替代 emoji，避免缺少字体导致乱码）
    function drawMedal(ctx2d, cx, cy, rank, size) {
      const r = size / 2;
      const colors = [
        { fill: '#FFD700', stroke: '#DAA520', text: '#8B6914' },   // 金
        { fill: '#E8E8E8', stroke: '#A9A9A9', text: '#666666' },   // 银
        { fill: '#CD7F32', stroke: '#8B5A2B', text: '#5C3A1E' },   // 铜
      ];
      const c = colors[rank];
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
      ctx2d.fillStyle = c.fill;
      ctx2d.fill();
      ctx2d.strokeStyle = c.stroke;
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
      ctx2d.fillStyle = c.text;
      ctx2d.font = `bold ${size * 0.45}px ${FONT_FAMILY}`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(String(rank + 1), cx, cy + 0.5);
      ctx2d.restore();
    }

    // 矩形圆角辅助函数
    function drawRoundRect(ctx2d, x, y, w, h, r) {
      ctx2d.moveTo(x + r, y);
      ctx2d.lineTo(x + w - r, y);
      ctx2d.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx2d.lineTo(x + w, y + h - r);
      ctx2d.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx2d.lineTo(x + r, y + h);
      ctx2d.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx2d.lineTo(x, y + r);
      ctx2d.quadraticCurveTo(x, y, x + r, y);
      ctx2d.closePath();
    }

    // ==========================================
    // 命令：发言排行 [日期]
    // ==========================================
    ctx.command('发言排行 [date:text]', '查看本群今日发言排行（前20名，含头像+柱状图）')
      .usage([
        '发言排行            → 查看今日排行',
        '发言排行 2026-06-05  → 查看指定日期排行',
      ].join('\n'))
      .example('发言排行')
      .example('发言排行 2026-06-05')
      .action(async ({ session }, date) => {
        const channelId = getChannelId(session);
        if (!channelId || !/^\d{6,}$/.test(channelId)) {
          return '此功能仅在群聊中可用';
        }

        // 解析日期
        let targetDate = date || today();
        // 验证日期格式
        if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          return '日期格式错误，请使用 YYYY-MM-DD 格式，如：发言排行 2026-06-05';
        }

        try {
          const rankingData = await getRankingData(channelId, targetDate);

          if (rankingData.length === 0 && targetDate === today()) {
            return '今天还没有人发言哦~';
          }
          if (rankingData.length === 0) {
            return `${targetDate} 没有发言记录`;
          }

          const imgBuf = await drawRanking(channelId, targetDate, rankingData);
          return h.image(imgBuf, 'image/png');
        } catch (e) {
          ctx.logger('msg-rank').warn('command error:', e);
          return '生成排行失败：' + e.message;
        }
      });
  },
};
