import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '@/logger';
import { LRUCacheAny } from '@/LRUCache';
const pendingDownloads = new Map<string, Promise<Buffer>>();
const errUrl: string[] = [];
const resDebug = false
const apiDebug = false
export const showDownloadLog = false
export function getPD_Size(){
  return 'pendingDownloads Size: '+ `${pendingDownloads.size}`
}
export function getApiDataCacheSize(){
    return memoryCache.getCacheSize()
}

export async function download(   // GPT写的
  url: string,
  directory?: string,
  fileName?: string,
  cacheTime = 0,
  isApiRequest = false
): Promise<Buffer> {
  //
  if (pendingDownloads.has(url)) {
    if (showDownloadLog)
      logger("download", `Duplicate request detected, waiting: ${url}`);
    return pendingDownloads.get(url)!;
  }

  const task = (async () => {
    await Promise.resolve(); // 保持 async tick 展开

    // 目录处理（不需要 try/catch，目录不存在不会 throw）
    if (directory && fileName) {
      createDirIfNonExist(directory);
    }

    // ========== 1. 本地缓存检查 ==========
    const cachePath = directory && fileName ? path.join(directory, fileName) : null;

    if (cachePath) {
      const exists = await fileExists(cachePath).catch(() => false);

      if (exists) {
        if (showDownloadLog) logger("download", `Match Cache! ${url}`);
        return loadFile(cachePath); // loadFile 若失败由最外层 catch
      }
    }

    // ========== 2. 发请求（最小 catch 单元） ==========
    logger("download", `Start download for ${url}.`);
    const response = await axios
      .get(url, { responseType: "arraybuffer" })
      .catch(async (err) => {
        // 只处理 304，其他错误让外层 catch
        if (err?.response?.status === 304 && cachePath) {
          return { data: await loadFile(cachePath) };
        }
        throw err; // 交给最外层 catch
      });

    const fileBuffer = Buffer.from(response.data);

    // ========== 3. 写入缓存（最小 catch 单元） ==========
    if (cachePath) {
      // 这里部分版本IDE报错，但是执行起来正常
      if(resDebug)console.trace()
      const htmlSig = Buffer.from("<!DOCTYPE html>"); // 判断是不是HTML，这里不tostring，直接Byte对比节省时间
      const slice = Buffer.from(fileBuffer.subarray(0, htmlSig.length));
      if (!slice.equals(htmlSig)) {
        await fs.promises
        .writeFile(cachePath, fileBuffer)
        .catch(() => {}); // 写失败不影响主流程
        logger("download", `Download finish and cache for ${url}.`);
        return fileBuffer;
      }
    }
    throw new Error('IS HTML!!!')
  })()
    .catch((e) => {
      // ========= 最外层 catch，收拢全部错误 ==========
      errUrl.push(url);

      if (url.endsWith(".png")) {
        throw e;
      } else {
        throw new Error(
          `Failed to download file from "${url}". Error: ${e.message}`
        );
      }
    })
    .finally(() => {
      const ok = pendingDownloads.delete(url);
      if (!ok)
        logger("download", `Delete Task Failed for ${url}? ${ok}!!!`);
    });

  pendingDownloads.set(url, task);
  return task;
}


export async function download2(url: string, directory?: string, fileName?: string, cacheTime = 0, isApiRequest = false): Promise<Buffer> {
  if (resDebug) console.trace()
  if (pendingDownloads.has(url)) {
    if(showDownloadLog) logger('download', `Duplicate request detected, waiting for ongoing download: ${url}`);// 重复的文件下载缓存
    return pendingDownloads.get(url)!;
  }
  const task = (async () => {
    await Promise.resolve();
  if (directory != undefined && fileName != undefined) {
    createDirIfNonExist(directory);
  }
  if (resDebug)console.trace()
  try {
    if (errUrl.includes(url)) {
      throw new Error("downloadFile: errUrl.includes(url)");
      
    }
    let eTag: string | undefined;
    const cacheFilePath = path.join(directory || '', `${fileName || ''}`);
    if (fileName && directory) {
        //var ts1 = Date.now()
        //const exists = await callWorker<boolean>('exist',cacheFilePath);
        const exists = await fileExists(cacheFilePath);
        //var ts2 = Date.now()
        //console.log("存在读取用时：" + (ts2-ts1))
        if (exists){
          if(showDownloadLog) logger('download',`Match Cache! ${url}`)
          if(resDebug) console.trace()
          var r = await loadFile(cacheFilePath)
          return  r
        }
      
    }
    const headers = eTag ? { 'If-None-Match': eTag } : {};
    let response;
    try {
      logger('download',`Start download: ${url}`)
  //console.trace()
      response = await axios.get(url, { headers, responseType: 'arraybuffer' });
    } catch (error) {
      if (error.response && error.response.status === 304) {
        //console.log(`ETag matches for "${url}". Using cached file.`);
        const cachedData = await loadFile(cacheFilePath);
        return cachedData;
      } else {
        throw error;
      }
    }

    const fileBuffer = Buffer.from(response.data, 'binary');
    /*
    const newETag = response.headers.etag;
    if (newETag && directory && fileName) {
      fs.writeFileSync(path.join(directory, `${fileName}.etag`), newETag);
    }
    */

    if (directory && fileName) {
      await fs.promises.writeFile(path.join(directory, fileName), fileBuffer);
      // fs.writeFileSync(path.join(directory, fileName), fileBuffer); // 写入文件
    }
    //if(showDownloadLog) logger('download',`Download finish and cache for ${url}.`)
    logger('download',`Download finish and cache for ${url}.`)
    //console.log(`Downloaded file from "${url}"`);
    return fileBuffer;
  } catch (e) {
    //pendingDownloads.delete(url);
    errUrl.push(url);
    if (url.includes('.png')) {
      throw e;
    } else {
      throw new Error(`Failed to download file from "${url}". Error: ${e.message}`);
    }
  }
  finally{
    const wasDeleted = pendingDownloads.delete(url); // 捕获返回值
    if (!wasDeleted) logger('download', `Delete Task Faild for ${url}? ${wasDeleted}!!!`); // 打印结果
  }
})();
pendingDownloads.set(url, task);
return task;
}


const memoryCache = new LRUCacheAny(100);


export async function getJsonAndSave(url: string, directory?: string, fileName?: string, cacheTime = 0,isForceUseCache = true): Promise<any> { // 在调用档线，基础等API数据的时候检查缓存是否过期才使用缓存
 // if (url.includes('312')) throw new Error("模拟错误返回")
 var invaildCacheData = false
 if(showDownloadLog) logger('getJsonAndSave','Start Get API: '+url+' isForceUseCache '+isForceUseCache + ' cacheTime:' + cacheTime)
  if (apiDebug)console.trace()
  var existFiles = false

    if (directory != undefined && fileName != undefined) {
      createDirIfNonExist(directory);
    }
    let eTag: string | undefined;
    const cacheFilePath = path.join(directory || '', `${fileName || ''}`);
    if (fileName && directory) {
      existFiles = await fileExists(cacheFilePath)
      if (existFiles) {
        var isReadCache = false;  // 不读取缓存，做一系列的判断先
        // var isCheckIfUnExpired = false
        var isUnExpired = false
        if (isForceUseCache){// 如果要强制使用缓存
          isReadCache = true
      }
      else {
        const stat = await fs.promises.stat(cacheFilePath);
        const now = Date.now();
        if (now - stat.mtimeMs < cacheTime * 1000){ // 如果不是强制读取，且缓存没过期，则读取缓存
          //console.log(now - stat.mtimeMs,cacheTime * 1000)
          isReadCache = true
        }
      }
        if (isReadCache) {
          //console.log(`Cache time for "${url}" has not expired. Using cached JSON data.`);
          if (memoryCache.has(cacheFilePath)) {
            const cached = memoryCache.get(cacheFilePath);
            //console.log('准备返回json：' + cached)
            return cached;
        }
          //const cachedData = await callWorker<string>('readJsonText', cacheFilePath);

          const cachedJson = await loadJson(cacheFilePath);
          if (cachedJson){
          memoryCache.set(cacheFilePath, cachedJson);
          if(showDownloadLog) logger('getJsonAndSave','API: '+url + ` is Using Cache. Reason: isUnExpired: ${isUnExpired} isForceUseCache ${isForceUseCache} isReadCache ${isReadCache}`)
          return cachedJson;
          }
          else {
            invaildCacheData = true
            logger('getJsonAndSave','Local cache API is invaild. Need to Force update.')
          }
        }
      }
    }
    const eTagFilePath = path.join(directory, `${fileName}.etag`);

    (await fileExists(eTagFilePath) && existFiles && !invaildCacheData) ? eTag = await fs.promises.readFile(eTagFilePath,'utf-8') : undefined;

    const headers = eTag ? { 'If-None-Match': eTag } : {};
    let response;
    var tempJsonObj = undefined;
    logger('getJsonAndSave',`Start download: ${url}`)
      response = await axios.get(url, { headers, responseType: 'arraybuffer' }).catch(async (error)=>{
        if (error.response && error.response.status === 304) {
          logger('getJsonAndSave','API: '+url + ' Bestdori is require client to using Cached data.')
          //console.log(`ETag matches for "${url}". Using cached JSON data.`);
          if (memoryCache.has(cacheFilePath)) {
            const cached = memoryCache.get(cacheFilePath);
            if (cached == undefined) console.log('undefined detected!')
            tempJsonObj = cached
        }
          //const cachedData = await fs.promises.readFile(cacheFilePath, 'utf-8');
          //const cachedJson = callWorker<any>('readJson',cacheFilePath); //因为上一级函数就是await，因此这里不再需要await

          const cachedJson = await loadJson(cacheFilePath);
          memoryCache.set(cacheFilePath, cachedJson);
          //console.log('ready to return ')
          //if(showDownloadLog) logger('getJsonAndSave','API: '+url + ' Bestdori is require client to using Cached data.')
          //logger('getJsonAndSave','API: '+url + ' Bestdori is require client to using Cached data.')
          tempJsonObj = cachedJson
        } else {
          throw error;
        }
      })
      if (tempJsonObj) return tempJsonObj
    const fileBuffer = Buffer.from(response.data, 'binary');
    const fileContent = fileBuffer.toString('utf-8');
    const jsonObject = JSON.parse(fileContent);

    const newETag = response.headers.etag;
    if (newETag && directory && fileName) {
      await fs.promises.writeFile(path.join(directory, `${fileName}.etag`), newETag);
    }

    if (directory && fileName) {
      await fs.promises.writeFile(path.join(directory, fileName), fileContent);
    }

    //console.log(`Downloaded JSON data from "${url}"`);
    //if(showDownloadLog) logger('getJsonAndSave','API: '+url + ' is Downloaded.')
    logger('getJsonAndSave','API: '+url + ' is Downloaded and cached.')
    memoryCache.set(cacheFilePath, jsonObject);
    return jsonObject;
}


// 综合考虑还是用回之前的方案，1kb文件创建worker本身就是不小的开销了
// IO使用池
async function loadJson(path) {
  const str = await fs.promises.readFile(path,'utf-8')
  if (str.length == 0) return null  // 如果长度是0则返回null，告知需要强制更新数据
  var body = JSON.parse(str)
  return body
}

async function loadFile(p: string): Promise<Buffer> {
  return await fs.promises.readFile(p)
}

export async function fileExists(path: string) {
   return fs.existsSync(path)
}



async function createDirIfNonExist(filepath: string) {
  if (!await fileExists(filepath)) {
      await fs.promises.mkdir(filepath, { recursive: true });
  }
}