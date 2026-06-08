require('ts-node/register');
require('tsconfig-paths/register');
const { drawEventList,initForWorker } = require('@/view/eventList');
//import { card } from '@/components/card';

module.exports = async function (task) {
  return await drawEventList(
    task.matches,
    task.displayedServerList,
    task.compress,
    task.mainAPI
  );
};

module.exports.initWorker = async function () {
  await initForWorker();
};