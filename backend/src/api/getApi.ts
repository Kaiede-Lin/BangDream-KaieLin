import { getJsonAndSave } from '@/api/downloader';
import { getCacheDirectory, getFileNameFromUrl } from '@/api/utils';
import { logger } from '@/logger';
import * as path from 'path';
import * as fs from 'fs';
import { json } from 'stream/consumers';


class ConcurrencyLimiter {
  private maxConcurrent: number;
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // 如果当前并发数已达到上限，则等待队列中的任务释放
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    // 增加活跃计数，执行任务
    this.activeCount++;
    try {
      return await fn();
    } finally {
      // 任务完成，减少活跃计数，并检查队列中是否有等待的任务
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        await sleep(1000); // 暂停1000ms
        next?.(); // 释放下一个等待的任务
      }
    }
  }
}

const limiter = new ConcurrencyLimiter(8); // 限制8个并发请求
const debugFlags = false
async function callAPIAndCacheResponse(url: string, cacheTime: number = 0, retryCount: number = 3,isForceUseCache = true,rtLevel=1): Promise<object> {
  // 仅对Tracker等需要实时更新的API作限制
    if (url.includes('hhwx.org/api/tracker/data')) {
    url = url.replace('hhwx.org/api/tracker/data', 'hhwx.org/api/bandori/tracker/data');  // HHWX数据源修复
  }
  if (url.includes('api/tracker/data') || url.includes('mode=')) return limiter.run(() => callAPIAndCacheResponseF(url, cacheTime,retryCount,isForceUseCache,rtLevel));
  if (debugFlags && url.includes('/api/events/all.6.json')){
    console.log('Debug Flags is set to TRUE and read part json from local')
    var path = "all.6.json"
    var jsonstr = fs.readFileSync(path,'utf-8')
    return JSON.parse(jsonstr)
  }
  return callAPIAndCacheResponseF(url, cacheTime,retryCount,isForceUseCache,rtLevel);
};

async function callAPIAndCacheResponseF(url: string, cacheTime: number = 0, retryCount: number = 3,isForceUseCache = true,rtLevel=1): Promise<object> {
  
  const cacheDir = getCacheDirectory(url);
  const fileName = getFileNameFromUrl(url);
  // rtLevel：规定API的实时性。不同的等级将会被赋予不同的实时性。
  // 0级：可以返回缓存数据，但是必须得在后台进行更新，确保下一次返回的数据是最新的 | 1级：要求返回服务器上的最新数据。例如个人信息，tracker数据等，默认为1. 0级可以加快event/歌曲的出图速度
  // 2级：无视etag强制更新API缓存
  // 当isForceUseCache为true的时候，rtLevel将会被无视
  if (rtLevel == 2) {
    let pathName = path.join(cacheDir, `${fileName}.etag`)
    try{
      if (fs.existsSync(pathName)){
        fs.rmSync(pathName)  // 删除eTag强制更新缓存
      }
    }
    catch{
      logger('callAPIAndCacheResponseF',`删除eTag ${pathName} 失败！`)
    }
    rtLevel =1
  }
  for (let attempt = 0; attempt < retryCount; attempt++) {
    
    try {
      //const cacheFilePath = path.join(cacheDir || '', `${fileName || ''}`);
      if (isForceUseCache){
        //console.log('isForceUseCache:',isForceUseCache)
        const data = await getJsonAndSave(url, cacheDir, fileName, cacheTime,isForceUseCache);
        return data
      }
      var apiData = null;
      if (rtLevel == 0 || rtLevel){
        if(rtLevel == 0){
          logger('callAPIAndCacheResponse','rtLevel is 0. Return Cache Data First then update data on background to Speed Up')
          apiData = await getJsonAndSave(url, cacheDir, fileName, 0,true);
          if (isFinite(cacheTime)) getJsonAndSave(url, cacheDir, fileName, 300, false)
            .catch(err => {
              logger(
                'callAPIAndCacheResponse',
                `Background cache update failed for ${url}: ${err?.stack || err}`
              );
            });   // 设置5分钟的缓冲区，防止新文件在短时间内重新获取。如果是读取缓存的则不再重新获取
          return apiData
        }
        if(rtLevel == 1){
          apiData = await getJsonAndSave(url, cacheDir, fileName, cacheTime,false);
          return apiData
        }
      }
      const data = await getJsonAndSave(url, cacheDir, fileName, cacheTime,isForceUseCache);  // 如果不强制读取缓存但又没有规定实时性。虽然不太可能发生，但是保底。
      return data;
    } catch (e) {
      
      //console.log(e.response.status )
      if (e && e.response.status === 404){ // 找不到就是找不到，不需要重试了。如果是访问上限，错误码不会是404
        logger(`API`, `Failed to get JSON from "${url}". Server returned 404 err code. No more retries will be made.`);
        throw e;
      }
      
      logger(`API`, `Failed to get JSON from "${url}" on attempt ${attempt + 1}. Error: ${e.message}`);
      if (attempt === retryCount - 1) {
        throw new Error(`Failed to get JSON from "${url}" after ${retryCount} attempts`);
        //throw e; // Rethrow the error if all retries fail
      }
      //等待3秒后重试
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  throw new Error(`Failed to get JSON from "${url}" after ${retryCount} attempts`);
}
export async function existLocalCache(url:string){
    const cacheDir = getCacheDirectory(url);
    const fileName = getFileNameFromUrl(url);
    const cacheFilePath = path.join(cacheDir || '', `${fileName || ''}`);
    return fs.existsSync(cacheFilePath)
}
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
export { callAPIAndCacheResponse };

