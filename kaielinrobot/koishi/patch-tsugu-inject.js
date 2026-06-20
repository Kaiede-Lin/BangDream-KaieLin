const fs = require('fs');

const path = '/app/node_modules/koishi-plugin-tsugu-bangdream-bot/lib/index.js';
let src = fs.readFileSync(path, 'utf8');

const anchor = 'module.exports = __toCommonJS(src_exports);';
const injection = 'module.exports = __toCommonJS(src_exports);\nmodule.exports.inject = ["database"];';

if (!src.includes('module.exports.inject = ["database"];')) {
  if (!src.includes(anchor)) {
    console.log('ERROR: export anchor not found');
    process.exit(1);
  }
  src = src.replace(anchor, injection);
  fs.writeFileSync(path, src);
  console.log('tsugu inject patched');
} else {
  console.log('tsugu inject already patched');
}
