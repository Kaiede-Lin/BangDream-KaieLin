import express from 'express';
import { body } from 'express-validator';
import { fuzzySearch } from '@/fuzzySearch';
import { isInteger, listToBase64 } from '@/routers/utils';
import { isServerList } from '@/types/Server';
import { drawSongChart } from '@/view/songChart';
import { getServerByServerId, Server } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { drawSongList, matchSongList } from '@/view/songList';
import { piscina } from '@/WorkerPool';

const router = express.Router();

router.post(
    '/',
    [
        // Express-validator checks for type validation
        body('displayedServerList').custom(isServerList),
        body('songId').optional().isString(),
        body('difficultyId').isInt().optional(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {


        const { displayedServerList, songId, difficultyId, compress } = req.body;

        try {
            const result = await commandSongChart(displayedServerList, songId, compress, difficultyId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);


export async function commandSongChart(displayedServerList: Server[], songId: any, compress: boolean, difficultyId = 3): Promise<Array<Buffer | string>> {
    /*
    text = text.toLowerCase()
    var fuzzySearchResult = fuzzySearch(text)
    console.log(fuzzySearchResult)
    if (fuzzySearchResult.difficulty === undefined) {
        return ['错误: 不正确的难度关键词,可以使用以下关键词:easy,normal,hard,expert,special,EZ,NM,HD,EX,SP']
    }
    */
    if (isInteger(songId)) {
        return await drawSongChart(songId, difficultyId, displayedServerList, compress)
    }else{
        const fuzzySearchResult = fuzzySearch(songId)
        const tempSongList = matchSongList(fuzzySearchResult, displayedServerList)

        if (tempSongList.length == 0) {
            return ['没有搜索到符合条件的歌曲']
        }
        else if (tempSongList.length == 1) {
            var songIdNum = tempSongList[0].songId
            return await drawSongChart(songIdNum, difficultyId, displayedServerList, compress)
        }
        else if (tempSongList.length > 1) {

            var result = await drawSongList(fuzzySearchResult,displayedServerList,compress,'搜索存在多个结果，建议改用歌曲ID进行谱面搜索：')
                if (result == null){
                    result = (await piscina.drawList.run({
                        matches: fuzzySearchResult,
                        displayedServerList,
                        compress,
                        message:'搜索存在多个结果，建议改用歌曲ID进行谱面搜索：'
                    })).map(toBuffer)
                }
                // ➜ 直接调用 worker
                return result;
        }

    }
}
function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x);
    }
    return x; // string 或已是 Buffer
}

export { router as songChartRouter }