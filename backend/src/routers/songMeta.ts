import { drawSongMetaList } from '@/view/songMetaList';
import { Server, getServerByServerId } from '@/types/Server';
import { listToBase64 } from '@/routers/utils';
import { isServer, isServerList } from '@/types/Server';
import express from 'express';
import { body } from 'express-validator';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post('/',
    [
        // Define validation rules for request body
        body('displayedServerList').custom(isServerList),
        body('mainServer').custom(isServer),
        body('compress').optional().isBoolean(),
        body('searchCondition').isString().optional(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { displayedServerList, mainServer, compress,searchCondition } = req.body;

        try {
            const result = await commandSongMeta(displayedServerList, getServerByServerId(mainServer), compress,searchCondition);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandSongMeta(displayedServerList: Server[], mainServer: Server, compress: boolean,searchCondition?:string): Promise<Array<Buffer | string>> {

    if (mainServer == undefined) {
        mainServer = displayedServerList[0]
    }
    return await drawSongMetaList(mainServer, compress,searchCondition)
}

export { router as songMetaRouter }