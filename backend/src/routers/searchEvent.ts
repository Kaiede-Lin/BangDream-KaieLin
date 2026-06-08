import { isInteger, parseSearchDate } from '@/routers/utils';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { drawEventDetail } from '@/view/eventDetail';
import { drawEventList } from '@/view/eventList';
import { getServerByServerId, Server } from '@/types/Server';
import { listToBase64 } from '@/routers/utils';
import { isServerList } from '@/types/Server';
import express from 'express';
import { body } from 'express-validator';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { piscina } from '@/WorkerPool';
import mainAPI from '@/types/_Main';
import { parentPort, threadId,isMainThread  } from'worker_threads';
import { getEventListByTimeRange } from '@/types/Event';

if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }


const router = express.Router();

router.post('/',
    [
        // Define validation rules using express-validator
        body('displayedServerList').custom(isServerList),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('text').optional().isString(),
        body('useEasyBG').isBoolean(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { displayedServerList, fuzzySearchResult, text, useEasyBG, compress } = req.body;
        
        // 检查 text 和 fuzzySearchResult 是否同时存在
        if (text && fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
        }
        // 检查 text 和 fuzzySearchResult 是否同时不存在
        if (!text && !fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: '不能同时不存在 text 与 fuzzySearchResult' });
        }

        try {
            const result = await commandEvent(displayedServerList, text || fuzzySearchResult, useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).json({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandEvent(displayedServerList: Server[], input: string | FuzzySearchResult, useEasyBG: boolean, compress: boolean): Promise<Array<Buffer | string>> {

    let fuzzySearchResult: FuzzySearchResult
    // 根据 input 的类型执行不同的逻辑
    if (typeof input === 'string') {
        const dateRange = parseSearchDate(input);
        if (dateRange) {
            const tempEventList = getEventListByTimeRange(dateRange.rangeStart, dateRange.rangeEnd, displayedServerList);
            if (tempEventList.length == 0) {
                return ['没有搜索到符合条件的活动'];
            }
            var result = await drawEventList({ eventId: tempEventList.map((event) => event.eventId) }, displayedServerList, compress);
            if (result == null){    // 意味着查询数量过大要使用worker来进行处理，否则阻塞主线程
                result = (await piscina.drawList.run({
                    matches: { eventId: tempEventList.map((event) => event.eventId) },
                    displayedServerList,
                    compress,
                    mainAPI:{}
                },{name:'drawEventList'})).map(toBuffer)
                return result
            }else{
                return result
            }
        }
        if (isInteger(input)) {
            return await drawEventDetail(parseInt(input), displayedServerList, useEasyBG, compress)
        }
        fuzzySearchResult = fuzzySearch(input)
    } else {
        // 使用 fuzzySearch 逻辑
        fuzzySearchResult = input
    }

    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词']
    }
    var result = await drawEventList(fuzzySearchResult,displayedServerList,compress)
    if (result == null){    // 意味着查询数量过大要使用worker来进行处理，否则阻塞主线程
        result = (await piscina.drawList.run({
            matches: fuzzySearchResult,
            displayedServerList,
            compress,
            mainAPI:null
        },{name:'drawEventList'})).map(toBuffer)
    }

    return result

}
function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x);
    }
    return x; // string 或已是 Buffer
}
export { router as searchEventRouter }