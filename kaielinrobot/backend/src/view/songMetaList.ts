import { Song, getMetaRanking } from "@/types/Song";
import { Canvas } from 'skia-canvas'
import { drawTitle } from '@/components/title';
import { outputFinalBuffer } from '@/image/output'
import { drawSongInList } from '@/components/list/song';
import { drawDottedLine } from '@/image/dottedLine';
import { stackImageHorizontal } from '@/components/utils';
import { Server } from '@/types/Server';
import { serverNameFullList } from '@/config';
import { drawDatablock } from '@/components/dataBlock'
import { formatSeconds } from "@/components/list/time";
import mainAPI from "@/types/_Main";
import { matchSongList } from "./songList";
import { fuzzySearch, FuzzySearchResult, include } from "@/fuzzySearch";

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
const difficulties = [
    'easy',
    'normal',
    'hard',
    'expert',
    'special'
]

export async function drawSongMetaList(mainServer: Server, compress: boolean,searchCondition?:string): Promise<Array<Buffer | string>> {
    let difficultMask = 0b00000
    searchCondition = (searchCondition) ?searchCondition:''
    searchCondition = searchCondition.toLowerCase()
    let difficultyCondition = searchCondition.split(' ')
    for(const [i,d] of difficultyCondition.entries()){
        let cnDiffDesc =  d.replace('谱','').replace('铺','')
        if(d == 'easy' || d == 'ez' || cnDiffDesc=='蓝'|| cnDiffDesc=='紫'){
            difficultMask |= (1<<0)
            difficultyCondition[i] = ''
        }
        else if(d == 'normal' || d == 'nl' || d == 'nm' || cnDiffDesc=='绿'){
            difficultMask |= (1<<1)
            difficultyCondition[i] = ''
        }
        else if(d == 'hard' || d == 'hd'|| cnDiffDesc=='黄'){
            difficultMask |= (1<<2)
            difficultyCondition[i] = ''
        }
        else if(d == 'expert' || d == 'ex'|| cnDiffDesc=='红'){
            difficultMask |= (1<<3)
            difficultyCondition[i] = ''
        }
        else if(d == 'special' || d == 'sp'|| cnDiffDesc=='粉'){
            difficultMask |= (1<<4)
            difficultyCondition[i] = ''
        }
    }

    searchCondition = difficultyCondition.filter(x=>(x!='')).join(' ')
    console.log(`\'${searchCondition}\'`)
    console.log(difficultMask,[0,1,2,3,4].map(x=>{return (difficultMask & (1 << x))} ))
    let fuzzySearchResult: FuzzySearchResult
    fuzzySearchResult = (searchCondition!='')?fuzzySearch(searchCondition):null
    const feverMode = [true, false]
    const imageList = []
    var drawMetaRankListDatablockPromise = []

    for (let i = 0; i < feverMode.length; i++) {
        const element = feverMode[i];
        drawMetaRankListDatablockPromise.push(drawMetaRankListDatablock(element, mainServer,fuzzySearchResult,difficultMask))
        // imageList.push(await drawMetaRankListDatablock(element, mainServer))
    }
    const drawMetaRankListDatablockResult = await Promise.all(drawMetaRankListDatablockPromise)
    for(var dataRankList of drawMetaRankListDatablockResult){
        imageList.push(dataRankList)
    }


    var all = []
    all.push(await drawTitle('查询', `${serverNameFullList[mainServer]} 分数排行榜`))
    all.push(stackImageHorizontal(imageList))
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress:compress
    })
    return [buffer]
}

async function drawMetaRankListDatablock(Fever: boolean, mainServer: Server,matches:FuzzySearchResult,difficultyMask=0b11111): Promise<Canvas> {
    if (!difficultyMask || difficultyMask == 0b00000)difficultyMask = 0b11111
    
    const tempSongList = matches?matchSongList(matches, [Server.jp]):[]
    let level = (matches && matches['songLevels'])?matches['songLevels']:null
    const metaRanking = getMetaRanking(Fever, mainServer);
    const maxMeta = metaRanking[0].meta
    let list: Array<Canvas> = []
    var drawSongInListPromise = []
    for (let i = 0; i < metaRanking.length; i++) {
        let song = new Song(metaRanking[i].songId)
        let difficultyId = metaRanking[i].difficulty
        if (tempSongList && tempSongList.length!=0){
            for(let ts of tempSongList){
                if (song.songId == ts.songId){
                    if((difficultyMask & (1 << difficultyId)) !== 0){
                        if(!level || level.includes(song.difficulty[difficultyId].playLevel)){
                            let precent = metaRanking[i].meta / maxMeta * 100
                            precent = Math.round(precent * 100) / 100
                            drawSongInListPromise.push(drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1} / 时长：${formatSeconds(song.length)}`))
                        }
                    }
                }
            }
        }else{
            if((difficultyMask == 0b11111) || (difficultyMask & (1 << difficultyId)) !== 0){
                if(!level || level.includes(song.difficulty[difficultyId].playLevel)){
                    let precent = metaRanking[i].meta / maxMeta * 100
                    precent = Math.round(precent * 100) / 100
                    drawSongInListPromise.push(drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1} / 时长：${formatSeconds(song.length)}`))
                }
            }
        }
        if(drawSongInListPromise.length >= 50) break
    }
    for(var resultSong of await Promise.all(drawSongInListPromise)){
        list.push(resultSong)
        list.push(line)
    }

    list.pop()
    const topLeftText = Fever ? '有Fever' : '无Fever'
    return (drawDatablock({ list, topLeftText }))
}

export async function genMetaRankCache(Fever: boolean, mainServer: Server) {
    const metaRanking = getMetaRanking(Fever, mainServer);
    const maxMeta = metaRanking[0].meta
    for (let i = 0; i < metaRanking.length; i++) {
        let difficultyId = metaRanking[i].difficulty
        /*   暂时用不上
        let song = new Song(metaRanking[i].songId)
        let precent = metaRanking[i].meta / maxMeta * 100
        precent = Math.round(precent * 100) / 100
        */
        try{
            mainAPI['metaCache'][Fever][mainServer][`${metaRanking[i].songId}`][difficultyId] = (metaRanking[i].rank + 1)
        }
        catch{
            mainAPI['metaCache'][Fever][mainServer][`${metaRanking[i].songId}`] ??= {}
            mainAPI['metaCache'][Fever][mainServer][`${metaRanking[i].songId}`][difficultyId] = (metaRanking[i].rank + 1)
        }

    }
}
