import { Canvas } from 'skia-canvas'
import { Band } from "@/types/Band"
import { Server, getServerByPriority } from "@/types/Server"
import { Song } from "@/types/Song"
import { drawText, releaseCanvas, setFontStyle } from "@/image/text"
import { resizeImage } from "@/components/utils"
import { drawDifficulityList, drawDifficulity, drawDifficulityListInListWithNotes, drawDifficulityListWithDiff, drawDifficulityWithNotes } from "@/components/list/difficulty"
import { globalDefaultServer, serverNameFullList } from "@/config"
import { drawList } from '../list'
import { drawDottedLine } from '@/image/dottedLine'
import { formatSeconds } from './time'
import mainAPI from '@/types/_Main'

export async function drawSongInListForQuerySong(song: Song, difficulty?: number, text?: string, displayedServerList: Server[] = globalDefaultServer,useFever?:boolean): Promise<Canvas> {
    
    var server = getServerByPriority(song.publishedAt, displayedServerList)
    var songImage = resizeImage({
        image: await song.getSongJacketImage(),
        widthMax: 80,
        heightMax: 80
    })

    var canvas = new Canvas(800, 75)
    var ctx = canvas.getContext("2d")
    ctx.drawImage(songImage, 50, 5, 65, 65)
    //id
    var IDImage = await drawText({
        text: song.songId.toString(),
        textSize: 23,
        lineHeight: 37.5,
        maxWidth: 800
    })
    ctx.drawImage(IDImage, 0, 0)

    //曲名与乐队名
    var fullText = `${song.musicTitle[server]}\n`

    var serverMeta = displayedServerList[0]
    // 展示Meta
    if (mainAPI['metaCache'][true][serverMeta][`${song.songId}`]){
        let HDRankT=mainAPI['metaCache'][true][serverMeta][`${song.songId}`]['2']
        let EXRankT=mainAPI['metaCache'][true][serverMeta][`${song.songId}`]['3']
        let SPRankT=mainAPI['metaCache'][true][serverMeta][`${song.songId}`]['4']?mainAPI['metaCache'][true][serverMeta][`${song.songId}`]['4']:''
        let HDRankF=mainAPI['metaCache'][false][serverMeta][`${song.songId}`]['2']
        let EXRankF=mainAPI['metaCache'][false][serverMeta][`${song.songId}`]['3']
        let SPRankF=mainAPI['metaCache'][false][serverMeta][`${song.songId}`]['4']?mainAPI['metaCache'][false][serverMeta][`${song.songId}`]['4']:''
        if (useFever!=null && useFever == true){
            if(SPRankT == '') fullText += `有Fever HD: #${HDRankT} EX: #${EXRankT} `
            if(SPRankT != '') fullText += `有Fever EX: #${EXRankT} SP: #${SPRankT} `
        }
        if(useFever!=null && useFever == false){
            if(SPRankT == '') fullText += `无Fever HD: #${HDRankF} EX: #${EXRankF} `
            if(SPRankT != '') fullText += `无Fever EX: #${EXRankF} SP: #${SPRankF} `
        }
        else{
            if(SPRankT == '') fullText += `HD: #${HDRankT}/#${HDRankF} EX: #${EXRankT}/#${EXRankF} `
            if(SPRankT != '') fullText += `EX: #${EXRankT}/#${EXRankF} SP: #${SPRankT}/#${SPRankF} `
        }

    }else fullText += `该歌曲在${serverNameFullList[serverMeta]}尚未实装`
    if (!text) {
        //如果没有传入text参数，使用乐队名
        fullText += `\n${new Band(song.bandId).bandName[server]}`
    }
    else {
        //如果传入了text参数，使用text参数代替乐队名
        fullText += `\n${text}`
    }
    fullText += ` ${formatSeconds(song.length)} \n`
    var textImage = await drawText({
        text: fullText,
        textSize: 18,
        lineHeight: 25, //37.5
        maxWidth: 800
    })
    ctx.drawImage(textImage, 120, 0)


    //难度
    if (!difficulty) {
        var difficultyImage = await drawDifficulityListInListWithNotes(song, 50, 10)
    }
    else {
        var difficultyImage = await drawDifficulity(difficulty, song.difficulty[difficulty].playLevel, 45, true,song.notes[difficulty])
        //var difficultyImage = await drawDifficulityWithNotes(difficulty, song.difficulty[difficulty].playLevel, 45,true,song.notes[difficulty])
    }
    ctx.drawImage(difficultyImage, 800 - difficultyImage.width, 75 / 2 - difficultyImage.height / 2)
    return canvas
}

export async function drawSongInList(song: Song, difficulty?: number, text?: string, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    var server = getServerByPriority(song.publishedAt, displayedServerList)
    var songImage = resizeImage({
        image: await song.getSongJacketImage(),
        widthMax: 80,
        heightMax: 80
    })

    var canvas = new Canvas(800, 75)
    var ctx = canvas.getContext("2d")
    ctx.drawImage(songImage, 50, 5, 65, 65)
    //id
    var IDImage = await drawText({
        text: song.songId.toString(),
        textSize: 23,
        lineHeight: 37.5,
        maxWidth: 800
    })
    ctx.drawImage(IDImage, 0, 0)

    //曲名与乐队名
    var fullText = `${song.musicTitle[server]}`
    if (!text) {
        //如果没有传入text参数，使用乐队名
        fullText += `\n${new Band(song.bandId).bandName[server]}`
    }
    else {
        //如果传入了text参数，使用text参数代替乐队名
        fullText += `\n${text}`
    }
    var textImage = await drawText({
        text: fullText,
        textSize: 23,
        lineHeight: 37.5,
        maxWidth: 800
    })
    ctx.drawImage(textImage, 120, 0)


    //难度
    if (difficulty == undefined) {
        var difficultyImage = await drawDifficulityListInListWithNotes(song, 50, 10)
    }
    else {
        var difficultyImage = await drawDifficulity(difficulty, song.difficulty[difficulty].playLevel, 45, true,song.notes[difficulty])
        //var difficultyImage = await drawDifficulityWithNotes(difficulty, song.difficulty[difficulty].playLevel, 45,true,song.notes[difficulty])
    }
    ctx.drawImage(difficultyImage, 800 - difficultyImage.width, 75 / 2 - difficultyImage.height / 2)
    return canvas
}

export async function drawSongListInList(songs: Song[], difficulty?: number, text?: string, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    let height: number = 75 * songs.length + 10 * (songs.length - 1)
    let canvas = new Canvas(760, height)
    let ctx = canvas.getContext("2d")
    let x = 0
    let y = 0
    let views: Canvas[] = []
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
    for (let i = 0; i < songs.length; i++) {
        views.push(resizeImage({ image: await drawSongInList(songs[i], difficulty, text, displayedServerList), widthMax: 760 }))
        views.push(line)
    }
    views.pop()
    for (let i = 0; i < views.length; i++) {
        ctx.drawImage(views[i], x, y)
        y += views[i].height
    }
    return await drawList({
        key: '歌榜歌曲',
        content: [canvas],
        textSize: canvas.height,
        lineHeight: canvas.height + 20,
        spacing: 0
    })
}
export async function drawSongListInListWithMoreDetail(songs: Song[], difficulty?: number, text?: string, displayedServerList: Server[] = globalDefaultServer,useFever?:boolean): Promise<Canvas> {
    let height: number = 75 * songs.length + 10 * (songs.length - 1)
    let canvas = new Canvas(760, height)
    let ctx = canvas.getContext("2d")
    let x = 0
    let y = 0
    let views: Canvas[] = []
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
    for (let i = 0; i < songs.length; i++) {
        views.push(resizeImage({ image: await drawSongInListForQuerySong(songs[i], difficulty, text, displayedServerList,useFever), widthMax: 760 }))
        views.push(line)
    }
    views.pop()
    for (let i = 0; i < views.length; i++) {
        ctx.drawImage(views[i], x, y)
        y += views[i].height
    }
    return await drawList({
        key: '歌榜歌曲',
        content: [canvas],
        textSize: canvas.height,
        lineHeight: canvas.height + 20,
        spacing: 0
    })
}
export async function drawSongListInListWithMoreDetailKey(songs: Song[], difficulty?: number, text?: string, displayedServerList: Server[] = globalDefaultServer,useFever?:boolean): Promise<Canvas> {
    let height: number = 75 * songs.length + 10 * (songs.length - 1)
    let canvas = new Canvas(760, height)
    let ctx = canvas.getContext("2d")
    let x = 0
    let y = 0
    let views: Canvas[] = []
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
    for (let i = 0; i < songs.length; i++) {
        views.push(resizeImage({ image: await drawSongInListForQuerySong(songs[i], difficulty, undefined, displayedServerList,useFever), widthMax: 760 }))
        views.push(line)
    }
    views.pop()
    for (let i = 0; i < views.length; i++) {
        ctx.drawImage(views[i], x, y)
        y += views[i].height
    }
    return await drawList({
        key: text,
        content: [canvas],
        textSize: canvas.height,
        lineHeight: canvas.height + 20,
        spacing: 0
    })
}
export async function drawSongInListBig(song: Song, difficulty?: number, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    var server = getServerByPriority(song.publishedAt, displayedServerList)
    const width = 400, spacing = 20, jacketSize = 250
    var titleImage = await drawText({
        text: song.musicTitle[server],
        textSize: 40,
        maxWidth: width - 2 * spacing
    })
    var bandImage = await drawText({
        text: new Band(song.bandId).bandName[server],
        textSize: 30,
        maxWidth: width - 2 * spacing
    })
    var topHeight = titleImage.height + bandImage.height
    var canvas = new Canvas(width, jacketSize + 150 + topHeight)
    var ctx = canvas.getContext("2d")
    ctx.drawImage(titleImage, 20, 0)
    ctx.drawImage(bandImage, 20, titleImage.height)
    ctx.drawImage(await song.getSongJacketImage(), (width - jacketSize) / 2, topHeight + spacing, jacketSize, jacketSize)
    var IDImage = await drawText({
        text: 'ID:' + song.songId.toString(),
        textSize: 30,
        lineHeight: 37.5,
        maxWidth: jacketSize,
        color: '#a7a7a7'
    })
    ctx.drawImage(IDImage, (width - jacketSize) / 2, topHeight + spacing + jacketSize)
    var difficultyImage = await drawDifficulityListWithDiff(song, difficulty, 60, 10)
    // if (difficulty == undefined) {
    //     var difficultyImage = drawDifficulityList(song, 60, 10)
    // }
    // else {
    //     var difficultyImage = drawDifficulity(difficulty, song.difficulty[difficulty].playLevel, 45)
    // }
    ctx.drawImage(difficultyImage, (width - difficultyImage.width) / 2, jacketSize + IDImage.height + spacing + spacing + topHeight)
    return canvas
}
export async function drawSongInListMid(song: Song, difficulty?: number, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    var server = getServerByPriority(song.publishedAt, displayedServerList)
    const height = 210, spacing = 10, jacketSize = 180
    var canvas = new Canvas(jacketSize + 150, height)
    var ctx = canvas.getContext("2d")
    ctx.drawImage(await song.getSongJacketImage(), 0, 0, jacketSize, jacketSize)
    var IDImage = await drawText({
        text: 'ID:' + song.songId.toString(),
        textSize: 30,
        lineHeight: 37.5,
        maxWidth: jacketSize,
        color: '#a7a7a7'
    })
    ctx.drawImage(IDImage, 0, jacketSize)
    var difficultyImage = await drawDifficulity(difficulty, song.difficulty[difficulty].playLevel, 60)
    // if (difficulty == undefined) {
    //     var difficultyImage = drawDifficulityList(song, 60, 10)
    // }
    // else {
    //     var difficultyImage = drawDifficulity(difficulty, song.difficulty[difficulty].playLevel, 45)
    // }
    ctx.drawImage(difficultyImage, jacketSize + spacing, (jacketSize - difficultyImage.height) / 2)
    return canvas
}