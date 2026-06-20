import { Song, difficultyName } from '@/types/Song'
import { Band } from '@/types/Band'
import * as BestdoriPreview from '@/components/BestdoriPreview.cjs'
import { getServerByPriority } from '@/types/Server'
import { Server } from '@/types/Server'
import { Bestdoriurl, assetsRootPath, globalDefaultServer, serverNameFullList } from '@/config';
import * as path from 'path';
import Piscina from 'piscina'
import { callAPIAndCacheResponse } from '@/api/getApi'
const workerPath = path.resolve(__dirname, "../components/BestdoriPreview.cjs");
const BestdoriPreviewPool = new Piscina({ filename: workerPath,minThreads:1,maxThreads:1,execArgv:[],env:{PROJECT_ROOT: __dirname,ASROOT:assetsRootPath} });

export async function drawSongChart(songId: number, difficultyId: number, displayedServerList: Server[] = globalDefaultServer, compress: boolean): Promise<Array<Buffer | string>> {
    const song = new Song(songId)
    if (!song.isExist) {
        return ['没找到这首歌']
    }
    const songChartDownload = song.getSongChart(difficultyId)   //  Preload Charts.
    await song.initFull()
    if (!song.difficulty[difficultyId]) {
        return ['没找到这难度']
    }

    const server = getServerByPriority(song.publishedAt, displayedServerList)
    const band = new Band(song.bandId)
    const bandName = band.bandName[server]
    var songChart = await songChartDownload
    if (songChart == null){
        return ['谱面数据没法下载，再试一次看看']
    }
    // 没有并行的可能。
    /*
    const tempcanv = await BestdoriPreview.DrawPreview({
        id: song.songId,
        title: song.musicTitle[server],
        artist: bandName,
        author: song.detail.lyricist[server],
        level: song.difficulty[difficultyId].playLevel,
        diff: difficultyName[difficultyId],
        cover: song.getSongJacketImageURL(displayedServerList)
    }, songChart as any)
    */
   var chartData = songChart as any;
   const {buffer } = await BestdoriPreviewPool.run({
    meta:{id: song.songId,
    title: song.musicTitle[server],
    artist: bandName,
    author: song.detail.lyricist[server],
    level: song.difficulty[difficultyId].playLevel,
    diff: difficultyName[difficultyId],
    cover: song.getSongJacketImageURL(displayedServerList)
    },chartData},{name:'DrawPreview'})
    //console.log(buffer.buffer, buffer.byteOffset, buffer.length)
    return [Buffer.from(buffer.buffer)]
/*
    let buffer:Buffer
    if( compress!=undefined && compress){
        buffer = await tempcanv.toBuffer('jpeg',{quality:0.5})
    }
    else{
        buffer = await tempcanv.toBuffer('png')
    }
*/
    //return [buffer]
}
