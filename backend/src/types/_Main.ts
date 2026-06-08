import { BestdoriapiPath, Bestdoriurl, configPath } from '@/config'
import { callAPIAndCacheResponse } from '@/api/getApi'
import { readExcelFileForOther, readJSON } from '@/types/utils'
import { readExcelFile } from '@/types/utils'
import { logger } from '@/logger'
import * as path from 'path'
import { getBandIcon } from './Band'
import { Server, getIcon, getServerByServerId } from './Server'
import { Attribute, attributeIconCache } from './Attribute'
import { parentPort, threadId,isMainThread  } from'worker_threads';
import { piscina } from '@/WorkerPool';
import { genMetaRankCache } from '@/view/songMetaList'
import { manualLoadFuzzyConfig } from '@/fuzzySearch'
import { clearMeasureCache } from '@/image/text'
import { getPD_Size } from '@/api/downloader'
import { CreateBGPure } from '@/image/BG'
import { genEasyBGCache } from '@/image/output'
if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }
let mainAPI: object = {}//main对象,用于存放所有api数据,数据来源于Bestdori网站
const fuzzySearchDebug = false
export let TopRateSpeed = null
 let TopRateSpeedCacheTime
export let cardsCNfix, skillCNfix, areaItemFix, eventCharacterParameterBonusFix = {}, songNickname,eventNickname,playerNumber
export function setMainAPI(data) {
    if (data == null){
        logger('setMainAPI','setMainAPI try to set an null value,abort.')
        return
    } 
    for (const key in data) {
        mainAPI[key] = data[key];
    }
    manualLoadFuzzyConfig()
    logger('setMainAPI','Set apiData to Worker Successfully.')
    clearMeasureCache()
    logger('getPD_Size',getPD_Size())
}
export function setOtherFix(data) {
    //console.log(data)
    if (data == null){
        logger('setOtherFix','setOtherFix try to set an null value,abort.')
        return
    } 
    areaItemFix = data.areaItemFix
    skillCNfix = data.skillCNfix
    eventCharacterParameterBonusFix = data.eventCharacterParameterBonusFix
    songNickname = data.songNickname
    eventNickname = data.eventNickname
    logger('setOtherFix','Set setOtherFix to Worker Successfully.')
}
var preCacheIconFlags = false
//加载mainAPI
export async function preCacheIcon() {
    if(!preCacheIconFlags){
        logger('mainAPI', 'PreCache Icon...');
        for(let i = 1;i<6;i++){
           getBandIcon(i)  // 用于缓存
        }
        getBandIcon(18)  // 用于缓存RAS
        getBandIcon(21)  // 用于缓存Morfonica
        getBandIcon(45)  // 用于缓存MyGO
    
        for (const key in Server) {
            const value = Number(key)
            if (!isNaN(value)) {
                getIcon(value as Server)
            }
        }
        let attributeList = ["cool", "happy", "pure", "powerful"];
        for(var attributeName of attributeList){
            if(attributeIconCache[attributeName] == undefined){
                new Attribute(attributeName).getIcon()
            }
        }
    }
    preCacheIconFlags = true
}
export async function loadMainAPINow(){
    try{
        await loadMainAPI()
        return "Local cache is up-to-date with upstream."
    }
    catch(e){
        return e
    }
    
}
async function loadMainAPI(useCache: boolean = false) {
    if (!isMainThread){
        if(eventCharacterParameterBonusFix) eventCharacterParameterBonusFix = await readJSON(path.join(configPath, 'eventCharacterParameterBonusFix.json'))
        
        return
    } 
    logger('mainAPI', 'loading mainAPI...')
    const promiseAll = Object.keys(BestdoriapiPath).map(async (key) => {
        const maxRetry = 3
        if (useCache) {
            return mainAPI[key] = await callAPIAndCacheResponse(Bestdoriurl + BestdoriapiPath[key], 1 / 0,3,false);
        } else {
            try {
                return mainAPI[key] = await callAPIAndCacheResponse(Bestdoriurl + BestdoriapiPath[key],0,3,false);
            } catch (e) {
                logger('mainAPI', `load ${key} failed`)
            }
        }
    });
    await Promise.all(promiseAll);


    
    try { //能够实时更新而不重启清空缓存
        let songNicknameData = await readExcelFile(path.join(configPath, fuzzySearchDebug?'nickname_song_test.xlsx':'nickname_song.xlsx'))
        if(songNicknameData!=null) songNickname = songNicknameData  // 尽量避免定时更新api的时候无法查询到任何歌曲，
    }
    catch (e) {
        logger('mainAPI', '读取nickname_song.xlsx失败')
    }
    try { //能够实时更新而不重启清空缓存    EventNickname Fix
        let eventNicknameData = await readExcelFileForOther(path.join(configPath, 'nickname_event.xlsx'))
        if(eventNicknameData!=null) eventNickname = eventNicknameData
    }
    catch (e) {
        logger('mainAPI', '读取nickname_event.xlsx失败')
    }
    try { //能够实时更新而不重启清空缓存    EventNickname Fix
        let playerNumberData = await readExcelFileForOther(path.join(configPath, 'playernumber.xlsx'))
        if(playerNumberData!=null) playerNumber = playerNumberData
    }
    catch (e) {
        logger('mainAPI', '读取playernumber.xlsx失败')
    }
    if (useCache) {
        cardsCNfix = await readJSON(path.join(configPath, 'cardsCNfix.json'))
        skillCNfix = await readJSON(path.join(configPath, 'skillsCNfix.json'))
        areaItemFix = await readJSON(path.join(configPath, 'areaItemFix.json'))
        eventCharacterParameterBonusFix = await readJSON(path.join(configPath, 'eventCharacterParameterBonusFix.json'))
    }
    for (var key in cardsCNfix) {
        mainAPI['cards'][key] = cardsCNfix[key]
    }
    for (var key in skillCNfix) {
        mainAPI['skills'][key] = skillCNfix[key]
    }
    for (var key in areaItemFix) {
        if (mainAPI['areaItems'][key] == undefined) {
            mainAPI['areaItems'][key] = areaItemFix[key]
        }
    }
    for (let i = 0; i < songNickname.length; i++) {
        const element = songNickname[i];
        if (mainAPI['songs'][element['Id'].toString()]) {
            mainAPI['songs'][element['Id'].toString()]['nickname'] = element['Nickname']
        }
    }
    //console.log(songNickname)
    for (let i = 0; i < eventNickname.length; i++) {
        const element = eventNickname[i];
        if (mainAPI['events'][element['Id'].toString()]) {
            mainAPI['events'][element['Id'].toString()]['nickname'] = element['Nickname']
        }
    }
    for (let i = 0; i < playerNumber.length; i++) {
        const element = playerNumber[i];
        if (mainAPI['events'][element['活动编号'].toString()]) {
            //console.log(`当期活动编号：${element['活动编号'].toString()}  当期人数：${element['当期人数']}   封挂人数：${element['封挂数']}`)
            mainAPI['events'][element['活动编号'].toString()]['totalPlayerDataCN'] = element['当期人数']
            mainAPI['events'][element['活动编号'].toString()]['bannedPlayerDataCN'] = element['封挂数']
        }
    }
    // 初始化metaCache
    mainAPI['metaCache'] = {}
    mainAPI['metaCache'][true] ??= {}
    mainAPI['metaCache'][true][Server.cn] ??= {}
    mainAPI['metaCache'][true][Server.jp]??= {}
    mainAPI['metaCache'][true][Server.tw]??= {}
    mainAPI['metaCache'][true][Server.en]??= {}
    mainAPI['metaCache'][true][Server.kr]??= {}
    mainAPI['metaCache'][false] ??= {}
    mainAPI['metaCache'][false][Server.cn] ??= {}
    mainAPI['metaCache'][false][Server.jp] ??= {}
    mainAPI['metaCache'][false][Server.tw] ??= {}
    mainAPI['metaCache'][false][Server.en]??= {}
    mainAPI['metaCache'][false][Server.kr]??= {}
    genMetaRankCache(true,Server.cn)
    genMetaRankCache(false,Server.cn)
    genMetaRankCache(true,Server.jp)
    genMetaRankCache(false,Server.jp)
    genMetaRankCache(true,Server.tw)
    genMetaRankCache(false,Server.tw)
    genMetaRankCache(true,Server.en)
    genMetaRankCache(false,Server.en)
    genMetaRankCache(true,Server.kr)
    genMetaRankCache(false,Server.kr)
    //console.log(mainAPI['metaCache'][true][Server.cn])
    //await preCacheIcon()
    manualLoadFuzzyConfig()
    clearMeasureCache()
   // genEasyBGCache()
    logger('getPD_Size',getPD_Size())
    if(isMainThread){
            await piscina.drawList.run({
            data: mainAPI,
        },{name:'setMainApiToWorker'})
        await piscina.drawList.run({
            data: {cardsCNfix, skillCNfix, areaItemFix, eventCharacterParameterBonusFix, songNickname,eventNickname},
        },{name:'setOtherFixToWorker'})
    }  
    

    logger('mainAPI', 'mainAPI loaded')

}
//TopRateSpeedCacheTime = new Date().getTime()
logger('mainAPI', "initializing...")
loadMainAPI(true).then(() => {
    preCacheIcon()
    logger('mainAPI', "initializing done")
    loadMainAPI()
})



if (isMainThread) setInterval(loadMainAPI, 1000 * 60 * 5)//5分钟更新一次

export default mainAPI