import { getPresentEvent } from '@/types/Event';
import { drawList, line, drawListByServerList, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { drawBannerImageCanvas } from '@/components/dataBlock/utils'
import { drawTimeInList } from '@/components/list/time';
import { Gacha } from '@/types/Gacha'
import { Server, getServerByPriority } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawGashaPaymentMethodInList } from '@/components/list/gachaPaymentMethod';
import { drawGachaRateInList } from '@/components/list/gachaRate';
import { globalDefaultServer, serverNameFullList } from '@/config';
import { drawGachaPickupInList } from '@/components/list/gachaPickUp'

export async function drawGachaDetail(gachaId: number, displayedServerList: Server[] = globalDefaultServer, useEasyBG: boolean, compress: boolean): Promise<Array<Buffer | string>> {
    const gacha = new Gacha(gachaId)
    if (!gacha.isExist) {
        return ['错误: 卡池不存在']
    }
    await gacha.initFull()
    var list: Array<Image | Canvas> = []
    //bannner
    var getBannerImagePromise:Promise<Image>[] = []
    getBannerImagePromise.push(gacha.getBannerImage())

    // list.push(gachaBannerImageCanvas)
    
    var server = getServerByPriority(gacha.publishedAt, displayedServerList)


    var drawGashaPaymentMethodInListPromise:Promise<Canvas>[] = []
    drawGashaPaymentMethodInListPromise.push(drawGashaPaymentMethodInList(gacha))


    //概率分布
    var drawGachaRateInListPromise:Promise<Canvas>[] = []
    
    var drawGachaPickupInListPromise:Promise<Canvas>[] = []
    try{

        drawGachaPickupInListPromise.push(drawGachaPickupInList(gacha, server))
    }
    catch(e){
        console.log(e)
    }
    //卡池pickUp



    //相关活动
    var tempEventIdList = []//用于防止重复
    // var eventImageList: Array<Canvas | Image> = []
    var drawEventDatablockPromise:Promise<Canvas>[] = []
    for (let k = 0; k < displayedServerList.length; k++) {
        let server = displayedServerList[k]
        if (gacha.publishedAt[server] == null) {
            continue
        }
        var relatedEvent = getPresentEvent(server, gacha.publishedAt[server])
        if (relatedEvent != null && !tempEventIdList.includes(relatedEvent.eventId)) {
            tempEventIdList.push(relatedEvent.eventId)
            drawEventDatablockPromise.push(drawEventDatablock(relatedEvent, displayedServerList, `${serverNameFullList[server]}相关活动`))
        }
    }

    var gachaBGImagePromise:Promise<Image>[] = []
    gachaBGImagePromise.push(gacha.getGachaBGImage())
    //const gachaBGImage = await gacha.getGachaBGImage(); // REMOVE

    const results = await Promise.all([
        Promise.all(getBannerImagePromise),
        Promise.all(drawGashaPaymentMethodInListPromise),
        Promise.all(drawEventDatablockPromise),
        Promise.all(drawGachaRateInListPromise),
        Promise.all(drawGachaPickupInListPromise).catch(err => {return []}),
        Promise.all(gachaBGImagePromise),
    ]);
    const [
        getBannerImageResult,
        drawGashaPaymentMethodInListResult,
        drawEventDatablockResult,
        drawGachaRateInListResult,
        drawGachaPickupInListResult,
        gachaBGImageResult
    ] = results


    var gachaBannerImage = getBannerImageResult[0]
    var gachaBannerImageCanvas = drawBannerImageCanvas(gachaBannerImage)



    list.push(gachaBannerImageCanvas)
    //标题
    list.push(await drawListByServerList(gacha.gachaName, '卡池名称', displayedServerList))
    list.push(line)

    //类型
    var typeImage = await drawList({
        key: '类型', text: gacha.getTypeName()
    })

    //卡池ID
    var IdImage = await drawList({
        key: 'ID', text: gacha.gachaId.toString()
    })

    list.push(drawListMerge([typeImage, IdImage]))
    list.push(line)

    //开始时间
    list.push(await drawTimeInList({
        key: '开始时间',
        content: gacha.publishedAt
    }))
    list.push(line)

    //结束时间
    list.push(await drawTimeInList({
        key: '结束时间',
        content: gacha.closedAt
    }))
    list.push(line)

    //描述
    list.push(await drawListByServerList(gacha.description, '描述', displayedServerList))
    list.push(line)
 



    
    for(var r of drawGashaPaymentMethodInListResult){
        list.push(r)
    }
    list.push(line)
    list.push(await drawGachaRateInList(gacha, server))
    for(var r of drawGachaRateInListResult){
        list.push(r)
    }

    list.push(line)

    for(var r1 of drawGachaPickupInListResult){
        list.push(r1)
    }
    list.push(line)


    var listImage = await drawDatablock({ list })
    var all = []

    all.push(await drawTitle('查询', '卡池'))
    list.push(new Canvas(800, 30))


    all.push(listImage)
    for (let i = 0; i < drawEventDatablockResult.length; i++) {
        all.push(drawEventDatablockResult[i])
    }
    





    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: useEasyBG,
        BGimage: gachaBGImageResult[0],
        text: 'Gacha',
        compress: compress,
    })
    return [buffer]
}
