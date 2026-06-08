import { Canvas } from 'skia-canvas'
import { Song } from "@/types/Song"
import { drawText, releaseCanvas } from "@/image/text"
import { difficultyColorList } from "@/types/Song"

export async function drawDifficulityListInListWithNotes(song: Song, imageHeight: number = 100, spacing: number = 10,dif?:string): Promise<Canvas> {
    var difficultyCount = Object.keys(song.difficulty).length
    var canvas = new Canvas(imageHeight * difficultyCount + (difficultyCount - 1) * spacing, imageHeight + 10)
    var ctx = canvas.getContext("2d")
    for (var d in song.difficulty) {
        const i = parseInt(d);
        const diffCanvas = await drawDifficulity(i, song.difficulty[i].playLevel, imageHeight - 10);
        const diffW = diffCanvas.width;
        const blockX = i * (imageHeight + spacing);

        ctx.drawImage(diffCanvas, blockX, 2);

        const notesText = await drawText({
            textSize: imageHeight / 3.5,
            text: Object.keys(song.notes).length == 0 ?"?": song.notes[i].toString(),
            maxWidth: imageHeight * 3.5
        });

        const notesTextX = blockX + diffW / 2 - notesText.width / 2;
        const notesTextY = imageHeight -  notesText.height + 11;

        ctx.drawImage(notesText, notesTextX + 0.55, notesTextY);
      
    }
    return canvas
}
export async function drawDifficulityList(song: Song, imageHeight: number = 60, spacing: number = 10): Promise<Canvas> {
    var difficultyCount = Object.keys(song.difficulty).length
    var canvas = new Canvas(imageHeight * difficultyCount + (difficultyCount - 1) * spacing, imageHeight)
    var ctx = canvas.getContext("2d")
    for (var d in song.difficulty) {
        let i = parseInt(d)
        ctx.drawImage(await drawDifficulity(i, song.difficulty[i].playLevel, imageHeight), i * (imageHeight + spacing), 0)
    }
    return canvas
}
export async function drawDifficulityList2(song: Song, imageHeight: number = 60, spacing: number = 10): Promise<Canvas> {
    var difficultyCount = Object.keys(song.difficulty).length
    var canvas = new Canvas(imageHeight * difficultyCount + (difficultyCount - 1) * spacing, imageHeight)
    var ctx = canvas.getContext("2d")
    ctx.drawImage(new Canvas(imageHeight, imageHeight),10,10)
    for (var d in song.difficulty) {
        let i = parseInt(d)
        ctx.drawImage(await drawDifficulity(i, song.difficulty[i].playLevel, imageHeight), i * (imageHeight + spacing), 0)
    }
    
    return canvas
}
export async function drawDifficulityWithNotes(difficultyType: number, playLevel: number, imageHeight: number,choose: boolean = true,notes?:number) {
    var tempcanv = new Canvas(imageHeight, imageHeight + 30)
    var ctx = tempcanv.getContext("2d")
    ctx.drawImage(await drawDifficulity(difficultyType,playLevel,imageHeight,choose),0,8)
    const notesText = await drawText({
        textSize: imageHeight / 3.5,
        text: notes.toString(),
        maxWidth: imageHeight * 3.5
    });
    ctx.drawImage(notesText,(tempcanv.width -  notesText.width)/2,imageHeight+8)
    return tempcanv
}


export async function drawDifficulity(difficultyType: number, playLevel: number, imageHeight: number,choose: boolean = true,notes?:number) {
    var tempcanv = new Canvas(imageHeight, notes?imageHeight+30:imageHeight)
    var ctx = tempcanv.getContext("2d")
    let offset = notes?8:0
    //if (notes) ctx.drawImage(null,0,8)
    if (difficultyColorList[difficultyType] != undefined) {
        ctx.fillStyle = difficultyColorList[difficultyType]
    }
    else {
        ctx.fillStyle = "#f1f1f1"
    }
    if (choose) {
        ctx.arc(imageHeight / 2, (imageHeight / 2) + offset, imageHeight / 2, 0, 2 * Math.PI)
        ctx.fill()
    }
    else {
        ctx.lineWidth = 5
        ctx.arc(imageHeight / 2, imageHeight / 2, imageHeight / 2 - ctx.lineWidth / 2, 0, 2 * Math.PI)
        ctx.stroke()
    }
    var levelText = await drawText({
        textSize: imageHeight / 3 * 2,
        text: playLevel.toString(),
        maxWidth: imageHeight * 3
    })
    ctx.drawImage(levelText, imageHeight / 2 - levelText.width / 2, (imageHeight / 2) + offset - levelText.height / 2)
    if(notes){
        const notesText = await drawText({
            textSize: imageHeight / 3.5,
            text: notes.toString(),
            maxWidth: imageHeight * 3.5
        });
        ctx.drawImage(notesText,(tempcanv.width -  notesText.width)/2,imageHeight+offset)
    }
    return (tempcanv)
}

export async function drawDifficulity2(difficultyType: number, playLevel: number, imageHeight: number,notes:number) {
    var tempcanv = new Canvas(imageHeight +60, imageHeight+60)
    var ctx = tempcanv.getContext("2d")
    if (difficultyColorList[difficultyType] != undefined) {
        ctx.fillStyle = difficultyColorList[difficultyType]
    }
    else {
        ctx.fillStyle = "#f1f1f1"
    }
    ctx.arc(imageHeight / 2, imageHeight / 2, imageHeight / 2, 0, 2 * Math.PI)
    ctx.fill()
    var levelText = await drawText({
        textSize: imageHeight / 3 * 2,
        text: playLevel.toString(),
        maxWidth: imageHeight * 3
    })
    ctx.drawImage(levelText, imageHeight / 2 - levelText.width / 2, imageHeight / 2 - levelText.height / 2)
    var noteNumber = await drawText({
        textSize: imageHeight / 3 * 2,
        text: notes.toString(),
        maxWidth: imageHeight * 3
    })
    ctx.drawImage(noteNumber, imageHeight / 2 - levelText.width / 2, imageHeight - levelText.height / 2)

    return (tempcanv)
}

export async function drawDifficulityListWithNotes(song: Song, imageHeight: number = 60, maxWidth = 800): Promise<Canvas> {
    var difficultyCount = Object.keys(song.difficulty).length
    var canvas = new Canvas(maxWidth, imageHeight * 2)
    let spacing = (maxWidth - difficultyCount * imageHeight) / difficultyCount
    var ctx = canvas.getContext("2d")
    for (var d in song.difficulty) {
        let i = parseInt(d)
        ctx.drawImage(await drawDifficulity(i, song.difficulty[i].playLevel, imageHeight), i * (imageHeight + spacing) + imageHeight / 2, 0)
        let notesText = await drawText({
            textSize: imageHeight / 3 * 2,
            text: Object.keys(song.notes).length == 0 ?"?": song.notes[i].toString(),
            maxWidth: imageHeight * 3
        })
        ctx.drawImage(notesText, i * (imageHeight + spacing) + imageHeight - notesText.width / 2, imageHeight * 7 / 6)

    }
    return canvas
}

export async function drawDifficulityListWithDiff(song: Song, difficulty: number, imageHeight: number = 60, spacing: number = 10): Promise<Canvas> {
    var difficultyCount = Object.keys(song.difficulty).length
    var canvas = new Canvas(imageHeight * difficultyCount + (difficultyCount - 1) * spacing, imageHeight)
    var ctx = canvas.getContext("2d")
    for (var d in song.difficulty) {
        let i = parseInt(d)
        ctx.drawImage(await drawDifficulity(i, song.difficulty[i].playLevel, imageHeight, i == difficulty), i * (imageHeight + spacing), 0)
    }
    return canvas
}

