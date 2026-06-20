import { getPresentEvent } from '@/types/Event';
import { drawList, line, drawListByServerList, drawListMerge,drawListTextWithImages } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { drawTimeInList } from '@/components/list/time';
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { Song } from '@/types/Song'
import { drawSongDataBlock } from '@/components/dataBlock/song';
import { Band } from '@/types/Band';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawSongMetaListDataBlock } from '@/components/dataBlock/songMetaList'
import { globalDefaultServer, serverNameFullList } from '@/config';
import { formatSeconds } from '@/components/list/time'
import { drawDifficulityList } from '@/components/list/difficulty';
import { drawDifficulity,drawDifficulity2,drawDifficulityListWithNotes } from '@/components/list/difficulty';
import { drawText } from '@/image/text';
import mainAPI from '@/types/_Main';

export async function drawSongDetail(song: Song, displayedServerList: Server[] = globalDefaultServer, compress: boolean): Promise<Array<Buffer | string>> {
    if (song.isExist == false) {
        return ['错误: 歌曲不存在']
    }
    var publishedAt = mainAPI['songs'][song.songId.toString()]['publishedAt']
    var drawEventDatablockPromise:Promise<Canvas>[] = []
    
    //相关活动
    var eventIdList = []//防止重复
    for (var i = 0; i < displayedServerList.length; i++) {
        var server = displayedServerList[i]
        if (publishedAt[server] == null) {
            continue
        }
        var event = getPresentEvent(server, publishedAt[server])
        if (event != undefined && eventIdList.indexOf(event.eventId) == -1) {
            eventIdList.push(event.eventId)
            drawEventDatablockPromise.push(drawEventDatablock(event, displayedServerList, `${serverNameFullList[server]}相关活动`))
            // all.push(eventDatablockImage)
        }
    }

    const initData = await Promise.all([
        Promise.all(drawEventDatablockPromise),
        song.initFull(),
        song.getSongJacketImage([Server.jp, Server.cn],true)    // 只缓存图片，到时候就可以直接使用缓存图片了，不用担心因CPU处理速度导致song无数据的问题
    ])
    const drawEventDatablockResult = initData[0]
    
    var list: Array<Image | Canvas> = []
    //标题

    //乐队
    var band = new Band(song.bandId)
    //歌曲tag(类型)
    var typeImage = await drawList({
        key: '类型', text: song.getTagName()
    })
    //歌曲ID
    var IdImage = await drawList({
        key: 'ID', text: song.songId.toString()
    })
    //时长
    var timeLength = await drawList({
        key: '时长',
        text: formatSeconds(song.length)
    })

    //bpm
    var bpmList: number[] = []
    for (let difficulty in song.bpm) {
        for (let bpmId = 0; bpmId < song.bpm[difficulty].length; bpmId++) {
            const element = song.bpm[difficulty][bpmId];
            bpmList.push(element.bpm)
        }
    }
    var bpm = ''
    var bpmMax = Math.max(...bpmList)
    var bpmMin = Math.min(...bpmList)
    if (bpmMax == bpmMin) {
        bpm = bpmMax.toString()
    }
    else {
        bpm = `${bpmMin} ～ ${bpmMax}`
    }
    var bpmData = await drawList({
        key: 'BPM',
        text: bpm
    })

    //歌曲meta数据
    var ferverStatusList = [true, false]

    var drawSongMetaListDataBlockPromise:Promise<Canvas>[] = []
    for (let j = 0; j < ferverStatusList.length; j++) {
        const feverStatus = ferverStatusList[j];
        // var songMetaListDataBlockImage = await drawSongMetaListDataBlock(feverStatus, song, `${feverStatus ? 'Fever' : '无Fever'}`, displayedServerList)
        drawSongMetaListDataBlockPromise.push(drawSongMetaListDataBlock(feverStatus, song, `${feverStatus ? 'Fever' : '无Fever'}`, displayedServerList))
       // all.push(songMetaListDataBlockImage)
    }


    var drawSongDataBlockPromise:Promise<Canvas>[] = []
    //顶部歌曲信息框
    drawSongDataBlockPromise.push(drawSongDataBlock(song))  // 理论不存在IO等待时间问题
    const drawSongMetaListDataBlockL = await Promise.all(drawSongMetaListDataBlockPromise);


    list.push(await drawListByServerList(song.musicTitle, '歌曲名称'))
    list.push(line)
    list.push(await drawListByServerList(band.bandName, '乐队', displayedServerList))
    list.push(line)
    list.push(drawListMerge([typeImage, IdImage]))
    list.push(line)
    list.push(drawListMerge([timeLength, bpmData]))
    list.push(line)

    list.push(drawListTextWithImages({
        key: 'Notes',
        content: [await drawDifficulityListWithNotes(song)],
    }))
    list.push(line)
    //作词
    list.push(await drawListByServerList(song.detail.lyricist, '作词', displayedServerList))
    list.push(line)
    //作曲
    list.push(await drawListByServerList(song.detail.composer, '作曲', displayedServerList))
    list.push(line)
    //编曲
    list.push(await drawListByServerList(song.detail.arranger, '编曲', displayedServerList))
    list.push(line)

    //发布时间
    list.push(await drawTimeInList({
        key: '发布时间',
        content: song.publishedAt
    }, displayedServerList))

    //special难度发布时间
    if (song.difficulty['4']?.publishedAt != undefined) {
        list.push(line)
        list.push(await drawTimeInList({
            key: 'SPECIAL难度发布时间',
            content: song.difficulty['4'].publishedAt
        }, displayedServerList))
    }
    if (song.nickname != null) {
        list.push(line)
        list.push(await drawList({
            key: '模糊搜索关键词',
            text: song.nickname
        }))
    }


    var all = []
    all.push(await drawTitle('查询', '歌曲'))
    all.push(await drawSongDataBlock(song))
    var listImage = await drawDatablock({ list })
    //console.log(listImage)
    all.push(listImage)
    
    //创建最终输出数组
  

    for(var r of drawSongMetaListDataBlockL)
    {
        all.push(r)
    }
    for(var r of drawEventDatablockResult)
    {
        all.push(r)
    }

    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress
    })
    return [buffer]
}

