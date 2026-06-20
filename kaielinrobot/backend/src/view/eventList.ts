import { Card } from "@/types/Card";
import mainAPI, { preCacheIcon, setMainAPI } from "@/types/_Main"
import { match, checkRelationList, FuzzySearchResult } from "@/fuzzySearch"
import { App, Canvas } from 'skia-canvas'
import { drawDatablock, drawDatablockHorizontal } from '@/components/dataBlock';
import { line } from '@/components/list';
import { stackImage, stackImageHorizontal, resizeImage, getOptHeight, getOptDrawCount } from '@/components/utils'
import { drawTitle } from '@/components/title';
import { outputFinalBuffer } from '@/image/output'
import { Server, getIcon, getServerByName } from '@/types/Server'
import { Event, getPresentEvent, sortEventList } from '@/types/Event';
import { drawCardListInList } from '@/components/list/cardIconList';
import { GetProbablyTimeDifference, changeTimefomant } from '@/components/list/time';
import { drawTextWithImages } from '@/image/text';
import { drawEventDetail, getEventGachaAndCardList } from './eventDetail'
import { drawDottedLine } from '@/image/dottedLine'
import { statConfig } from '@/components/list/stat'
import { globalDefaultServer } from '@/config';
import { Image } from 'skia-canvas';
import pLimit from 'p-limit'
import { logger } from "@/logger";
import { drawTips } from "@/components/tips";
const limit = pLimit(15);
let maxHeight = 7000
const maxColumns = 7
import { parentPort, threadId,isMainThread  } from'worker_threads';
import { loadImageOnce } from "@/components/card";

if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }



//表格用默认虚线


export async function initForWorker() {
    await loadImageOnce()
    await preCacheIcon()
}
export async function drawEventList(matches: FuzzySearchResult, displayedServerList: Server[] = globalDefaultServer, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    if (apiData) {
        setMainAPI(apiData)
        //await loadImageOnce()
        //await preCacheIcon()
    }
    //计算模糊搜索结果
    var heavyLoad = false
    var tempEventList: Array<Event> = [];//最终输出的活动列表
    var eventIdList: Array<number> = Object.keys(mainAPI['events']).map(Number);//所有活动ID列表
    for (let i = 0; i < eventIdList.length; i++) {
        const tempEvent = new Event(eventIdList[i]);
        var isMatch = match(matches, tempEvent, ['eventId']);
        /*
        // 如果在所有所选服务器列表中都不存在，则不输出
        var numberOfNotReleasedServer = 0;
        for (var j = 0; j < displayedServerList.length; j++) {
            var server = displayedServerList[j];
            if (tempEvent.startAt[server] == null) {
                numberOfNotReleasedServer++;
            }
        }
        if (numberOfNotReleasedServer == displayedServerList.length) {
            isMatch = false;
        }
        */  // 全服务器输出

        //如果有数字关系词，则判断关系词
        if (matches._relationStr != undefined) {
            //如果之后范围的话则直接判断
            if (isMatch || Object.keys(matches).length == 1) {
                isMatch = checkRelationList(tempEvent.eventId, matches._relationStr as string[])
            }
        }

        if (isMatch) {
            tempEventList.push(tempEvent);
        }
    }
    if (tempEventList.length == 0) {
        return ['没有搜索到符合条件的活动']
    }
    if (tempEventList.length == 1) {
        return await drawEventDetail(tempEventList[0].eventId,displayedServerList,true,compress)
    }
    let offsetN:number = 0  // 定义列表Offset
    // 按照开始时间排序
    sortEventList(tempEventList,displayedServerList)

    var eventPromises: Promise<{ index: number, image: Canvas }>[] = [];
    var tempH = 0;
    //console.log(tempEventList)
    await Promise.all(tempEventList.map(e => e.initFull(false)));
    if (tempEventList.length <25 && isMainThread){ // 如果查询数量少于25且我不是Worker
        for (let i = 0; i < tempEventList.length; i++) {
            eventPromises.push(
                limit(async () => ({
                    index: i,
                    image: await drawEventInList(
                        tempEventList[i],
                        displayedServerList
                    )
                }))
            )
        }
    }
    else{   // 降级同步输出
        if (isMainThread) return null // 如果不是worker，那么就返回null。Null被中间件捕获到后会直接发去Worker请求
        logger('drawEventList','Concurrent Level down to sync draw! Reason: tempEventList is too large,size is ' + tempEventList.length);
        heavyLoad = true
        for (let i = 0; i < tempEventList.length; i++) {
            eventPromises.push(
                limit(async () => ({
                    index: i,
                    image: await drawEventInList(
                        tempEventList[i],
                        displayedServerList
                    )
                }))
            )
        }
    }

    var eventResults = await Promise.all(eventPromises);
    eventPromises.length = 0    // 清理对promise的引用
    eventResults.sort((a, b) => a.index - b.index);

    var tempEventImageList: Canvas[] = [];
    var eventImageListHorizontal: Canvas[] = [];
    //console.log(offsetN)
    // 预判活动Height，设置合理的maxHeight
    //maxHeight = getOptHeight(eventResults.length,1000,300,10,30,Math.ceil(offsetN / 300))
    let maxCount = getOptDrawCount(eventResults.length,1000,290,10,30,Math.ceil(offsetN / 300)) 
    if (maxCount > 31)maxCount=31
    const line2: Canvas = drawDottedLine({
        width: 30,
        height: ((maxCount -3) * 280),
        startX: 5,
        startY: 0,
        endX: 15,
        endY: 6995,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    for (var i = 0; i < eventResults.length; i++) {
        var tempImage = eventResults[i].image;
        tempH += tempImage.height;  // tempH > maxHeight
        
        if (i % (maxCount) == 0 && i!=0) {
            if (tempEventImageList.length > 0) {
                eventImageListHorizontal.push(stackImage(tempEventImageList));
                eventImageListHorizontal.push(line2);
            }
            tempEventImageList = [];
            tempH = tempImage.height;
        }
        tempEventImageList.push(tempImage);
        tempEventImageList.push(line);
        //最后一张图
        if (i == eventResults.length - 1) {
            eventImageListHorizontal.push(stackImage(tempEventImageList));
            eventImageListHorizontal.push(line2);
        }
    }

    eventImageListHorizontal.pop();
    eventResults.length = 0
    tempEventImageList.length = 0   // 清内存
    if (eventImageListHorizontal.length > maxColumns) {
        let times = 0
        let tempImageList: Array<string | Buffer> = []
        tempImageList.push('活动列表过长，已经拆分输出')
        for (let i = 0; i < eventImageListHorizontal.length; i++) {
            const tempCanv = eventImageListHorizontal[i];
            if (tempCanv == line2) {
                continue
            }
            const all = []
            if (times == 0) {
                all.push(await drawTitle('查询', `活动列表 共${tempEventList.length}条结果`))
            }
            all.push(await drawDatablock({ list: [tempCanv] }))
            if (heavyLoad) all.push(await drawTips({text:'[Priority Level Down] 模拟数量过多，CiRCLE工作人员喘不过气啦！'}))
            tempImageList.push(await outputFinalBuffer({
            imageList: all,
             useEasyBG: true
            }))
            all.length = 0
            /*
            const buffer = await outputFinalBuffer({
                imageList: all,
                useEasyBG: true
            })
            tempImageList.push(buffer)
            */
            times += 1
        }
        eventImageListHorizontal.length = 0 // clear mem
        return tempImageList
    } else {
        const all = []
        const eventListImage = await drawDatablockHorizontal({
            list: eventImageListHorizontal
        })
        eventImageListHorizontal.length = 0 // clear memory
        all.push((await drawTitle(`查询  共${tempEventList.length}条结果`, `活动列表`)))
        all.push(eventListImage)
        if (heavyLoad) all.push(await drawTips({text:'[优先级降级] 查询数量过多，CiRCLE工作人员喘不过气啦！'}))
        const buffer = await outputFinalBuffer({
            imageList: all,
            useEasyBG: true,
            compress: compress,
        })
        return [buffer]
    }

}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
async function drawEventInList(event: Event, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    //await event.initFull(false) //优化调度

    var textSize = 25 * 3 / 4;
    var content = []
    var Tips = []
    //活动类型
    content.push(`ID: ${event.eventId.toString()}  ${await event.getTypeName()}\n`)
    //活动时间
    var numberOfServer = Math.min(displayedServerList.length, 2)
    const currentEvent = getPresentEvent(getServerByName("cn"));
    var getIconPromise:Promise<Image>[] = []
    for (var i = 0; i < numberOfServer; i++) {
        let server = displayedServerList[i]
        if (server == getServerByName('cn') && event.startAt[server] == null ) {//&& event.eventId > currentEvent.eventId
            getIconPromise.push(getIcon(server))
            Tips.push(`${changeTimefomant(GetProbablyTimeDifference(event.eventId, currentEvent))} (预计开放时间)\n`)
        }
        else {
            getIconPromise.push(getIcon(server))
            Tips.push(`${changeTimefomant(event.startAt[server])} - ${changeTimefomant(event.endAt[server])}\n`)
        }
    }
    //console.log(`${changeTimefomant(GetProbablyTimeDifference(299, currentEvent))}`)
    //活动加成
    //属性
    var attributeListPromise:Promise<Image>[] = []
    var attributeList = event.getAttributeList()
    var attributePrecent = []
    for (var precent in attributeList) {
        for (var i = 0; i < attributeList[precent].length; i++) {
            attributeListPromise.push(attributeList[precent][i].getIcon())
        }
        attributePrecent.push(`+${precent}% `)
    }
    var characterListPromise:Promise<Image>[] = []
    //角色

    var characterPrecent = []
    var characterList = event.getCharacterList()
    for (var precent in characterList) {
        for (var i = 0; i < characterList[precent].length; i++) {
            characterListPromise.push(characterList[precent][i].getIcon())
        }
        characterPrecent.push(`+${precent}% `)
    }
    var statText = ''
    //偏科，如果有的话
    if (Object.keys(event.eventCharacterParameterBonus).length != 0) {
        
        for (const i in event.eventCharacterParameterBonus) {
            if (i == 'eventId') {
                continue
            }
            if (Object.prototype.hasOwnProperty.call(event.eventCharacterParameterBonus, i)) {
                const element = event.eventCharacterParameterBonus[i];
                if (element == 0) {
                    continue
                }
                statText += ` ${statConfig[i].name} +${element}%`
            }
        }
        //content.push(statText)
    }
    var getBannerImagePromise:Promise<Image | Canvas>[] = []
    getBannerImagePromise.push(event.getBannerImage())


    //活动期间卡池卡牌
    var cardList: Card[] = []
    var cardIdList: number[] = []//用于去重
    var getEventGachaAndCardListPromise = []
    
    
    for (var i = 0; i < displayedServerList.length; i++) {
        var server = displayedServerList[i]
        // var EventGachaAndCardList = await getEventGachaAndCardList(event, server, true)
        getEventGachaAndCardListPromise.push(getEventGachaAndCardList(event, server, true))
    }
    
    
   // 这里只展示活动Up的那五张卡牌
   /*
    var server = Server.jp
    getEventGachaAndCardListPromise.push(getEventGachaAndCardList(event, server, true))
    */

    const results = await Promise.all([
        Promise.all(getIconPromise),
        Promise.all(attributeListPromise),
        Promise.all(characterListPromise),
        Promise.all(getBannerImagePromise),
        Promise.all(getEventGachaAndCardListPromise)
    ]);
    const [
        getIconResult,
        attributeListResult,
        characterListResult,
        getBannerImageResult,
        getEventGachaAndCardListResult
    ] = results

    // clear ref
    getIconPromise.length = 0
    attributeListPromise.length = 0
    characterListPromise.length = 0
    getBannerImagePromise.length = 0
    getEventGachaAndCardListPromise.length = 0
    
    for(var i = 0;i<getIconResult.length;i++){
        content.push(getIconResult[i], Tips[i])
    }

    for(var ap of attributePrecent){
        for(var r1 of attributeListResult){
            content.push(r1)
        }
        content.push(`${ap}`)
    }



    for(var cp of characterPrecent){
        for(var r2 of characterListResult){
            content.push(r2)
        }
        content.push(`${cp}`)
    }

    content.push(statText)
    var bannerImageR = getBannerImageResult[0]


    var textImage = drawTextWithImages({
        content: content,
        textSize,
        maxWidth: 500
    })
    content.length = 0
    Tips.length = 0     // clear mem
    const eventBannerImage = resizeImage({
        image: bannerImageR,
        heightMax: 100
    })
    var imageUp = stackImageHorizontal([eventBannerImage, new Canvas(20, 1), textImage])

    //const getEventGachaAndCardListResult = await Promise.all(getEventGachaAndCardListPromise)

    for(var getEventGachaAndCardListResultSub of getEventGachaAndCardListResult){
        var tempGachaCardList = getEventGachaAndCardListResultSub.gachaCardList
        for (let i = 0; i < tempGachaCardList.length; i++) {
            const tempCard = tempGachaCardList[i];
            if (cardIdList.indexOf(tempCard.cardId) != -1) {
                continue
            }
            cardIdList.push(tempCard.cardId)
            cardList.push(tempCard)
        }
    }

    var rewardCards = event.rewardCards
    for (var i = 0; i < rewardCards.length; i++) {
        cardList.push(new Card(rewardCards[i]))
    }
    var imageDown = await drawCardListInList({
        cardList: cardList,
        lineHeight: 110,
        trainingStatus: false,
        cardIdVisible: true,
    })
    //return stackImage([imageUp, imageDown])
    const result = stackImage([imageUp, imageDown])


    return result
}