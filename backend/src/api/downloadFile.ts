import * as path from 'path';
import { assetsRootPath } from '@/config';
import { getCacheDirectory, getFileNameFromUrl } from '@/api/utils';
import { download, showDownloadLog } from '@/api/downloader';
import { Buffer } from 'buffer';
import { assetErrorImageBuffer } from '@/image/utils';
import { logger } from '@/logger';
import * as fs from 'fs';

// 错误 URL 列表和错误缓存过期时间
const errUrl: { [key: string]: number } = {};
const ERROR_CACHE_EXPIRY = 12 * 60 * 60 * 1000; // 半天

async function downloadFile(url: string, IgnoreErr: boolean = true, overwrite = false, retryCount = 1): Promise<Buffer> {
    const currentTime = Date.now();
    if(url.includes('undefined')) {
      console.trace
      throw new Error("downloadFile: url.includes('undefined')");
      
    }

    if (errUrl[url] && currentTime - errUrl[url] < ERROR_CACHE_EXPIRY) {
      if ((url.includes('.png') || url.includes('.svg')) && IgnoreErr) {
        return assetErrorImageBuffer;
      }
    }

    const cacheTime = overwrite ? 0 : 1 / 0;
    const cacheDir = getCacheDirectory(url);
    const fileName = getFileNameFromUrl(url);
    var errInfo = null;
    for (let attempt = 0; attempt < retryCount; attempt++) {
      //let assetNotExists = false;
      var data = null;
      
      if (attempt > 0) {
        logger(`downloader`, `Retrying download for "${url}" (attempt ${attempt + 1}/${retryCount})`);
      }
        //if(showDownloadLog)logger(`downloader`, `Download for "${url}"......`);
        try{
          data = await download(url, cacheDir, fileName, cacheTime);
        }
        catch(e){
          const isHtml = e.message.includes('HTML')
          if (attempt === retryCount - 1 || isHtml) { // 没有重试机会了，可以在这里抛出所有异常
            if(isHtml) logger('downloadFile','HTML Detected. No need to download more for ' + url)
            data = null;
            errInfo = e;
           // return assetErrorImageBuffer
           if ((url.includes('.png') || url.includes('.svg')) && IgnoreErr) {
            errUrl[url] = Date.now();
            return assetErrorImageBuffer;
          }
          }
         continue; // 直接进入下一轮循环
        }//如果无事发生

        const htmlSig = Buffer.from("<!DOCTYPE html>"); // 判断是不是HTML，这里不tostring，直接Byte对比节省时间
        const slice = Buffer.from(data.subarray(0, htmlSig.length));
        if (slice.equals(htmlSig)) {
          fs.unlinkSync(path.join(cacheDir, fileName));
          //assetNotExists = true;
          //console.trace;
          logger("downloadFile","downloadFile: data.toString().startsWith(\"<!DOCTYPE html>\")");
          if ((url.includes('.png') || url.includes('.svg')) && IgnoreErr) {
            errUrl[url] = Date.now();
            return assetErrorImageBuffer;
          }
        }
        return data;  //如果不是网页，响应码200，返回内容
    }
    logger(`downloader`, `Failed to download file from "${url}".`);
    throw errInfo; // 抛出错误
  
}

export { downloadFile };
