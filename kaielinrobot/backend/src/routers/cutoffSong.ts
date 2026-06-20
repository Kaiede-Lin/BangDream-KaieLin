import { drawCutoffSongsDetail } from '@/view/cutoffSong';
import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('tier').isInt(),
        body('eventId').optional().isInt(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, tier, eventId, compress } = req.body;

        try {
            const result = await commandCutoffSong(getServerByServerId(mainServer), tier, compress, eventId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandCutoffSong(mainServer: Server, tier: number, compress: boolean, eventId?: number): Promise<Array<Buffer | string>> {
    const validTiers = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
    if (!tier) {
        return ['请输入排名'];
    }
    if (!validTiers.includes(tier)) {
        return [`错误: 档位必须为以下之一: ${validTiers.join(', ')}`];
    }
    if (!eventId) {
        eventId = getPresentEvent(mainServer).eventId;
    }
    return await drawCutoffSongsDetail(eventId, tier, mainServer, compress);
}

export { router as cutoffSongRouter }
