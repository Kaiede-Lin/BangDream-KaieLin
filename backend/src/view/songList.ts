import { Song } from "@/types/Song";
import mainAPI, { preCacheIcon, setMainAPI } from "@/types/_Main"
import { match, checkRelationList, FuzzySearchResult } from "@/fuzzySearch"
import { Canvas } from 'skia-canvas'
import { drawTitle } from '@/components/title';
import { outputFinalBuffer } from '@/image/output'
import { drawDatablockHorizontal } from "@/components/dataBlock";
import { drawSongInList, drawSongInListForQuerySong } from '@/components/list/song';
import { drawDottedLine } from '@/image/dottedLine';
import { getOptDrawCount, getOptHeight, stackImage } from '@/components/utils';
import { Server } from '@/types/Server';
import { globalDefaultServer } from '@/config';
import { drawSongDetail } from "./songDetail";
import pLimit from 'p-limit'
import { logger } from "@/logger";
import { drawTips } from "@/components/tips";
import { parentPort, threadId,isMainThread  } from'worker_threads';
import { loadImageOnce } from "@/components/card";
const limit = pLimit(15);
if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }


// 紧凑化虚线分割
const line = drawDottedLine({
    width: 800,
    height: 10,
    startX: 5,
    startY: 5,
    endX: 795,
    endY: 5,
    radius: 2,
    gap: 10,
    color: "#a8a8a8"
})



export async function initForWorker() {
    await loadImageOnce()
    await preCacheIcon()
}
export async function drawSongList(matches: FuzzySearchResult, displayedServerList: Server[] = globalDefaultServer, compress: boolean,message?:string): Promise<Array<Buffer | string>> {
   // const limit = pLimit(10000);    // 限制3首歌同时绘制 // 进worker了，不关主线程事了，随便造了
    
    var heavyLoad = false
    // 计算歌曲模糊搜索结果
    //console.log(matches)
    const tempSongList = matchSongList(matches, displayedServerList)

    if (tempSongList.length == 0) {
        return [`没有搜索到符合条件的歌曲\nKeywords: ${matches._all}`]
    }
    if (tempSongList.length == 1) {
        return await drawSongDetail(tempSongList[0], displayedServerList, compress)
    }

    var tempSongImageList: Canvas[] = [];
    var songImageListHorizontal: Canvas[] = [];
    var tempH = 0;
    var songPromises: Promise<Canvas>[] = [];
    //var t1 = Date.now()
    if (tempSongList.length <50){
        
       for (let i = 0; i < tempSongList.length; i++) {
            songPromises.push(
                limit(async () => (await drawSongInListForQuerySong(tempSongList[i], undefined, undefined, displayedServerList)))
            )
            //songPromises.push();
        }
    } else{   // 大于15首，并发降级，不允许全部并发
        if(isMainThread) return null
        heavyLoad = true
        logger('drawSongList','Task Priority Level DOWN,Concurrent Level DOWN to sync draw! Reason: tempSongImageList is too large,size is ' + tempSongList.length);
        for (let i = 0; i < tempSongList.length; i++) {
            songPromises.push(
                limit(async () => (await drawSongInListForQuerySong(tempSongList[i], undefined, undefined, displayedServerList)))
            )
            //songPromises.push(drawSongInListForQuerySong(tempSongList[i], undefined, undefined, displayedServerList));
        }
    }
    var songImages = await Promise.all(songPromises);
    songPromises.length = 0 // clear memory
    //var t2 = Date.now()
    //console.log(t2-t1)
    let maxCount = getOptDrawCount(tempSongList.length,1000,85,10,30)  // 1000为一首歌长度，85为高度
    //const maxHeight = getOptHeight(tempSongList.length,1000,100,10,30)
    //表格用默认竖向虚线
    const line2: Canvas = drawDottedLine({
        width: 30,
        height: ((maxCount-0.2) * 85) ,
        startX: 10,
        startY: 0,
        endX: 15,
        endY: 5990,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    for (let i = 0; i < songImages.length; i++) {
        var tempImage = songImages[i];
        tempH += tempImage.height
        if (i % maxCount == 0 && i!=0) {
            tempSongImageList.pop()
            songImageListHorizontal.push(stackImage(tempSongImageList,true))
            songImageListHorizontal.push(line2)
            tempSongImageList = []
            tempH = tempImage.height
        }
        tempSongImageList.push(tempImage)
        tempSongImageList.push(line)
        if (i == tempSongList.length - 1) {
            tempSongImageList.pop()
            songImageListHorizontal.push(stackImage(tempSongImageList,true))
            songImageListHorizontal.push(line2)
        }
    }

    songImageListHorizontal.pop();
    songImages.length = 0
    tempSongImageList.length = 0    // clear memory

    var songListImage = await drawDatablockHorizontal({
        list: songImageListHorizontal
    })
    songImageListHorizontal.length = 0 // 同上
    var all = []
    all.push(await drawTitle(`查询  共${tempSongList.length}条结果`, `歌曲列表`))
    
    all.push(songListImage)
    all.push(await drawTips({text:'出分排名的Fever顺序为 有Fever / 无Fever'}))
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress
    })
    //return {{buffer},transferList: [buffer.buffer]}
    //console.log(Date.now())
    if(message) return [message,buffer]
    return [buffer] // 目前暂时没法0拷贝，还在想办法ing
}


const disableBandCharaIdLimit = true
// 计算歌曲模糊搜索结果
export function matchSongList(matches: FuzzySearchResult, displayedServerList: Server[]) {
    var tempSongList: Array<Song> = [];
    var songIdList: Array<number> = Object.keys(mainAPI['songs']).map(Number)

    //console.log(songIdList.length);
     //new Error(songIdList)
    for (let i = 0; i < songIdList.length; i++) {
        
        const tempSong = new Song(songIdList[i]);
        //console.log(tempSong)
        if (isEmptyObject(matches)){
            tempSongList.push(tempSong)
            continue
        }
        for (let s of tempSong.musicTitle) {
            if (s && (s.toLowerCase().replace(/[!?]/g, '') == (matches['_all'][0] as string) || s.toLowerCase() == (matches['_all'][0] as string))) {
                tempSongList.push(tempSong)
                break
            }
        }
    }
    if (tempSongList.length > 0)
        return tempSongList

    for (let i = 0; i < songIdList.length; i++) {
        const tempSong = new Song(songIdList[i]);
        var isMatch = match(matches, tempSong, ['songId'],disableBandCharaIdLimit);
        /*
        //如果在所有所选服务器列表中都不存在，则不输出
        var numberOfNotReleasedServer = 0;
        for (var j = 0; j < displayedServerList.length; j++) {
            var server = displayedServerList[j];
            if (tempSong.publishedAt[server] == null) {
                numberOfNotReleasedServer++;
            }
        }
        if (numberOfNotReleasedServer == displayedServerList.length  {
            isMatch = false;
        }
        */  // 全服务器输出

        //如果有数字关系词，则判断关系词
        if (matches._relationStr != undefined) {
            //如果之后范围的话则直接判断
            if (isMatch || Object.keys(matches).length == 1) {
                isMatch = checkRelationList(tempSong.songId, matches._relationStr as string[])
            }
        }

        if (isMatch) {
            tempSongList.push(tempSong);
        }
    }
    return tempSongList
}
function isEmptyObject(obj) {
    return (true && Object.keys(obj).length === 0);
  }