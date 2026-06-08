require('ts-node/register');
require('tsconfig-paths/register');

const { drawSongList,initForWorker } = require('@/view/songList');
const { drawEventList } = require('@/view/eventList');
const { drawCardList } = require('@/view/cardList');
const {drawRandomGacha} = require('@/view/gachaSimulate')
const {setMainAPI,setOtherFix} = require('@/types/_Main')
const {workerDataInit} = require('@/teamBuilder/dataPrepare')


module.exports = async function (task) {
  return await drawSongList(
    task.matches,
    task.displayedServerList,
    task.compress,
    task.message
  );
};

module.exports.initWorker = async function () {
  await initForWorker();
};

module.exports.drawEventList = async function (task) {
  return await drawEventList(
    task.matches,
    task.displayedServerList,
    task.compress,
    task.mainAPI
  );
};

module.exports.drawCardList = async function (task) {
  return await drawCardList(
    task.matches,
    task.displayedServerList,
    task.useEasyBG,
    task.compress,
    task.after_training,
    task.mainAPI
  );
};
module.exports.drawRandomGacha = async function (task) {
  return await drawRandomGacha(
    task.gacha,
    task.times,
    task.compress,
    task.apiData,
  );
};
module.exports.setMainApiToWorker = async function (task) {
  return await setMainAPI(
    task.data
  );
};
module.exports.setOtherFixToWorker = async function (task) {
  return await setOtherFix(
    task.data
  );
};
module.exports.dataPrepare = async function (task) {
  //console.log(task.playerId)
  return await workerDataInit(
    task.playerId,
    task.mainServer,
    task.eventId,
    task.save,
    task.desc
  );
};
module.exports.warmup  = (t) => { return true; };