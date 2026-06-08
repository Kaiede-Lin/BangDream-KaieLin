import { downloadFile } from '@/api/downloadFile'
import { assetErrorImageBuffer } from "@/image/utils";
import { getCacheDirectory, getFileNameFromUrl } from '@/api/utils';
import * as fs from 'fs';
import path from 'path';
const cache: Map<string, Buffer> = new Map();
const MAX_CACHE_SIZE = 15;  // 设置最大缓存量
const ENABLE_CACHE = false; // 是否启用缓存，启用后可以加快访问速度，但会占用更多内存。建议在服务器性能较好的情况下启用，在性能较差的情况下禁用。
export function getDownloadFileCacheSize() {
    return cache.size;
}
async function downloadFileCache(url: string,IgnoreErr = true): Promise<Buffer> {
    if (cache.has(url)) {
        // 如果已经有缓存，则直接返回缓存数据
        //console.log(`已有缓存:${url}`)
        return cache.get(url)!;
    }
    // 下载文件
    // const data = await downloadFile(url,IgnoreErr)
    // 将下载的文件缓存起来
    const data = await downloadFile(url,IgnoreErr)
    //const bufferData = Buffer.from(data)//console.log(data)
    if (data.equals(assetErrorImageBuffer)){
        return data;
    }
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    if (ENABLE_CACHE) {
        cache.set(url, data);
    }
    return data;
}

async function downloadFileCacheWithoutError(url: string,IgnoreErr = true): Promise<Buffer> {
    try{
        return await downloadFileCache(url)
    }
    catch{

    }
}
export function checkCache(url){
    const cacheDir = getCacheDirectory(url);
    const fileName = getFileNameFromUrl(url);
    const cachePath = cacheDir && fileName ? path.join(cacheDir, fileName) : null;
    if (fs.existsSync(cachePath)) return true
    return false
}

export { downloadFileCache,downloadFileCacheWithoutError }
