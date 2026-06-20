import { Server } from "@/types/Server";
import { listToBase64Old } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { getServerByServerId } from '@/types/Server';
import { PlayerDB } from "@/database/playerDB";
import { playerDetail } from "@/teamBuilder/types";
import express from 'express';
import { body } from 'express-validator'; // Import express-validator functions
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { getPresentEvent } from '@/types/Event';
import { buildResult } from "@/teamBuilder/types"
import { dataPrepare } from "@/teamBuilder/dataPrepare";
import { drawResult } from "@/view/calcResult";
import { compositionResultDB } from "@/database/compositionResultDB";
import { piscina } from '@/WorkerPool';

export let isRunningTeamBuilderCalculator = false   // 只允许一个组队组曲计算进行
export let isRunningTeamBuilderCalculatorTaskId = 0 // 记录组队组曲任务的开始执行时间
const router = express.Router();
const playerDB = new PlayerDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')
const resultDB = new compositionResultDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')
router.post('',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('eventId').optional().isInt(), // eventId is optional and must be an integer if provided
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
        body('save').optional().isBoolean(),
        body('description').optional(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, eventId, useEasyBG, compress, save, description } = req.body;

        try {
            if(!isRunningTeamBuilderCalculator) {
                isRunningTeamBuilderCalculator = true
                isRunningTeamBuilderCalculatorTaskId = new Date().getTime()
            const result = await commandCalcResult(playerId, getServerByServerId(mainServer), useEasyBG, compress, eventId, save, description);
            isRunningTeamBuilderCalculator = false
            res.send(listToBase64Old(result));
            }
            else{
                
                var str = `当前已经有一个组队组曲的计算正在进行，任务ID为：${isRunningTeamBuilderCalculatorTaskId}\n已执行${Math.floor((new Date().getTime() - isRunningTeamBuilderCalculatorTaskId)/1000)}秒\n请稍后再发送计算请求叭\n组队组曲任务极端情况下甚至可能需要600秒用于计算，计算期间Tsugu的部分功能会受限或暂时无响应。`
                //console.log(str)
                res.send(listToBase64Old([str]));
            }
        } catch (e) {
            isRunningTeamBuilderCalculator = false
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);


export async function commandCalcResult(playerId: number, mainServer: Server, useEasyBG: boolean, compress: boolean, eventId?: number, save?: boolean, description?: string)/*: Promise<Array<Buffer | string>>*/ {

    let player :playerDetail  = await playerDB.getPlayer(playerId)
    let currentEvent = player.currentEvent
    if (eventId) {
        currentEvent = eventId
    }
    if (!currentEvent) {
        currentEvent = getPresentEvent(mainServer).eventId
    }
    if (currentEvent != player.currentEvent) {
        //player = await playerDB.updCurrentEvent(playerId, mainServer, currentEvent)
    }

    if (!save) {
        save = false
    }
    console.log('开始计算......')
    //let res: buildResult = await dataPrepare(player, mainServer)
    let result = (await piscina.drawList.run({
        playerId:playerId,
        mainServer:mainServer,
        eventId:currentEvent,
        save:save,
        desc:description
    },{name:'dataPrepare'})).map(toBuffer)

    return result
}
function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x);
    }
    return x; // string 或已是 Buffer
  }
export { router as calcResultRouter }