import { drawCutoffDetail } from '@/view/cutoffDetail';
import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { drawTopRateChanged, drawTopRateDetail, drawTopRateSleep, drawTopRateSpeedRank } from '@/view/cutoffEventTop';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('playerId').optional().isInt(),
        body('tier').optional().isInt(),
        body('count').optional().isInt(),
        body('compress').optional().isBoolean(),
        body('mode').optional().isInt(),    // 1：实时查岗  3：查停摆   2：查变动
        body('eventId').optional().isInt(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, playerId, tier, count, compress,mode,eventId } = req.body;

        try {
           // console.log(eventId)
            const result = await commandTopRateDetail(getServerByServerId(mainServer), playerId, tier, compress, count,mode,eventId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandTopRateDetail(mainServer: Server, playerId: number, tier: number, compress: boolean, maxCount?: number,mode:number = 0,eventId:number = 0): Promise<Array<Buffer | string>> {
    if ((mode !=1)&&!playerId && !tier) {
        // 这里查前十车速总表
        return ['请输入玩家id或排名']
    }
    if (eventId == null ) eventId = getPresentEvent(mainServer).eventId
    if (eventId == undefined ) eventId = getPresentEvent(mainServer).eventId
    if (eventId == 0 ) eventId = getPresentEvent(mainServer).eventId
    if(mode == 1 )return await drawTopRateSpeedRank(eventId, playerId, tier, maxCount, mainServer, compress)
    if(mode == 3 )return await drawTopRateSleep(eventId, playerId, tier, maxCount, mainServer, compress)
    if(mode == 2 )return await drawTopRateChanged(eventId, playerId, tier, maxCount, mainServer, compress)
    return await drawTopRateDetail(eventId, playerId, tier, maxCount, mainServer, compress)
}

export { router as topRateDetailRouter }