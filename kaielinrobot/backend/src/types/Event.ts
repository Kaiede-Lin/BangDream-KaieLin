import { callAPIAndCacheResponse } from '@/api/getApi';
import { Canvas, Image, loadImage } from 'skia-canvas'
import { checkCache, downloadFileCache, downloadFileCacheWithoutError } from '@/api/downloadFileCache'
import { Server, getServerByPriority } from '@/types/Server'
import mainAPI from '@/types/_Main';
import { Attribute } from '@/types/Attribute';
import { Character } from '@/types/Character';
import { globalDefaultServer, Bestdoriurl } from '@/config';
import { readJSONFromBuffer, stringToNumberArray } from '@/types/utils'
import { logger } from '@/logger';
import { Card } from './Card';
import { GetProbablyTimeDifference } from '@/components/list/time';
import { LRUCache } from '@/LRUCache'
import { assetErrorImageBuffer } from '@/image/utils';

//var eventDataCache = {}
const MAX_CACHE_SIZE = 200;  // 设置Event最大缓存量
const ENABLE_CACHE = true; // 是否启用缓存
//var cardDataCache = {}
const eventDataCache= new LRUCache(MAX_CACHE_SIZE);

const typeName = {
    "story": "一般活动 (协力)",
    "versus": "竞演LIVE (对邦)",
    "live_try": "LIVE试炼 (EX)",
    "challenge": "挑战LIVE (CP)",
    "mission_live": "任务LIVE (协力)",
    "festival": "团队LIVE FES (5v5)",
    "medley": "组曲LIVE (3组曲)"
}

export interface EventTeamListEntry {
    eventId: number;
    teamId: number;
    teamName: string;
    iconFileName: string;
    themeTitle: string;
}

export interface EventTeamList {
    entries: EventTeamListEntry[];
}

export function getEventDataCacheSize(){
    return eventDataCache.getCacheSize()
}
export class Event {
    eventId: number;
    isExist: boolean = false;
    isInitFull = false;
    data = null;
    eventType: string;
    eventName: Array<string | null>;
    bannerAssetBundleName: string;
    startAt: Array<number | null>;
    endAt: Array<number | null>;
    attributes: Array<{
        attribute: "happy" | "cool" | "powerful" | "pure";
        percent: number;
    }>;
    characters: Array<{
        characterId: number;
        percent: number;
    }>;
    eventAttributeAndCharacterBonus: {
        pointPercent: number;
        parameterPercent: number;
    }
    members: Array<{
        eventId: number;
        situationId: number;
        percent: number;
        seq: number;
    }>;
    musics?: Array<
        Array<
            {
                musicId: number,
                musicRankingRewards?: Array<{
                    fromRank: number,
                    toRank: number,
                    resourceType: string,
                    resourceId: number,
                    quantity: number
                }>
            }
        >
        | null>
    rewardCards: Array<number>
    teamList: EventTeamList = { entries: [] };

    //other
    //enableFlag: Array<null>;
    assetBundleName: string;
    publicStartAt: Array<number | null>;
    publicEndAt: Array<number | null>;
    /*
    distributionStartAt: Array<number | null>;
    distributionEndAt: Array<number | null>;
    bgmAssetBundleName: string;
    bgmFileName: string;
    aggregateEndAt: Array<number | null>;
    exchangeEndAt: Array<number | null>;
    */
    pointRewards: Array<
        Array<
            {
                point: string,
                rewardType: string,
                rewardId?: number
                rewardQuantity: number,
            }
        >
        | null
    >
    rankingRewards: Array<
        Array<
            {
                fromRank: number,
                toRank: number,
                rewardType: string,
                rewardId: number
                rewardQuantity: number,
            }
        >
        | null
    >
    eventCharacterParameterBonus?: {//偏科
        performance?: number,
        technique?: number,
        visual?: number
    } = {}
    limitBreaks: Array<Array<number>>
    //以下用于模糊搜索
    characterId: number[]
    attribute: string[]
    bandId: number[]
    nickname: string[]
    isInitfull: boolean = false

    constructor(eventId: number) {
        this.eventId = eventId
        const eventData = mainAPI['events'][eventId.toString()]
        if (eventData == undefined) {
            this.isExist = false;
            return
        }
        this.isExist = true;
        this.assetBundleName = eventData['assetBundleName']
        this.eventType = eventData['eventType'];
        this.eventName = eventData['eventName'];
        this.bannerAssetBundleName = eventData['bannerAssetBundleName'];
        this.startAt = stringToNumberArray(eventData['startAt']);
        this.endAt = stringToNumberArray(eventData['endAt']);
        this.attributes = eventData['attributes'];
        this.characters = eventData['characters'];
        this.rewardCards = eventData['rewardCards'];
        this.teamList = eventData['teamList'] ?? { entries: [] };
        this.nickname = eventData['nickname']?eventData['nickname']:[]
        //用于模糊搜索
        this.characterId = []
        for (let i = 0; i < this.characters.length; i++) {
            const element = this.characters[i];
            this.characterId.push(element.characterId)
        }
        this.attribute = []
        for (let i = 0; i < this.attributes.length; i++) {
            const element = this.attributes[i];
            this.attribute.push(element.attribute)
        }
        //如果所有character来自同一个band，则bandId为该bandId
        this.bandId = []
        let isSameBand = true
        for (var i = 0; i < this.characters.length; i++) {
            if (new Character(this.characters[i].characterId).bandId != new Character(this.characters[0].characterId).bandId) {
                isSameBand = false
                break
            }
        }
        if (isSameBand) {
            this.bandId.push(new Character(this.characters[0].characterId).bandId)
        }
        else {
            this.bandId.push(0)
        }
    }
    async initFull(useCache: boolean = true) {
        if (this.isInitFull) {
            return
        }

        if (this.isExist == false) {
            return
        }
        if (eventDataCache.has(this.eventId) && !useCache) {
            var eventData = eventDataCache.get(this.eventId)
        }
        else {
            var eventData = await this.getData(useCache)
            if (ENABLE_CACHE) {
                eventDataCache.set(this.eventId, eventData)
            }
        }
        this.isInitFull = true;
        this.eventType = eventData['eventType'];
        this.eventName = eventData['eventName'];
        this.assetBundleName = eventData['assetBundleName'];
        this.bannerAssetBundleName = eventData['bannerAssetBundleName'];
        this.startAt = stringToNumberArray(eventData['startAt']);
        this.endAt = stringToNumberArray(eventData['endAt']);
        this.attributes = eventData['attributes'];
        this.characters = eventData['characters'];
        this.teamList = eventData['teamList'] ?? { entries: [] };
        this.members = eventData['members'];
        this.eventAttributeAndCharacterBonus = eventData['eventAttributeAndCharacterBonus'];
        this.musics = eventData['musics'];
        this.rewardCards = eventData['rewardCards'];
        //other
        //this.enableFlag = eventData['enableFlag'];
        this.publicStartAt = stringToNumberArray(eventData['publicStartAt']);
        this.publicEndAt = stringToNumberArray(eventData['publicEndAt']);
        this.pointRewards = eventData['pointRewards'];
        this.rankingRewards = eventData['rankingRewards'];
        /*
        this.distributionStartAt = eventData['distributionStartAt'];
        this.distributionEndAt = eventData['distributionEndAt'];
        this.bgmAssetBundleName = eventData['bgmAssetBundleName'];
        this.bgmFileName = eventData['bgmFileName'];
        this.aggregateEndAt = eventData['aggregateEndAt'];
        this.exchangeEndAt = eventData['exchangeEndAt'];
        */
        if (eventData['eventCharacterParameterBonus'] != undefined) {
            this.eventCharacterParameterBonus = eventData['eventCharacterParameterBonus']
        }
        this.limitBreaks = Array.from({ length: 6 }, () => (new Array<number>(5)).fill(0))
        for (const { rarity, rank, percent } of eventData["limitBreaks"]) {
            this.limitBreaks[rarity][rank] = percent
        }
        
        this.isInitfull = true
    }
    async getData(update: boolean = true): Promise<object> {
        if(this.data!= null) return this.data   // 如果存在了则直接返回this.data,不再访问callAPIAndCacheResponse
        var time = update ? 0 : 1 / 0
        var eventData = await callAPIAndCacheResponse(`${Bestdoriurl}/api/events/${this.eventId}.json`, time,3,!update,0);
        this.data = eventData
        //console.log(eventData)
        //eventData["eventCharacterParameterBonus"] = eventData["eventCharacterParameterBonus"] ?? eventCharacterParameterBonusFix[this.eventId.toString()]
        return eventData
    }
    async getBannerImage(displayedServerList: Server[] = globalDefaultServer): Promise<Image> {
        if (!displayedServerList) displayedServerList = globalDefaultServer
        var server = getServerByPriority(this.startAt, displayedServerList)
        var serverJp = Server.jp
        try {
            var bannerCache = checkCache(`${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/images_rip/banner.png`)
            var LogoCache = checkCache(`${Bestdoriurl}/assets/${Server[serverJp]}/homebanner_rip/${this.bannerAssetBundleName}.png`)
            if (bannerCache || (!bannerCache && !LogoCache)){   // 如果BannerCache与LogoCache都不存在或者存在bannerCache
                var BannerImageBuffer = await downloadFileCache(`${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/images_rip/banner.png`, false)
                return await loadImage(BannerImageBuffer)
            }
            if (!bannerCache && LogoCache){
                downloadFileCacheWithoutError(`${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/images_rip/banner.png`, false)
                throw Error('Need to switch event banner source.')
            }

        } catch (e) {
            logger(`Event`, `"${e}"`);
            var server = Server.jp
            var BannerImageBuffer = await downloadFileCache(`${Bestdoriurl}/assets/${Server[server]}/homebanner_rip/${this.bannerAssetBundleName}.png`)
            return await loadImage(BannerImageBuffer)
            
        }
    }
    async getEventBGImage(): Promise<Image> {
        var server = getServerByPriority(this.startAt)
        var BGImageBuffer = await downloadFileCache(`${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/topscreen_rip/bg_eventtop.png`)
        return await loadImage(BGImageBuffer)
    }
    //活动规则轮播图
    async getEventSlideImage(tempServer: Server): Promise<Image[]> {
        const server = getServerByPriority(this.startAt, [tempServer])
        const result: Image[] = []
        const baseUrl = `${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/slide_rip/`
        let ruleNumber = 1
        while (true) {
            try {
                const url = `${baseUrl}rule${ruleNumber}.png`
                const SlideImageBuffer = await downloadFileCache(url, false)
                result.push(await loadImage(SlideImageBuffer))
            } catch (e) {
                break
            }
            ruleNumber++
        }
        return result
    }
    //活动主界面trim
    async getEventTopscreenTrimImage(): Promise<Image> {
        const server = getServerByPriority(this.startAt)
        const url = `${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/topscreen_rip/trim_eventtop.png`
        const TopscreenTrimImageBuffer = await downloadFileCache(url)
        return await loadImage(TopscreenTrimImageBuffer)
    }
    async getEventLogoImage(tempServer: Server): Promise<Image> {
        const server = getServerByPriority(this.startAt, [tempServer])
        var LogoImageBuffer = await downloadFileCache(`${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/images_rip/logo.png`)
        return await loadImage(LogoImageBuffer)
    }
    getTypeName() {
        if (typeName[this.eventType] == undefined) {
            return this.eventType
        }
        return typeName[this.eventType]
    }
    getAttributeList() {//反向排序加成，返回{percent:[attribute]}
        var attribute = this.attributes
        var attributeList: { [precent: string]: Array<Attribute> } = {}
        for (const i in attribute) {
            if (Object.prototype.hasOwnProperty.call(attribute, i)) {
                const element = attribute[i];
                var percent = element.percent
                if (attributeList[percent.toString()] == undefined) {
                    attributeList[percent.toString()] = []
                }
                attributeList[percent.toString()].push(new Attribute(element.attribute))
            }
        }
        return (attributeList)
    }
    getCharacterList() {
        var character = this.characters
        var characterList: { [precent: string]: Array<Character> } = {}
        for (const i in character) {
            if (Object.prototype.hasOwnProperty.call(character, i)) {
                const element = character[i];
                var percent = element.percent
                if (characterList[percent.toString()] == undefined) {
                    characterList[percent.toString()] = []
                }
                characterList[percent.toString()].push(new Character(element.characterId))
            }
        }
        return (characterList)
    }
    getMemberList() {
        var member = this.members
        var memberList: { [precent: string]: Array<Card> } = {}
        for (const i in member) {
            if (Object.prototype.hasOwnProperty.call(member, i)) {
                const element = member[i];
                var percent = element.percent
                if (memberList[percent.toString()] == undefined) {
                    memberList[percent.toString()] = []
                }
                memberList[percent.toString()].push(new Card(element.situationId))
            }
        }
        return (memberList)
    }
    async getRewardStamp(server:Server): Promise<Image[]> {
        const stampReardsId:number[] = []   // 贴纸合集
        //const allStamps = await callAPIAndCacheResponse(`${Bestdoriurl}/api/stamps/all.2.json`)
        const allStamps = mainAPI['stamps']
        const rewards = this.pointRewards[0]?this.pointRewards[0].concat(server==Server.jp?[]:this.pointRewards[server]).filter(Boolean):[]
        
        const rankingRewards = this.rankingRewards[0]?this.rankingRewards[0].concat(server==Server.jp?[]:this.rankingRewards[server]).filter(Boolean):[]
        //let rewardId = -1
        for(let i = 0; i < rewards?.length; i++){
            if(rewards[i].rewardType == 'stamp'){
                if (!stampReardsId.includes(rewards[i].rewardId)){
                    stampReardsId.push(rewards[i].rewardId)
                }
                //rewardId = rewards[i].rewardId
                //stampReardsId.push(rewards[i].rewardId)
                //break
            }
        }
        for(let i = 0; i < rankingRewards?.length; i++){
            if(rankingRewards[i].rewardType == 'voice_stamp'){
                if (!stampReardsId.includes(rankingRewards[i].rewardId)){
                    stampReardsId.push(rankingRewards[i].rewardId)
                }
            }
        }
        const stampAssetName:string[] = []
        for(const i in allStamps){
            for(const j of stampReardsId){
                if (j.toString() == i){
                    if(allStamps[i]['imageName'][server]){
                        stampAssetName.push(allStamps[i]['imageName'][server])
                    }else if (allStamps[i]['imageName'][0]){
                        stampAssetName.push(allStamps[i]['imageName'][0])       // 日服备份
                    }
                }
            }
        }
        if(stampAssetName.length == 0){
            return undefined
        }
        let serverName = 'jp'
        if(this.startAt[server] && this.startAt[server] < Date.now()){
            serverName = Server[server]
        }
        try {
            const ImageListPromise:Promise<Buffer>[] = []
            for(const assetName of stampAssetName){
                ImageListPromise.push(downloadFileCache(`${Bestdoriurl}/assets/${serverName}/stamp/01_rip/${assetName}.png`,false).catch(() => undefined))
            }
            const ImageBufferList = await Promise.all(ImageListPromise)
            let ImageList:Image[] = []
            for(const ImageBuffer of ImageBufferList){
                if(ImageBuffer) ImageList.push(await loadImage(ImageBuffer))
            }
            if (ImageList.length == 0) return undefined
            return ImageList
        }
        catch{
            return undefined
        }
    }
    async getRewardDeco(server:Server): Promise<Image> {
        
        //const allStamps = await callAPIAndCacheResponse(`${Bestdoriurl}/api/stamps/all.2.json`)
        const allDeco = mainAPI['deco']
        if(!this.rankingRewards[server]){   // Undefined处理
            return undefined
        }
        const rewards = this.rankingRewards[server].filter(Boolean)
        let rewardId = -1
        for(let i = 0; i < rewards?.length; i++){
            if(rewards[i].rewardType == 'deco_pins'){
                rewardId = rewards[i].rewardId
                break
            }
        }
        let decoAssentName = ''
        for(const i in allDeco){
            if(i == rewardId.toString()){
                decoAssentName = allDeco[i]['assetBundleName']
            }
        }
        if (rewardId == -1) return undefined
        if(decoAssentName == ''){
            return undefined
        }
        let serverName = 'cn'
        if(this.startAt[server] && this.startAt[server] < Date.now()){
            serverName = Server[server]
        }
        try {
            const decoBuffer = await downloadFileCache(`${Bestdoriurl}/assets/${serverName}/deco/pins_rip/${decoAssentName}.png`)
            return await loadImage(decoBuffer)
        }
        catch{
            return undefined
        }
    }
    async getTeamIcon(server:Server): Promise<Image[]>{
        let teamIconAssetName  = []
        //console.log(this.teamList)
        if ((this.teamList.entries.length!=0)){
            teamIconAssetName.push(this.teamList.entries[0].iconFileName)
            teamIconAssetName.push(this.teamList.entries[1].iconFileName)
            //console.log(teamIconAssetName)
            //console.log(this.teamList.entries[0])
            //console.log(this.teamList.entries[1])
        }
        
        else return undefined
        if (teamIconAssetName.length<2) return undefined
        try {
            const ImageListPromise:Promise<Buffer>[] = []
            for(const assetName of teamIconAssetName){
                ImageListPromise.push(downloadFileCache(`${Bestdoriurl}/assets/jp/event/${this.assetBundleName}/images_rip/${assetName}.png`,false).catch(() => undefined))
            }
            const ImageBufferList = await Promise.all(ImageListPromise)
            let ImageList:Image[] = []
            for(const ImageBuffer of ImageBufferList){
                if(ImageBuffer) ImageList.push(await loadImage(ImageBuffer))
            }
            if (ImageList.length == 0) return undefined
            return ImageList
        }
        catch{
            return undefined
        }
    }
}
//按时间范围获取符合条件的活动
export function getEventListByTimeRange(rangeStart?: number, rangeEnd?: number, displayedServerList: Server[] = globalDefaultServer) {
    const eventIdList: Array<number> = Object.keys(mainAPI['events']).map(Number);
    const tempEventList: Array<Event> = [];

    if (rangeStart == null && rangeEnd == null) {
        return tempEventList;
    }

    const eventCache = new Map<number, Event>();
    const presentEventByServer = new Map<Server, Event | null>();
    for (let i = 0; i < displayedServerList.length; i++) {
        const server = displayedServerList[i];
        if (!presentEventByServer.has(server)) {
            presentEventByServer.set(server, getPresentEvent(server));
        }
    }

    for (let i = 0; i < eventIdList.length; i++) {
        const eventId = eventIdList[i];
        let tempEvent = eventCache.get(eventId);
        if (!tempEvent) {
            tempEvent = new Event(eventId);
            eventCache.set(eventId, tempEvent);
        }

        for (let j = 0; j < displayedServerList.length; j++) {
            const server = displayedServerList[j];
            const timeWindow = getEventTimeWindowByServer(tempEvent, server, presentEventByServer.get(server) ?? null);

            if (!timeWindow) continue;

            const { startAt, endAt } = timeWindow;

            // 仅保留与目标时间范围有交集的活动
            if ((rangeEnd == null || startAt < rangeEnd) && (rangeStart == null || endAt > rangeStart)) {
                tempEventList.push(tempEvent);
                break;
            }
        }
    }
    return tempEventList;
}

function getEventTimeWindowByServer(event: Event, server: Server, presentEvent: Event | null): { startAt: number, endAt: number } | null {
    const startAt = event.startAt[server];
    const endAt = event.endAt[server];
    if (startAt != null && endAt != null) {
        return { startAt, endAt };
    }

    // 仅对国服未来活动使用预测时间窗口
    if (server != Server.cn || !presentEvent || event.eventId <= presentEvent.eventId) {
        return null;
    }

    const jpStartAt = event.startAt[Server.jp];
    const jpEndAt = event.endAt[Server.jp];
    if (jpStartAt == null || jpEndAt == null || jpEndAt <= jpStartAt) {
        return null;
    }

    const forecastStartAt = GetProbablyTimeDifference(event.eventId, presentEvent);
    if (!Number.isFinite(forecastStartAt)) {
        return null;
    }

    return {
        startAt: forecastStartAt,
        endAt: forecastStartAt + (jpEndAt - jpStartAt),
    };
}
//获取当前进行中的活动,如果期间没有活动，则返回上一个刚结束的活动
export function getPresentEvent(server: Server, time?: number) {
    //if (server == Server.cn) return new Event(301)
    if (!time) {
        time = Date.now()
    }
    var eventList: Array<number> = []
    var eventListMain = mainAPI['events']
    for (var key in eventListMain) {
        var event = new Event(parseInt(key))
        //如果在活动进行时
        if (event.startAt[server] != null && event.endAt[server] != null) {
            if (event.startAt[server] - 1000 * 60 * 60 * 24 <= time && event.endAt[server] >= time) {
                //提前一天
                eventList.push(parseInt(key))
            }
        }
    }
    let eventEndAtFlags:number = 0
    //如果没有活动进行中，则返回上一个刚结束的活动
    if (eventList.length == 0) {
        for (var key in eventListMain) {
            var event = new Event(parseInt(key))
            //如果在活动进行时
            if (event.startAt[server] != null && event.endAt[server] != null) {
                if (event.endAt[server] <= time) {
                    if(event.endAt[server] > eventEndAtFlags){
                        eventList.push(parseInt(key))
                        eventEndAtFlags = event.endAt[server]
                    }
                }
            }
        }
    }

    //如果没有活动，则返回null
    if (eventList.length == 0) {
        return null
    }

    //如果有多个活动，则返回最后一个
    return new Event(eventList[eventList.length - 1])
}
function getLastestEventId(server: Server){
    var eventListMain = mainAPI['events']
    let startAt:number = 0
    let eventId:number

    for (var key in eventListMain) {
        var r = new Event(parseInt(key))
        if(r.startAt[server] > startAt){
            startAt = r.startAt[server]
            eventId = r.eventId
        } 
    }
    return eventId
}
//根据服务器，将活动列表排序
export function sortEventList(tempEventList: Event[], displayedServerList: Server[] = globalDefaultServer) {
    let presentEventCN = getPresentEvent(Server.cn)
    tempEventList.sort((a, b) => {
        for (var i = 0; i < displayedServerList.length; i++) {
            var server = displayedServerList[i]
            if (a.startAt[server] == null || b.startAt[server] == null) {
                if (displayedServerList[0] == Server.cn){
                    // 再尝试通过预估时间排序
                    let prvEvent = null
                    let nxtEvent = null
                    if (a.startAt[server] == null){
                        prvEvent = GetProbablyTimeDifference(a.eventId,presentEventCN)
                    }else{
                        prvEvent = a.startAt[server]
                    }
                    if (b.startAt[server] == null){
                        nxtEvent = GetProbablyTimeDifference(b.eventId,presentEventCN)
                    }else{
                        nxtEvent = b.startAt[server]
                    }
                    if (prvEvent != null || nxtEvent != null){
                        return prvEvent - nxtEvent
                    }
                }
                continue
            }
            if (a.startAt[server] != b.startAt[server]) {
                return a.startAt[server] - b.startAt[server]
            }
        }
    })
}

//通过活动与服务器，获得活动类型相同的 前5期活动
export function getRecentEventListByEventAndServer(event: Event, server: Server, count: number, sameType: boolean = false) {
    const eventIdList: Array<number> = Object.keys(mainAPI['events']).map(Number)
    //对活动列表进行排序,从新到旧
    eventIdList.sort((a, b) => {
        const eventA = new Event(a)
        const eventB = new Event(b)
        if (eventA.startAt[server] == null || eventB.startAt[server] == null) {
            return 0
        }
        return eventB.startAt[server] - eventA.startAt[server]
    })
    var tempEventList: Array<Event> = []
    for (var i = 0; i < eventIdList.length; i++) {
        var tempEvent = new Event(eventIdList[i])
        if (tempEvent.startAt[server] != null) {
            if (sameType && tempEvent.eventType != event.eventType) {
                continue
            }
            if (tempEvent.startAt[server] > event.startAt[server]) {
                continue
            }
            tempEventList.push(tempEvent)
        }
    }
    sortEventList(tempEventList, [server])
    return tempEventList.slice(tempEventList.length - count, tempEventList.length)
}

class Frame {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    borderLeft: number;
    borderRight: number;
    borderTop: number;
    borderBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
}

export async function getAnimatedStamp(baseImageName: string, server: Server, frame?: number): Promise<Canvas> {

    // script
    // example hhttps://bestdori.com/assets/cn/animestamp_bilibili112_rip/assets-star-forassetbundle-startapp-stampanime-animestamp_bilibili112-animestamp_bilibili112.asset
    const scriptUrl = `${Bestdoriurl}/assets/${Server[server]}/${baseImageName}_rip/assets-star-forassetbundle-startapp-thumbnail-animedegree-${baseImageName}-${baseImageName}.asset`
    const srciptBuffer = await downloadFileCache(scriptUrl)
    const script = await readJSONFromBuffer(srciptBuffer)
    const frames: Array<Frame> = script['Base']['mSprites'] as Array<Frame>
    const framecount = frames.length
    if (!frame) {
        //random frame
        frame = Math.floor(Math.random() * framecount)
    }

    // texture
    // example https://bestdori.com/assets/cn/ani_degree_bilibili_day1_rip/ani_degree_bilibili_day1.png
    // example https://bestdori.com/assets/cn/animestamp_bilibili112_rip/assets-star-forassetbundle-startapp-stampanime-animestamp_bilibili112-animestamp_bilibili112.png
    const textureUrlOld = `${Bestdoriurl}/assets/${Server[server]}/${baseImageName}_rip/${baseImageName}.png`
    const textureUrlNew = `${Bestdoriurl}/assets/${Server[server]}/${baseImageName}_rip/assets-star-forassetbundle-startapp-thumbnail-animedegree-${baseImageName}-${baseImageName}.png`
    // 后期使用了统一的资源路径
    const useTextureUrlOldAssetWhitelist = ['ani_degree_bilibili_day1','ani_degree_bilibili_092701','ani_degree_bilibili_collabo','ani_degree_bilibili_6years']
    var useTextureUrlOld = false
    for(var l of useTextureUrlOldAssetWhitelist){
        if (baseImageName == l){
            useTextureUrlOld = true
            break
        }
    }
    const textureBuffer = await downloadFileCache(useTextureUrlOld?textureUrlOld:textureUrlNew)
    const texture = await loadImage(textureBuffer)

    //get frame data
    const frameData = frames[frame]
    const canvas = new Canvas(frameData.width, frameData.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(texture, frameData.x, frameData.y, frameData.width, frameData.height, 0, 0, frameData.width, frameData.height)
    //return frame image
    return canvas
}
