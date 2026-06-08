require('ts-node/register');
require('tsconfig-paths/register');
const { Song } = require('@/types/Song');
const { drawSongDetail } = require('@/view/songDetail');

module.exports = async function (task) {
  const song = new Song(task.songId);
  return await drawSongDetail(song, task.displayedServerList, task.compress);
};
