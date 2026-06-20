import { Event } from '@/types/Event';
import { Card } from '@/types/Card'
import { drawList, line, drawListByServerList, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock'
import { drawGachaDatablock } from '@/components/dataBlock/gacha'
import { Image, Canvas } from 'skia-canvas'
import { drawBannerImageCanvas } from '@/components/dataBlock/utils'
import { drawTimeInList } from '@/components/list/time';
import { drawText } from '@/image/text';
import { drawAttributeInList } from '@/components/list/attribute'
import { drawCharacterInList } from '@/components/list/character'
import { statConfig } from '@/components/list/stat'
import { drawCardListInList } from '@/components/list/cardIconList'
import { getPresentGachaList, Gacha } from '@/types/Gacha'
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { drawDegreeListOfEvent } from '@/components/list/degreeList';
import { Song, getPresentSongList } from '@/types/Song'
import { drawSongListDataBlock } from '@/components/dataBlock/songList';
import { globalDefaultServer, serverNameFullList } from '@/config';
import { drawSongInList, drawSongInListForQuerySong, drawSongListInList, drawSongListInListWithMoreDetail } from '@/components/list/song';
import { resizeImage } from '@/components/utils';
import mainAPI from '@/types/_Main';
import { drawEventTeamIconBlock } from '@/components/dataBlock/eventTeams';

export async function drawEventDetail(eventId: number, displayedServerList: Server[] = globalDefaultServer, useEasyBG: boolean, compress: boolean): Promise<Array<Buffer | string>> {
    const event = new Event(eventId)
    if (!event.isExist) {
        return ['错误: 活动不存在']
    }
    await event.initFull()
    let useFever = false
    let useFeverList = ['story','live_try','mission_live']
    for (let ufl of useFeverList){
        if (event.eventType == ufl){
            useFever = true
            break
        }
    }
    var list: Array<Image | Canvas> = []
    const bannerImagePromise: Promise<Image>[] = []; 
    const BGImagePromise: Promise<Image>[] = []; 
    BGImagePromise.push(event.getEventBGImage());
    // const [eventBannerImage,]
    //bannner
    bannerImagePromise.push(event.getBannerImage())     // GetBannerImage的多线程IO
    // var eventBannerImage = await event.getBannerImage()     // 要改，往后
    //var eventBannerImageCanvas = drawBannerImageCanvas(eventBannerImage)    // 这个不需要


    //标题


    //类型
    var typeImage = await drawList({
        key: '类型', text: event.getTypeName()
    })

    //活动ID
    var IdImage = await drawList({
        key: 'ID', text: event.eventId.toString()
    })

    var characterList = event.getCharacterList()
    /*
    for (const i in characterList) {
        if (Object.prototype.hasOwnProperty.call(characterList, i)) {
            const element = characterList[i];
            list.push(await drawCharacterInList({
                content: element,
                text: ` +${i}%`
            }))
        }
    }
    */
    const drawCharacterInListPromise: Promise<Image | Canvas>[] = [];
    for (const i in characterList) {
        if (Object.prototype.hasOwnProperty.call(characterList, i)) {
            const element = characterList[i];
            // 不 await，直接把 Promise 放进数组
            drawCharacterInListPromise.push(drawCharacterInList({
                content: element,
                text: ` +${i}%`
            }));
        }
    }

    // const characterListPromiseTask = await Promise.all(drawCharacterInListPromise);
    /*
    for(const i of characterListPromiseTask){
        list.push(i)
    }
    */
    //牌子
    const drawDegreeListOfEventPromise: Promise<Image | Canvas>[] = []; 
    drawDegreeListOfEventPromise.push(drawDegreeListOfEvent(event, displayedServerList))


    //有歌榜活动的歌榜歌曲
    const drawSongListInListPromise: Promise<Image | Canvas>[] = []; 
    const eventTypes: string[] = ['versus', 'challenge', 'medley']
    let degreeSongs:Song[] = []
    if (eventTypes.includes(event.eventType) && event.musics != undefined && event.musics.length > 0) {
        // let songs: Song[] = []
        let defaultServer = displayedServerList[0]
        if (!event.musics[displayedServerList[0]]) {
            defaultServer = Server.jp
        }
        for (let i = 0; i < event.musics[defaultServer].length; i++) {
            degreeSongs.push(new Song(event.musics[defaultServer][i].musicId))
        }
        drawSongListInListPromise.push(drawSongListInListWithMoreDetail(degreeSongs,null,null,
            !event.startAt[displayedServerList[0]]?[Server.jp]:displayedServerList,false))
    }

    const drawSongListInListMorePromise: Promise<Image | Canvas>[] = []; 
    for (let i = 0; i < displayedServerList.length; i++) {
        const server = displayedServerList[i];
        if (event.startAt[server] == null) {
            continue
        }
        const songList: Song[] = getPresentSongList(server, event.startAt[server], event.endAt[server] + 1000 * 60 * 60);

        if (songList.length !== 0) {
            const isDuplicate = isSameSongList(degreeSongs,songList)    // 这里使用原本的实现， 节省cpu

            if (!isDuplicate) {
                // drawCardListInListPromise.push(drawSongListDataBlock(songList, `${serverNameFullList[server]}相关歌曲`))
                drawSongListInListMorePromise.push(drawSongListDataBlock(songList, `${serverNameFullList[server]}相关歌曲`));
            }
        }
    }

    //活动表情
    const getRewardStampPromise: Promise<(Image | Canvas)[]>[] = []; 
    getRewardStampPromise.push(event.getRewardStamp(displayedServerList[0]))
    // const stampImage = await event.getRewardStamp(displayedServerList[0])
    // 活动装饰
    const getRewardDecoPromise: Promise<Image | Canvas>[] = []; 
    getRewardDecoPromise.push(event.getRewardDeco(displayedServerList[0]))
    // FES Team Icon
    const getTeamIconPromise: Promise<Image[]>[] = []; 
    getTeamIconPromise.push(event.getTeamIcon(displayedServerList[0]))
    //奖励卡牌
    var rewardCardList: Card[] = []
    for (let i = 0; i < event.rewardCards.length; i++) {
        const cardId = event.rewardCards[i];
        rewardCardList.push(new Card(cardId))
    }
    const drawCardListInListPromise: Promise<Image | Canvas>[] = []; 
    drawCardListInListPromise.push(drawCardListInList({
        key: '奖励卡牌',
        cardList: rewardCardList,
        cardIdVisible: true,
        skillTypeVisible: true,
        cardTypeVisible: true,
        trainingStatus: false
    }))

    var gachaCardList: Card[] = []
    var gachaCardIdList: number[] = []//用于去重
    var gachaImageList: Canvas[] = []
    var gachaIdList: number[] = []//用于去重
    const drawGachaDatablockPromise: Promise<Canvas>[] = [];     //这个是gachaImageList
    //活动期间卡池卡牌
    var getEventGachaAndCardPromiseList:Promise<{ gachaList, gachaCardList }>[]= []

    for (var i = 0; i < displayedServerList.length; i++) {
        var server = displayedServerList[i]
        if (event.startAt[server] == null) {
            //getEventGachaAndCardPromiseList.push(null)
        }
        getEventGachaAndCardPromiseList.push(getEventGachaAndCardList(event, server))
    }
    const getEventGachaAndCardFinalList = await Promise.all(getEventGachaAndCardPromiseList);
    //console.log(getEventGachaAndCardFinalList)
    let serverFlags:Server = null
    for (var i = 0; i < displayedServerList.length; i++) {
        var server = displayedServerList[i]
        if (event.startAt[server] == null) {
            continue
        }
            var EventGachaAndCardList = getEventGachaAndCardFinalList[i]
            var tempGachaList = EventGachaAndCardList.gachaList
            var tempGachaCardList = EventGachaAndCardList.gachaCardList
            for (let q = 0; q < tempGachaList.length; q++) {
                const tempGacha = tempGachaList[q];
                /*
                if (q == 0) console.log('---------------------------------------------------')
                console.log(tempGacha.gachaId)
                */
                if (gachaIdList.indexOf(tempGacha.gachaId) != -1) {
                    continue
                }
                if (serverFlags!= displayedServerList[i]) {
                    //console.log(serverFlags,displayedServerList[i])
                    drawGachaDatablockPromise.push(drawGachaDatablock(tempGacha, `${serverNameFullList[server]}相关卡池`,[displayedServerList[i]]))
                    //gachaImageList.push(await drawGachaDatablock(tempGacha, `${serverNameFullList[server]}相关卡池`))
                    serverFlags = displayedServerList[i]
                }
                else {
                    drawGachaDatablockPromise.push(drawGachaDatablock(tempGacha,null,[displayedServerList[i]]))
                    //gachaImageList.push(await drawGachaDatablock(tempGacha))
                }
                gachaIdList.push(tempGacha.gachaId)
            }
            for (let q = 0; q < tempGachaCardList.length; q++) {
                const tempCard = tempGachaCardList[q];
                if (gachaCardIdList.indexOf(tempCard.cardId) != -1) {
                    continue
                }
                gachaCardIdList.push(tempCard.cardId)
                gachaCardList.push(tempCard)
            }
        
    }
    //if (gachaCardIdList.length >0) drawCardListInListPromise.push(line)
    drawCardListInListPromise.push(drawCardListInList({    // 这个是不需要等待IO的
        key: '活动期间卡池卡牌',
        cardList: gachaCardList,
        cardIdVisible: true,
        skillTypeVisible: true,
        cardTypeVisible: true,
        trainingStatus: false
    }))



    // const drawCardListInListPromise: Promise<Image | Canvas>[] = []; 
    //歌曲



    const results = await Promise.all([
        Promise.all(bannerImagePromise),
        Promise.all(drawCharacterInListPromise),
        Promise.all(drawDegreeListOfEventPromise),
        Promise.all(drawSongListInListPromise),
        Promise.all(getRewardStampPromise),
        Promise.all(drawCardListInListPromise),
        Promise.all(drawGachaDatablockPromise),
        Promise.all(BGImagePromise),
        Promise.all(drawSongListInListMorePromise),
        Promise.all(getRewardDecoPromise),
        Promise.all(getTeamIconPromise)
    ]);
    const [
        bannerImageResult,
        drawCharacterInListResult,
        drawDegreeListOfEventResult,
        drawSongListInListResult,
        getRewardStampResult,
        drawCardListInListResult,
        drawGachaDatablockResult,
        BGImageResult,
        drawSongListInListMoreResult,
        getRewardDecoResult,
        teamIconResult
    ] = results;

    var eventBannerImage = bannerImageResult[0]
    var eventBannerImageCanvas = drawBannerImageCanvas(eventBannerImage)
    list.push(eventBannerImageCanvas)
    list.push(new Canvas(800, 30))
    //标题
    list.push(await drawListByServerList(event.eventName, '活动名称', displayedServerList)) // 这个已经缓存过的了，不需要并行加载
    list.push(line)
    list.push(drawListMerge([typeImage, IdImage]))
    list.push(line)
       //开始时间
       list.push(await drawTimeInList({
        key: '开始时间',
        content: event.startAt,
        eventId: event.eventId,
        estimateCNTime: true
    }))
    list.push(line)
    list.push(await drawTimeInList({
        key: '结束时间',
        content: event.endAt
    }))
    list.push(line)
        //活动属性加成
    list.push(await drawList({
        key: '活动加成'
    }))
    var attributeList = event.getAttributeList()    // 活动加成也上缓存了，不需要并行绘制
    for (const i in attributeList) {
        if (Object.prototype.hasOwnProperty.call(attributeList, i)) {
            const element = attributeList[i];
            list.push(await drawAttributeInList({
                content: element,
                text: ` +${i}%`
            }))
        }
    }
    list.push(line)

    //活动角色加成
    list.push(await drawList({
        key: '活动角色加成'
    }))
    var characterList = event.getCharacterList()
    const characterListPromiseTask = drawCharacterInListResult;
    for(const i of characterListPromiseTask){
        list.push(i)
    }
    list.push(line)
    //活动偏科加成(stat)
    if (Object.keys(event.eventCharacterParameterBonus).length != 0) {
        var statText = ''
        for (const i in event.eventCharacterParameterBonus) {
            if (i == 'eventId') {
                continue
            }
            if (Object.prototype.hasOwnProperty.call(event.eventCharacterParameterBonus, i)) {
                const element = event.eventCharacterParameterBonus[i];
                if (element == 0) {
                    continue
                }
                statText += `${statConfig[i].name} + ${element}%  `
            }
        }
        list.push(await drawList({
            key: '活动偏科加成',
            text: statText
        }))
        list.push(line)
    }
    if (event.eventType == 'festival' && teamIconResult[0] && teamIconResult[0].length >= 2 && event.teamList.entries.length >= 2) {

        const teamIconCanvas = drawEventTeamIconBlock(teamIconResult[0], [event.teamList.entries[0].teamName, event.teamList.entries[1].teamName],event.teamList.entries[0].themeTitle);
        //console.log(teamIconCanvas)
        list.push(
            await drawList({
                key: '队伍',
                content: [teamIconCanvas],
                textSize: teamIconCanvas.height,
                lineHeight: teamIconCanvas.height,
                spacing: 7
            })
        );
        list.push(line);
    }
    if (getRewardDecoResult[0]){
        list.push(
            await drawList({
                key: '活动装饰',
                content: [getRewardDecoResult[0]],
                textSize: 64,
                lineHeight: 64
            })
        )
        list.push(line)
    }
    for(const i of drawDegreeListOfEventResult){
        list.push(i)
        list.push(line)
    }
    for(const i of drawSongListInListResult){
        list.push(i)
        list.push(line)
    }

    if (getRewardStampResult[0]){
        list.push(
            await drawList({
                key: '活动表情',
                content: getRewardStampResult[0].filter(Boolean),
                textSize: 160,
                lineHeight: 160,
                spacing:7
            })
        )
        list.push(line)
    }

    for(const i of drawCardListInListResult){
        
        list.push(i)
        list.push(line)
    }
    
    for(const i of drawGachaDatablockResult){
        gachaImageList.push(i)
    }
    



    if(mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']){
        var totalPlayerDataCN = await drawList({
            text:  mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']?'参与数 ' +mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']+'人':'暂无数据'
        })
        var bannedPlayerDataCN = await drawList({
            text: mainAPI['events'][event.eventId.toString()]['bannedPlayerDataCN']?'违规数 ' + mainAPI['events'][event.eventId.toString()]['bannedPlayerDataCN']+'人':'暂无数据'
        })
        //list.push(line)
        list.push(
            await drawList({
                key: '国服 参与人数 Beta.',
                //content: [totalPlayerDataCN,bannedPlayerDataCN],
                textSize: 30
                //lineHeight: 40*1.5
            })
        )
        list.push(drawListMerge([totalPlayerDataCN, bannedPlayerDataCN]))
    }


    var listImage = await drawDatablock({ list })
    //创建最终输出数组

    var all = []
    all.push(await drawTitle('查询', '活动'))

    all.push(listImage)

    //const drawSongListInListMoreResult = await Promise.all(drawSongListInListMorePromise)
    for(const i of drawSongListInListMoreResult){
        all.push(i)
    }






    //卡池
    for (let i = 0; i < gachaImageList.length; i++) {
        all.push(gachaImageList[i])
    }
   
    var BGimage = await event.getEventBGImage()
        BGimage = BGImageResult[0]

    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: useEasyBG,
        BGimage,
        text: 'Event',
        compress: compress,
    })

    return [buffer];
}
function isSameSongSet(a: Song[], b: Song[]): boolean {     //此实现考虑了内容一致但顺序不一样的清空
    if (a.length !== b.length) return false;
    const setA = new Set(a.map(s => s.songId));
    for (const s of b) {
        if (!setA.has(s.songId)) return false;
    }
    return true;
}
function isSameSongList(a: Song[], b: Song[]): boolean {    // 这是原本的实现，不考虑顺序。
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].songId !== b[i].songId) return false;
    }
    return true;
}



export async function getEventGachaAndCardList(event: Event, mainServer: Server, useCache = false) {
    var gachaList: Gacha[] = []
    var gachaIdList = []//用于去重
    if (event.startAt[mainServer] == null) {
        
        return { gachaCardList: [], gachaList: [] }
    }
    let tempGachaList = await getPresentGachaList(mainServer, event.startAt[mainServer], event.endAt[mainServer])
    for (var j = 0; j < tempGachaList.length; j++) {
        if (gachaIdList.indexOf(tempGachaList[j].gachaId) == -1 && tempGachaList[j].publishedAt[mainServer]) {
            gachaList.push(tempGachaList[j])
            gachaIdList.push(tempGachaList[j].gachaId)
        }
    }
    var gachaCardIdList: number[] = []
    const promiseList: Promise<void>[] = []; 

    for (var i = 0; i < gachaList.length; i++) {


        const p = (async function () {
            var tempGacha = gachaList[i]
            if (tempGacha.type == 'birthday') { // 加载生日池
                //return;
            }
            if (tempGacha.publishedAt[mainServer]){
                //console.log("tempGacha initFull 这里不应该一段一段出现。")
                await tempGacha.initFull(!useCache)
                // console.log(tempGacha.pickUpCardId)
                var tempCardList = null;
                tempCardList = tempGacha.pickUpCardId
                /*
                //检查是否有超过7张稀有度2的卡牌，发布了太多2星卡的卡池会被跳过
                var rarity2CardNum = 0
                for (var j = 0; j < tempCardList.length; j++) {
                    let tempCard = new Card(tempCardList[j])
                    if (tempCard.rarity == 2) {
                        rarity2CardNum++
                    }
                } 
                if (rarity2CardNum > 6) {
                    continue
                }
                */
                for (var j = 0; j < tempCardList.length; j++) {
                    var tempCardId = tempCardList[j]
                    if (gachaCardIdList.indexOf(tempCardId) == -1) {
                        gachaCardIdList.push(tempCardId)
                    }
                }
            }
        })();
        promiseList.push(p)
    }
    await Promise.all(promiseList)
    var gachaCardList: Card[] = []
    for (var i = 0; i < gachaCardIdList.length; i++) {
        var tempCardId = gachaCardIdList[i]
        var tempCard = new Card(tempCardId)
        //如果卡牌的发布时间不在活动期间内，则不显示
        if (tempCard.releasedAt[mainServer] < event.startAt[mainServer] - 1000 * 60 * 60 * 24 || tempCard.releasedAt[mainServer] > event.endAt[mainServer]) {
            continue
        }
        gachaCardList.push(tempCard)
    }

    gachaCardList.sort((a, b) => {
        return a.rarity - b.rarity
    })
    gachaList.sort((a, b) => {
        if (a.publishedAt[mainServer] != b.publishedAt[mainServer]) {
            return a.publishedAt[mainServer] - b.publishedAt[mainServer]
        }
        else {
            return a.gachaId - b.gachaId
        }
    })
    //console.log(gachaList)
    return { gachaCardList, gachaList }
}