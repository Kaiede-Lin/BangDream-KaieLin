import { Gacha } from "@/types/Gacha";
import { drawListWithLine, drawList } from "@/components/list";
import { drawDatablock } from '@/components/dataBlock'

import { Canvas } from 'skia-canvas';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils'
import { Server } from "@/types/Server";

export async function drawGachaDatablock(gacha: Gacha, topLeftText?: string,displayServerList?:Server[]) {
    var list = []
    var gachaBannerImage = await gacha.getBannerImage(displayServerList)
    var gachaBannerImageCanvas = drawBannerImageCanvas(gachaBannerImage)
    list.push(gachaBannerImageCanvas)

    var textImageList: Array<Canvas> = []
    /*
    //卡池名称
    textImageList.push(await drawListByServerList({
        content: gacha.gachaName
    }))
    */

    //卡池类型与ID
    textImageList.push(await drawList({
        text: `${gacha.getTypeName()}   ID: ${gacha.gachaId}`
    }))

    /*
    //卡池时间
    textImageList.push(await drawTimeInList({
        content: gacha.startAt,
        estimateCNTime: true
    }))
    */

    //画左侧有竖线的排版
    var textImageListImage = drawListWithLine(textImageList)
    list.push(textImageListImage)

    return (drawDatablock({ list, topLeftText }))
}
