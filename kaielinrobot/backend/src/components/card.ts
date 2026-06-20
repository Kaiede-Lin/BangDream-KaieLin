import { assetsRootPath } from '@/config'
import { setFontStyle } from '@/image/text'
import { Band } from '@/types/Band'
import { Attribute } from '@/types/Attribute'
import { Card } from '@/types/Card'
import { Image, Canvas, loadImage } from 'skia-canvas'
import { downloadFileCache } from '@/api/downloadFileCache'
import { drawCardIconSkill } from '@/components/skill'
import * as path from 'path'
import { Skill } from '@/types/Skill'
import { Bestdoriurl } from "@/config"
import { loadImageFromPath } from '@/image/utils';
import { parentPort, threadId,isMainThread  } from'worker_threads';
var cardTypeIconList: { [type: string]: Image } = {}
var starList: { [type: string]: Image } = {}
var limitBreakIcon: Image


if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }
var loadImageOnceFinished = false
export async function loadImageOnce() {
    if(!loadImageOnceFinished){
    cardTypeIconList.limited = await loadImageFromPath(path.join(assetsRootPath, '/Card/L.png'));
    cardTypeIconList.dreamfes = await loadImageFromPath(path.join(assetsRootPath, '/Card/D.png'));
    cardTypeIconList.kirafes = await loadImageFromPath(path.join(assetsRootPath, '/Card/K.png'));
    cardTypeIconList.birthday = await loadImageFromPath(path.join(assetsRootPath, '/Card/B.png'));
    starList.normal = await loadImageFromPath(path.join(assetsRootPath, '/Card/star.png'));
    starList.trained = await loadImageFromPath(path.join(assetsRootPath, '/Card/star_trained.png'));
    limitBreakIcon = await loadImageFromPath(path.join(assetsRootPath, '/Card/limitBreakRank.png'));
    
    loadImageOnceFinished = true
    }
}
//if (isMainThread)loadImageOnce()
loadImageOnce()
//根据稀有度与属性，获得图标框
async function getCardIconFrame(rarity: number, attribute: 'cool' | 'happy' | 'pure' | 'powerful'): Promise<Image> {
    const baseUrl = `${Bestdoriurl}/res/image/card-`
    if (rarity == 1) {
        var imageUrl = baseUrl + '1-' + attribute + '.png'

    }
    else {
        var imageUrl = baseUrl + rarity.toString() + '.png'
    }
    var imageBuffer = await downloadFileCache(imageUrl)
    return (await loadImage(imageBuffer))
}

//根据稀有度与属性，获得插画框
async function getCardIllustrationFrame(rarity: number, attribute: 'cool' | 'happy' | 'pure' | 'powerful'): Promise<Image> {
    const baseUrl = `${Bestdoriurl}/res/image/frame-`
    if (rarity == 1) {
        var imageUrl = baseUrl + '1-' + attribute + '.png'

    }
    else {
        var imageUrl = baseUrl + rarity.toString() + '.png'
    }
    var imageBuffer = await downloadFileCache(imageUrl)
    return (await loadImage(imageBuffer))
}




interface drawCardIconOptions {
    card: Card
    trainingStatus: boolean,
    illustTrainingStatus?: boolean,
    limitBreakRank?: number,
    level?: number,
    cardIdVisible?: boolean,
    skillTypeVisible?: boolean,
    cardTypeVisible?: boolean,
    skillLevel?: number,

}

//画卡icon
export async function drawCardIcon({
    card,
    trainingStatus,
    illustTrainingStatus,
    limitBreakRank = 0,
    cardIdVisible = false,
    skillTypeVisible = false,
    cardTypeVisible = true,
    skillLevel
}: drawCardIconOptions): Promise<Canvas> {
    trainingStatus = card.ableToTraining(trainingStatus)
    illustTrainingStatus ??= trainingStatus
    //console.log("drawCardIcon")
    const canvas: Canvas = cardIdVisible ? new Canvas(180, 210) : new Canvas(180, 180);
    const ctx = canvas.getContext('2d');
    if (card.cardId === 947) illustTrainingStatus = false
    if (!loadImageOnceFinished) await loadImageOnce()
    // ★ 所有异步操作先不 await，而是创建 Promise
    const pCardIcon = card.getCardIconImage(illustTrainingStatus);
    const pFrame = getCardIconFrame(card.rarity, card.attribute);
    const pAttributeIcon = new Attribute(card.attribute).getIcon();
    const pBandIcon = new Band(card.bandId).getIcon();

    let pSkillTypeIcon: Promise<Canvas> | undefined;
    if (skillTypeVisible) {
        const skill = new Skill(card.skillId)
        pSkillTypeIcon = drawCardIconSkill(skill)
    }

    // ★ 等待所有 Promise 一次性并发完成
    const [
        cardIcon,
        frame,
        attributeIcon,
        bandIcon,
        skillTypeIcon
    ] = await Promise.all([
        pCardIcon,
        pFrame,
        pAttributeIcon,
        pBandIcon,
        pSkillTypeIcon ?? Promise.resolve(undefined)
    ]);

    // === 从这里开始完全与你原来的绘图逻辑一致 ===

    ctx.drawImage(cardIcon, 0, 0, 180, 180);

    if (cardIdVisible) {
        ctx.textAlign = 'start'
        ctx.textBaseline = 'middle'
        setFontStyle(ctx, 30, 'old')
        ctx.fillStyle = '#a7a7a7'
        ctx.fillText(`ID:${card.cardId}`, 4, 195)
    }

    if (skillLevel != undefined) {
        ctx.fillStyle = '#ff0000'
        ctx.fillRect(138, 91, 35, 39)
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        setFontStyle(ctx, 35, 'old')
        ctx.fillText(skillLevel.toString(), 155.5, 107.5)
    } else if (cardTypeVisible) {
        if (cardTypeIconList[card.type] != undefined) {
            ctx.drawImage(cardTypeIconList[card.type], 138, 91)
        }
    }

    if (skillTypeIcon) {
        ctx.drawImage(skillTypeIcon, 180 - skillTypeIcon.width, 142)
    }

    ctx.drawImage(frame, 0, 0);
    ctx.drawImage(attributeIcon, 132.5, 3, 45.26, 45.26);
    ctx.drawImage(bandIcon, 0, 0, 45, 45);

    if (limitBreakRank != 0) {
        ctx.drawImage(limitBreakIcon, 137, 51, 39, 39)
        setFontStyle(ctx, 25, 'old')
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(limitBreakRank.toString(), 155, 70)
    }

    const star = trainingStatus?starList.trained : starList.normal
    for (var i = 0; i < card.rarity; i++) {
        ctx.drawImage(star, 4, 150 - 26 * i, 29, 29)
    }

    return canvas;
}

interface drawCardIllustrationOptions {
    card: Card
    trainingStatus: boolean,
    isList?: boolean
}
//画卡插画
export async function drawCardIllustration({
    card,
    trainingStatus,
    isList = false,
}: drawCardIllustrationOptions): Promise<Canvas> {
    //console.log('drawCardIllustration')
    trainingStatus = card.ableToTraining(trainingStatus)
    var PromiseList = []
    //var CardIllustrationImage = await card.getCardIllustrationImage(trainingStatus)
    PromiseList.push(card.getCardIllustrationImage(trainingStatus))
    PromiseList.push(getCardIllustrationFrame(card.rarity, card.attribute))
    var PromiseResult = await Promise.all(PromiseList)
    
    var CardIllustrationImage = PromiseResult[0]
    const canvas = new Canvas(1360, 905)
    var ctx = canvas.getContext("2d")
    //将cardIllustration等比例缩放至宽度为1334
    var scale = 1334 / CardIllustrationImage.width
    const illustrationCanvas = new Canvas(1334, 879)
    var illustrationCtx = illustrationCanvas.getContext("2d")
    var illustrationHeight = CardIllustrationImage.height * scale
    illustrationCtx.drawImage(CardIllustrationImage, 0, (879 / 2) - (illustrationHeight / 2), 1334, illustrationHeight)
    ctx.drawImage(illustrationCanvas, 13, 13)
    //获得框
    //var Frame = await getCardIllustrationFrame(card.rarity, card.attribute)
    var Frame = PromiseResult[1]
    ctx.drawImage(Frame, 0, 0, 1360, 905)
    var attributeIcon = await new Attribute(card.attribute).getIcon()
    ctx.drawImage(attributeIcon, 1195, 11, 150, 150)
    var bandIcon = await new Band(card.bandId).getIcon()
    ctx.drawImage(bandIcon, 11, 11, 150, 150)

    var star = starList[trainingStatus ? 'trained' : 'normal']
    if (!starList.normal || !starList.trained) {
        await loadImageOnce();
    }
    //console.log(typeof(starList.normal))
    for (var i = 0; i < card.rarity; i++) {//星星数量
        ctx.drawImage(star, 5, 780 - 100 * i, 110, 110)
    }
    if (isList) {
        //等比例缩放到宽度为widthMax
        var scale = 800 / 1360
        var tempcanvas = new Canvas(800, 905 * scale)
        var ctx = tempcanvas.getContext("2d")
        ctx.drawImage(canvas, 0, 0, 800, 905 * scale)
        return tempcanvas
    }
    else {
        return canvas
    }
}
