import express from 'express';
import { body } from 'express-validator';
import { drawSongList } from '@/view/songList';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { isInteger, listToBase64 } from '@/routers/utils';
import { isServerList } from '@/types/Server';
import { drawSongDetail } from '@/view/songDetail';
import { Song } from '@/types/Song';
import { getServerByServerId, Server } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { piscina } from '@/WorkerPool';
import mainAPI, { loadMainAPINow } from '@/types/_Main';
import { switchDataSource, USE_HHWX_SOURCE_PREFER } from '@/config';
import { clearMeasureCache } from '@/image/text';
import { getApiDataCacheSize, getPD_Size } from '@/api/downloader';
import { getCardDataCacheSize } from '@/types/Card';
import { getEventDataCacheSize } from '@/types/Event';
import { getGachaDataCacheSize } from '@/types/Gacha';
import { getDownloadFileCacheSize } from '@/api/downloadFileCache';
import { compareSameDataArray } from '@/view/cutoffEventTop';
import { drawCutoffSongsDetail } from '@/view/cutoffSong';

const router = express.Router();

router.post(
    '/',
    [
        // Express-validator checks for type validation
        body('displayedServerList').custom(isServerList),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('text').optional().isString(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { displayedServerList, fuzzySearchResult, text, compress } = req.body;
        if (text == "fetch" || text == "同步数据"|| text == "立即同步"|| text == "33824"|| text == "873283"|| text == "7963" || text == "7337374"){
            return res.send(listToBase64([await loadMainAPINow()]));
        }
        if (text == "compareSameDataArrayDev"){
            var a = (compareSameDataArray([1,1,2],[1,2,1]))
            var b = (compareSameDataArray([1,1,2],[1,2,2]))
            var c = (compareSameDataArray([NaN],[1]))
            console.log(a,b,c)
            return res.send(listToBase64([ `${a} ${b} ${c}`]));
        }
        if (text == "8734499"){
            return res.send(listToBase64([await switchDataSource()]));
        }
        if (text == "2532722243"){
            return res.send(listToBase64([await clearMeasureCache(true)]));
        }
        if (text == "45622542"){
            global.gc?.()
            return res.send(listToBase64(['已尝试触发GC']));
        }
        if (text == "ycxsong"){
            return res.send(listToBase64(await drawCutoffSongsDetail(311,100,Server.cn,true)));
            return 
        }
        if (text == "6364636"){
            const m = process.memoryUsage();
            var str = '[Tsugu Runtime Memory Infomation]\n'
            console.log(`[MEM] rss=${(m.rss/1024/1024).toFixed(1)}MB, heapUsed=${(m.heapUsed/1024/1024).toFixed(1)}MB, heapTotal=${(m.heapTotal/1024/1024).toFixed(1)}MB, ext=${(m.external/1024/1024).toFixed(1)}MB`);
            str+=(`[MEM] rss=${(m.rss/1024/1024).toFixed(1)}MB, heapUsed=${(m.heapUsed/1024/1024).toFixed(1)}MB, heapTotal=${(m.heapTotal/1024/1024).toFixed(1)}MB, ext=${(m.external/1024/1024).toFixed(1)}MB`);
            try {
                // @ts-ignore
                const handles = process._getActiveHandles();
                // @ts-ignore
                const requests = process._getActiveRequests();
                str +='\n'
                console.log(`[MEM] handles=${handles.length}, requests=${requests.length}`);
                str+=(`[MEM] handles=${handles.length}, requests=${requests.length}`);
                var cache = clearMeasureCache()
                var pd = getPD_Size()
                console.log(cache);
                console.log(pd);
                str +='\n'
                str += cache
                //str +='\n'
                str += pd
                console.log('eventDataCache size:', getEventDataCacheSize());
                console.log('cardDataCache size:', getCardDataCacheSize());
                console.log('gachaDataCache size:', getGachaDataCacheSize());
                console.log('downloadFileCacheSize:', getDownloadFileCacheSize());
                console.log('APIDataCacheSize:', getApiDataCacheSize());
                str +='\n'
                str += `eventDataCache size:${getEventDataCacheSize()}\n`
                str += `cardDataCache size:${getCardDataCacheSize()}\n`
                str += `gachaDataCache size:${getGachaDataCacheSize()}\n`
                str += `downloadFileCache size:${getDownloadFileCacheSize()}\n`
                str += `APIDataCache size:${getApiDataCacheSize()}\n`
              } catch {}

            return res.send(listToBase64([str]));
        }
        // 检查 text 和 fuzzySearchResult 是否同时存在
        if (text && fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
        }
        // 检查 text 和 fuzzySearchResult 是否同时不存在
        if (!text && !fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: '不能同时不存在 text 与 fuzzySearchResult' });
        }

        try {
            const result = await commandSongWorker(displayedServerList, text || fuzzySearchResult, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);


export async function commandSong(displayedServerList: Server[], input: string | FuzzySearchResult, compress: boolean): Promise<Array<Buffer | string>> {

    let fuzzySearchResult: FuzzySearchResult

    // 根据 input 的类型执行不同的逻辑
    if (typeof input === 'string') {
        if (isInteger(input)) {
            return await drawSongDetail(new Song(parseInt(input)), displayedServerList, compress)
        }
        fuzzySearchResult = fuzzySearch(input)
        //console.log(fuzzySearchResult)
    } else {
        // 使用 fuzzySearch 逻辑
        fuzzySearchResult = input
    }

    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词']
    }
    return await drawSongList(fuzzySearchResult, displayedServerList, compress)
}
export async function commandSongWorker(displayedServerList, input, compress) {

    let fuzzySearchResult: FuzzySearchResult;
    if (typeof input === 'string') {
        if (isInteger(input)) {
            /*
            return await piscina.drawDetail.run({
                songId: parseInt(input),
                displayedServerList,
                compress
            });
            */
            return await drawSongDetail(new Song(parseInt(input)), displayedServerList, compress)
        }   // 这个主线程跑就行
        fuzzySearchResult = fuzzySearch(input);
        console.log(fuzzySearchResult)
    } else {
        fuzzySearchResult = input;
    }

    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词'];
    }
    var result = await drawSongList(fuzzySearchResult,displayedServerList,compress);
    if (result == null){
        result = (await piscina.drawList.run({
            matches: fuzzySearchResult,
            displayedServerList,
            compress,
            mainAPI:null
        })).map(toBuffer)
    }
    // ➜ 直接调用 worker
    return result;
}

function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x);
    }
    return x; // string 或已是 Buffer
}
export { router as searchSongRouter }

