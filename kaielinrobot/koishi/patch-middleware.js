const fs = require('fs');
const path = '/app/node_modules/koishi-plugin-tsugu-bangdream-bot/lib/index.js';
let src = fs.readFileSync(path, 'utf8');
const before = `  ctx.middleware(async (session, next) => {
    const number = checkLeftDigits(session.content);
    if (number != 0) {
      await session.observeUser(["tsugu"]);
      const tsuguUserData = await observeUserTsugu(session);
      await roomNumber(config, session, tsuguUserData, number, session.content);
      return next();
    } else {
      return next();
    }
  });`;
const after = `  ctx.middleware(async (session, next) => {
    const number = checkLeftDigits(session.content);
    if (number != 0) {
      try {
        await session.observeUser(["tsugu"]);
        const tsuguUserData = await observeUserTsugu(session);
        await roomNumber(config, session, tsuguUserData, number, session.content);
      } catch (e) {
        console.log("roomNumErr:", e?.message, e?.stack);
      }
      return next();
    } else {
      return next();
    }
  });`;
if (!src.includes(before)) {
  console.log('ERROR: Middleware pattern not found');
  process.exit(1);
}
src = src.replace(before, after);
fs.writeFileSync(path, src);
console.log('Middleware patched with try-catch');
