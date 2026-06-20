/*
 * 个人问答系统
 * ============
 * 我说<关键词>执行<指令>  → 设置快捷指令（如：我说K执行ycx1000）
 * 我说<关键词>回答<文字>  → 设置快捷回复（如：我说你好回答你好呀）
 * 问答列表               → 查看你的所有快捷指令
 * 删除问答 <编号>         → 删除指定编号的快捷指令
 *
 * 规则：
 * - 完全匹配才触发（"K" 触发，"K " 不触发）
 * - 每人独立，A 的 K 不影响 B 的 K
 * - 所有数据存储在 user 表中
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGE_DIR = '/app/data/shortcut_images/';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

module.exports = {
  name: 'custom-shortcuts',
  inject: ['database'],

  apply(ctx, config) {
    // 确保图片缓存目录存在
    try { fs.mkdirSync(IMAGE_DIR, { recursive: true }); } catch (_) {}
    // 扩展 user 表，增加 shortcuts 字段
    ctx.model.extend('user', {
      'shortcuts': { type: 'json', initial: [] },
    });

    const reservedCommands = ['我说', '问答列表', '删除问答'];

    // ========================================
    // 辅助：下载表情/图片并缓存到本地，返回 file:// 路径
    // ========================================
    async function cacheImage(url) {
      if (url.startsWith('base64://') || url.startsWith('data:')) return url;
      const hash = crypto.createHash('md5').update(url).digest('hex');
      const extMatch = url.match(/\.(png|jpg|jpeg|gif|webp|bmp)(\?|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
      const filePath = path.join(IMAGE_DIR, `${hash}.${ext}`);

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_IMAGE_BYTES) {
          fs.unlinkSync(filePath);
          throw new Error(`图片/表情大小 ${(stats.size / 1024 / 1024).toFixed(1)}MB 超过限制 10MB`);
        }
        return `file://${filePath}`;
      }

      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const buffer = Buffer.from(response.data);
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error(`图片/表情大小 ${(buffer.length / 1024 / 1024).toFixed(1)}MB 超过限制 10MB`);
      }
      fs.writeFileSync(filePath, buffer);
      return `file://${filePath}`;
    }

    function extractImgSrc(str) {
      const match = str.match(/src\s*=\s*"([^"]+)"/);
      return match ? match[1] : '';
    }

    function buildImgTag(src) {
      return `<img src="${src}"/>`;
    }

    async function replaceImgSrcWithFile(str) {
      const imgRegex = /<img\s[^>]*\/?>/gi;
      let result = str;
      let match;
      while ((match = imgRegex.exec(str)) !== null) {
        const fullTag = match[0];
        const url = extractImgSrc(fullTag);
        if (!url || url.startsWith('file://') || url.startsWith('base64://') || url.startsWith('data:')) continue;
        const fileUrl = await cacheImage(url);
        result = result.replace(fullTag, buildImgTag(fileUrl));
      }
      return result;
    }

    async function replaceFileUrlsWithBase64(str) {
      const imgRegex = /<img\s[^>]*\/?>/gi;
      let result = str;
      let match;
      while ((match = imgRegex.exec(str)) !== null) {
        const fullTag = match[0];
        const url = extractImgSrc(fullTag);
        if (!url || !url.startsWith('file://')) continue;
        const filePath = url.slice(7);
        if (!fs.existsSync(filePath)) continue;
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        result = result.replace(fullTag, buildImgTag(`base64://${base64}`));
      }
      return result;
    }

    // ========================================
    // 辅助：获取用户 id 和 shortcuts
    // ========================================
    async function getShortcuts(session) {
      // observeUser 会触发懒加载，拿到 user 记录
      await session.observeUser(['shortcuts']);
      return {
        userId: session.user?.id,           // 数据库内部 id
        shortcuts: session.user?.shortcuts || [],
      };
    }

    async function saveShortcuts(session, shortcuts) {
      if (!session.user?.id) {
        throw new Error('无法获取用户数据库ID');
      }
      await ctx.database.set('user', { id: session.user.id }, { shortcuts });
    }

    // ========================================
    // 中间件：noSpace + 拦截匹配的快捷指令
    // ========================================
    ctx.middleware(async (session, next) => {
      let content = (session.content || '').trim();
      if (!content) return next();

      // --- noSpace 处理：为"我说"和"删除问答"自动补空格 ---
      for (const prefix of ['我说', '删除问答']) {
        if (content.startsWith(prefix) && content.length > prefix.length && content[prefix.length] !== ' ') {
          const fixed = prefix + ' ' + content.slice(prefix.length);
          return session.execute(fixed);
        }
      }

      // 保留指令直接放过
      for (const cmd of reservedCommands) {
        if (content === cmd || content.startsWith(cmd)) {
          return next();
        }
      }

      try {
        const { shortcuts } = await getShortcuts(session);
        const matched = shortcuts.find(s => s.trigger === content);

        if (!matched) return next();

        if (matched.type === 'command') {
          return session.execute(matched.target);
        } else if (matched.type === 'text') {
          if (matched.target.includes('file://')) {
            return await replaceFileUrlsWithBase64(matched.target);
          }
          return matched.target;
        }
      } catch (e) {
        ctx.logger('shortcuts').warn('middleware error:', e);
      }

      return next();
    });

    // ========================================
    // 我说<关键词>执行<指令> / 我说<关键词>回答<文字>
    // ========================================
    ctx.command('我说 <message:text>', '设置个人快捷指令')
      .usage([
        '我说<关键词>执行<指令>  → 设置快捷指令，发送关键词自动执行指令',
        '我说<关键词>回答<文字>  → 设置快捷回复，发送关键词自动回复文字',
        '注意：关键词完全匹配才触发（如 "K" 匹配，"OK" 不匹配）',
        '每人独立存储，互不影响',
      ].join('\n'))
      .example('我说K执行ycx 1000')
      .example('我说你好回答你好呀~')
      .action(async ({ session }, message) => {
        if (!message) {
          return '格式错误。正确格式：\n我说<关键词>执行<指令>\n我说<关键词>回答<文字>';
        }

        // 解析 message：查找 "执行" 或 "回答"
        const execIdx = message.indexOf('执行');
        const replyIdx = message.indexOf('回答');

        let trigger, type, target;

        if (execIdx !== -1 && (replyIdx === -1 || execIdx <= replyIdx)) {
          trigger = message.slice(0, execIdx);
          target = message.slice(execIdx + 2);
          type = 'command';
        } else if (replyIdx !== -1) {
          trigger = message.slice(0, replyIdx);
          target = message.slice(replyIdx + 2);
          type = 'text';
        } else {
          return '格式错误：找不到"执行"或"回答"。\n正确格式：\n我说<关键词>执行<指令>\n我说<关键词>回答<文字>';
        }

        if (!trigger) return '关键词不能为空！';
        if (!target) return (type === 'command' ? '指令' : '文字') + '不能为空！';

        // 检查是否为保留字
        if (reservedCommands.includes(trigger)) {
          return `"${sanitizeForDisplay(trigger)}" 是系统保留字，不能作为关键词`;
        }

        try {
          const finalTarget = await replaceImgSrcWithFile(target);
          const { shortcuts } = await getShortcuts(session);
          const newId = shortcuts.length + 1;

          shortcuts.push({ id: newId, trigger, type, target: finalTarget });
          await saveShortcuts(session, shortcuts);

          return `✅ 已添加 #${newId}\n关键词：${sanitizeForDisplay(trigger)}\n类型：${type === 'command' ? '执行指令' : '固定回复'}\n内容：${sanitizeForDisplay(finalTarget)}`;
        } catch (e) {
          ctx.logger('shortcuts').warn('add error:', e);
          return '添加失败：' + e.message;
        }
      });

    // ========================================
    // 辅助：清理元素标签，防止渲染为真实消息元素
    // ========================================
    function sanitizeForDisplay(str) {
      let result = str;
      result = result.replace(/<at\s+id="(\d+)"\s*\/?>/gi, '@[用户]');
      result = result.replace(/<img\b[^>]*\/?>/gi, '[表情]');
      result = result.replace(/<[^>]*>/g, '');
      result = result.replace(/\s+/g, ' ').trim();
      if (result.length > 60) {
        result = result.slice(0, 57) + '...';
      }
      return result || '(空)';
    }

    // ========================================
    // 问答列表
    // ========================================
    ctx.command('问答列表', '查看你设置的所有个人快捷指令')
      .usage('列出你所有快捷指令的编号、关键词和内容')
      .action(async ({ session }) => {
        try {
          const { shortcuts } = await getShortcuts(session);

          if (!shortcuts.length) {
            return '你还没有设置任何快捷指令。\n发送 "我说<关键词>执行<指令>" 来添加。';
          }

          const maxShow = 15;
          const showItems = shortcuts.slice(0, maxShow);
          const remaining = shortcuts.length - maxShow;

          const list = showItems.map(s => {
            const typeLabel = s.type === 'command' ? '🗜️指令' : '💬回复';
            const trigger = sanitizeForDisplay(s.trigger);
            const target = sanitizeForDisplay(s.target);
            return `#${s.id} [${typeLabel}] ${trigger} → ${target}`;
          });

          let result = `📋 你的快捷指令 (共 ${shortcuts.length} 条)：\n${list.join('\n')}`;
          if (remaining > 0) {
            result += `\n\n... 还有 ${remaining} 条，删除不需要的条目后重新发送查看全部`;
          }
          return result;
        } catch (e) {
          ctx.logger('shortcuts').warn('list error:', e);
          return '查询失败：' + e.message;
        }
      });

    // ========================================
    // 删除问答 <编号>
    // ========================================
    ctx.command('删除问答 <id:integer>', '删除指定编号的个人快捷指令')
      .usage('删除问答 <编号>  → 删除对应编号的快捷指令，编号从"问答列表"查看')
      .example('删除问答 1')
      .action(async ({ session }, id) => {
        if (!id) return '请指定要删除的编号，如：删除问答 1';

        try {
          const { shortcuts } = await getShortcuts(session);
          const idx = shortcuts.findIndex(s => s.id === id);

          if (idx === -1) {
            return `未找到编号 #${id} 的快捷指令`;
          }

          const removed = shortcuts.splice(idx, 1)[0];

          // 重新编号
          shortcuts.forEach((s, i) => { s.id = i + 1; });

          await saveShortcuts(session, shortcuts);

          return `🗑️ 已删除 #${id}：${sanitizeForDisplay(removed.trigger)} → ${sanitizeForDisplay(removed.target)}`;
        } catch (e) {
          ctx.logger('shortcuts').warn('delete error:', e);
          return '删除失败：' + e.message;
        }
      });
  },
};
