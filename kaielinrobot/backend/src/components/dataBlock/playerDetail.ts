import { Player } from '@/types/Player';
import { drawImageListCenter } from "@/components/list";
import { drawDatablock } from '@/components/dataBlock'
import { drawText, drawTextWithImages, releaseCanvas } from "@/image/text";
import { Image, Canvas } from 'skia-canvas';
import { drawDegree } from '@/components/degree';
import { Degree } from '@/types/Degree';
import { Card } from '@/types/Card';
import { drawTitle } from '@/components/title';
import { getIcon } from '@/types/Server';

export async function drawPlayerDetailBlockWithIllust(player: Player): Promise<Canvas> {
    var list: Array<Canvas | Image> = []

    // 获取玩家牌子
    var userProfileDegreeMap = player.profile.userProfileDegreeMap.entries
    var drawDegreePromise = []
    for (var i in userProfileDegreeMap) {
        var tempDegree = userProfileDegreeMap[i]
        const drawDegreeAsyncGet = (async()=>{
            return drawDegree(new Degree(tempDegree.degreeId), player.server)
        })()
        drawDegreePromise.push(drawDegreeAsyncGet)
    }
    //var drawDegreeResult = await Promise.all(drawDegreePromise)   // 需要改为全部的

    //获取玩家首页卡面插画
    var getCardTrimImagePromise = []
    const userIllustData = player.profile.userIllust
    const illustCard = new Card(userIllustData.cardId)
    getCardTrimImagePromise.push(illustCard.getCardTrimImage(userIllustData.trainingStatus))

    const results = await Promise.all([
        Promise.all(drawDegreePromise),
        Promise.all(getCardTrimImagePromise),
    ]);
    const [drawDegreeResult,getCardTrimImageResult] = results



    //玩家名
    var playerText = await drawText({
        text: player.profile.userName,
        maxWidth: 800,
        textSize: 75
    })
    list.push(drawImageListCenter([playerText]))
    
    //等级
    var levelText = await drawText({
        text: `等级 ${player.profile.rank}`,
        maxWidth: 800,
        textSize: 35
    })
    list.push(drawImageListCenter([levelText]))
    list.push(new Canvas(1, 25))
    //degree(牌子)列表
    var degreeImageList: Array<Canvas | Image> = []

    for(var dGR of drawDegreeResult){
        degreeImageList.push(dGR)
        degreeImageList.push(new Canvas(20, 1))
    }
    degreeImageList.pop()
    list.push(drawImageListCenter(degreeImageList))
    list.push(new Canvas(1, 25))
    //玩家描述
    var introductionText = await drawText({
        text: player.profile.introduction,
        maxWidth: 800,
        textSize: 35
    })
    list.push(drawImageListCenter([introductionText]))
    list.push(new Canvas(1, 25))

    //玩家ID与服务器
    let userId: string
    if (player.profile.publishUserIdFlg) {
        userId = player.profile.userId.toString()
    }
    else {
        userId = 'ID未公开'
    }
    var idText = drawTextWithImages({
        content: [await getIcon(player.server), userId],
        maxWidth: 800,
        textSize: 35
    })
    list.push(drawImageListCenter([idText]))

    var dataBlock = drawDatablock({ list, opacity: 1 })
    //获取玩家首页卡面插画
    var illust = getCardTrimImageResult[0]

    //最终绘图
    var titleImage = drawTitle('查询', '玩家信息')
    var canvas = new Canvas(1000, 900 + (await dataBlock).height)
    var ctx = canvas.getContext('2d')
    ctx.drawImage(illust, 0, 0, 1000, 1000)
    ctx.drawImage(await titleImage, 0, 0)
    ctx.drawImage(await dataBlock, 0, 900)

    return canvas
}
