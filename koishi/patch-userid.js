const fs = require('fs');
const path = '/app/node_modules/koishi-plugin-tsugu-bangdream-bot/lib/index.js';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `      user_id: String(userId),`,
  `      user_id: String(userId) || "0",`
);

fs.writeFileSync(path, code);
console.log('user_id fallback to "0" added');
