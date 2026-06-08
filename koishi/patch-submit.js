const fs = require('fs');
const path = '/app/node_modules/koishi-plugin-tsugu-bangdream-bot/lib/index.js';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `    const data = {
      function: "submit_room_number",
      number,
      user_id: userId,
      raw_message: rawMessage,
      source: process.env.BANDORI_STATION_SOURCE || "Tsugu",
      token: bandoriStationToken
    };`,
  `    const data = {
      function: "submit_room_number",
      number: String(number),
      user_id: String(userId || "14472"),
      raw_message: String(rawMessage),
      source: String(process.env.BANDORI_STATION_SOURCE || "Tsugu"),
      token: String(bandoriStationToken)
    };`
);

fs.writeFileSync(path, code);
console.log('submitRoomNumber data fields wrapped with String()');
