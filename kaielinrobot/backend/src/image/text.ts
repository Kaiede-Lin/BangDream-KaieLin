import { FontLibrary, Image, Canvas, CanvasRenderingContext2D, loadImageData } from 'skia-canvas';
import { assetsRootPath } from '@/config';
FontLibrary.use("old", [`${assetsRootPath}/Fonts/old.ttf`])
FontLibrary.use("FangZhengHeiTi", [`${assetsRootPath}/Fonts/FangZhengHeiTi_GBK.ttf`])
import * as path from 'path';
import { getFontCanvasCtxFromPool } from './utils';
import { logger } from '@/logger';
import { LRUCache, LRUCacheAny, LRUCacheNumber } from '@/LRUCache';
const workerPath = path.resolve(__dirname, "../wrapTextWorker.js");

interface warpTextOptions {
    text: string,
    textSize?: number,
    maxWidth: number,
    lineHeight?: number
    color?: string,
    font?: "FangZhengHeiTi" | "old" | "default",
    forceSingleLine?:boolean
}
interface CanvasPoolItem {
    canvas: Canvas;
    width: number;
    height: number;
    busy: boolean; // 是否被占用
}
export const canvasPool: CanvasPoolItem[] = [];
const normalCanvas = new Canvas(1, 1);
const normalCtx = normalCanvas.getContext('2d');
normalCtx.textBaseline = 'alphabetic';
const drawTextCanvas: Canvas = new Canvas(1,1)



// 绘制完成后释放 Canvas
export function releaseCanvas(canvas: Canvas) {
    return
}
/*
//画文字,自动换行
export async function drawTextInWorker({
    text,
    textSize = 40,
    maxWidth,
    lineHeight = textSize * 4 / 3,
    color = "#505050",
    font = "old"
}: warpTextOptions): Promise<Canvas> {
    var wrappedTextData =  await wrapText({ text, maxWidth, lineHeight, textSize });
    if (wrappedTextData.numberOfLines == 0) {
        //var canvas: Canvas = new Canvas(1, lineHeight);
        var canvas = new Canvas(1, lineHeight)

    }
    else if (wrappedTextData.numberOfLines == 1) {
        var  ctx = getFontCanvasCtxFromPool(setFontStyleArgs(textSize, 'old'));
        var width = maxWidth = ctx.measureText(wrappedTextData.wrappedText[0]).width
        var canvas = new Canvas(width, lineHeight)

    }
    else {
        //var canvas: Canvas = new Canvas(maxWidth, lineHeight * wrappedTextData.numberOfLines);
        var canvas = new Canvas(maxWidth, lineHeight * wrappedTextData.numberOfLines)

    }
    var ctx = canvas.getContext('2d')
    var cHeight = canvas.height
    var cWidth = canvas.width
    console.log(cHeight,cWidth)
    const { resultBuffer } = await drawTextPool.run({text,textSize,maxWidth,undefined,color,font,cWidth,cHeight,wrappedTextData},{name:'drawTextInternalWorker'})
    console.log(resultBuffer.buffer)
    const imgData = ctx.createImageData(cWidth, cHeight);
    imgData.data.set(Buffer.from(resultBuffer.buffer));
    //console.log(resultBuffer.buffer)
    ctx.putImageData(imgData, 0, 0);
    return canvas;
} 
*/
const drawTextMeasureTextCache= new LRUCacheNumber(750);
export function drawTextMeasureText(text:string,textSize:number,font?: "FangZhengHeiTi" | "old" | "default") {
    var MeasureTextFlags = `${text}-${textSize}-${font}`
    if(drawTextMeasureTextCache.has(MeasureTextFlags))return drawTextMeasureTextCache.get(MeasureTextFlags)
    const drawTextCanvasCtx = drawTextCanvas.getContext('2d')
    setFontStyle(drawTextCanvasCtx, textSize, font);
    var width = drawTextCanvasCtx.measureText(text).width
    drawTextMeasureTextCache.set(MeasureTextFlags,width)
    return width
}
export  function drawText({
    text,
    textSize = 40,
    maxWidth,
    lineHeight = textSize * 4 / 3,
    color = "#505050",
    font = "old",
    forceSingleLine = false
}: warpTextOptions): Canvas {

    if (forceSingleLine){
        var width = maxWidth = drawTextMeasureText(text,textSize,font)
        //console.log(width)
        var canvas = new Canvas(width, lineHeight);
    }
    else{
        var wrappedTextData =  wrapText({ text, maxWidth, lineHeight, textSize });
        if (wrappedTextData.numberOfLines == 0) {
            //var canvas: Canvas = new Canvas(1, lineHeight);
            var canvas = new Canvas(1, lineHeight)

        }
        else if (wrappedTextData.numberOfLines == 1) {

            var width = maxWidth = drawTextMeasureText(wrappedTextData.wrappedText[0],textSize,font)
            canvas = new Canvas(width, lineHeight);

        }
        else {
            //var canvas: Canvas = new Canvas(maxWidth, lineHeight * wrappedTextData.numberOfLines);
            var canvas = new Canvas(maxWidth, lineHeight * wrappedTextData.numberOfLines)

        }
    }
    
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let y = lineHeight / 2 + textSize / 3
    ctx.textBaseline = 'alphabetic'

    setFontStyle(ctx, textSize, font);

    ctx.fillStyle = color;
    if (forceSingleLine){
        ctx.fillText(text, 0, y);
    }else{
        var wrappedText = wrappedTextData.wrappedText
        for (var i = 0; i < wrappedText.length; i++) {
            ctx.fillText(wrappedText[i], 0, y);
            y += lineHeight;
        }
    }

    return canvas;
}



const wrapTextCache  = new LRUCacheAny(750);
export function wrapText({
    text,
    textSize,
    maxWidth,
    lineHeight,
    font = "old"
}: warpTextOptions) {
    const wrapFlags = `${text}-${textSize}-${maxWidth}-${font}`;

    if (wrapTextCache.has(wrapFlags)) {
        return wrapTextCache.get(wrapFlags);
    }

    setFontStyle(normalCtx, textSize, font);

    const temp = text.split('\n');

    for (let i = 0; i < temp.length; i++) {
        const temptext = temp[i];

        if (temptext === "") continue;

        // 如果整行已经能放下，不需要换行
        if (normalCtx.measureText(temptext).width <= maxWidth) {
            continue;
        }

        let left = 0;
        let right = temptext.length;
        let fitLength = 0;

        // 看草头黄修路灯想到的
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const width = normalCtx.measureText(temptext.slice(0, mid)).width;

            if (width <= maxWidth) {
                fitLength = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        // 防止0
        if (fitLength <= 0) {
            fitLength = 1;
        }

        const currentLine = temptext.slice(0, fitLength);
        const restLine = temptext.slice(fitLength);

        temp[i] = currentLine;

        if (restLine.length > 0) {
            temp.splice(i + 1, 0, restLine);
        }
    }

    // 去除空行
    for (let i = 0; i < temp.length; i++) {
        if (temp[i] === "") {
            temp.splice(i, 1);
            i--;
        }
    }

    const result = {
        numberOfLines: temp.length,
        wrappedText: temp,
    };

    wrapTextCache.set(wrapFlags, result);

    return result;
}


interface TextWithImagesOptions {
    textSize?: number;
    maxWidth: number;
    lineHeight?: number;
    content: (string | Canvas | Image)[];
    spacing?: number;
    color?: string;
    font?: "default" | "old"
}
const measureCache  = new LRUCacheNumber(750);
function cachedMeasureText(ctx, text,textSize, font) {                             // 缓存Measure+
    const key = `${textSize}:${font}:${text}`;
    if (measureCache.has(key)) return measureCache.get(key);
    const w = ctx.measureText(text).width;
    measureCache.set(key, w);
    return w;
}
export function clearMeasureCache(immediately:boolean = false){
    // 当内存压力大的时候，清空缓存
    var mc = measureCache.getCacheSize()
    var wtc = wrapTextCache.getCacheSize()
    var dtmtc = drawTextMeasureTextCache.getCacheSize()
    logger('clearMeasureCache','Size of measure cache:' + mc)
    logger('clearMeasureCache','Size of warp text cache:' + wtc)
    logger('clearMeasureCache','Size of drawTextMeasureTextCache:' + dtmtc)
    var str = ''
    str += ('Size of measure cache:' + mc + '\n')
    str += ('Size of warp text cache:' + wtc+'\n')
    str += ('Size of draw Text Measure Text Cache:' + dtmtc+'\n')
    return str
}
// 画文字包含图片
export function drawTextWithImages({
    textSize = 40,
    maxWidth,
    lineHeight = textSize * 4 / 3,
    content,
    spacing = textSize / 3,
    color = '#505050',
    font = 'old'
}: TextWithImagesOptions) {
    //var t1 = Date.now()
    var wrappedTextData = warpTextWithImages({ textSize, maxWidth, lineHeight, content, spacing });
    var wrappedText = wrappedTextData.wrappedText
    var canvas: Canvas
    if (wrappedTextData.numberOfLines == 0) {
        var canvas: Canvas = new Canvas(1, lineHeight);
    }
    //单行文字，宽度为第一行的宽度
    else if (wrappedTextData.numberOfLines == 1) {
        //canvas = reCanvas;
        const ctx  = getFontCanvasCtxFromPool(setFontStyleArgs(textSize, font));
        //setFontStyle(ctx, textSize, font);
        var Width = 0
        for (var n = 0; n < wrappedText[0].length; n++) {
            if (typeof wrappedText[0][n] === "string") {
                //Width += ctx.measureText(wrappedText[0][n] as string).width
                //var flags = wrappedText[0][n] as string + textSize + font
                Width += cachedMeasureText(ctx, wrappedText[0][n] as string,textSize, font)
            } else {
                //等比例缩放图片，至高度与textSize相同
                let tempImage = wrappedText[0][n] as Canvas | Image
                let tempWidth = textSize * tempImage.width / tempImage.height//等比例缩放到高度与字体大小相同后，图片宽度
                Width += tempWidth
            }
            Width += spacing
        }
        canvas = new Canvas(Width - spacing, lineHeight);
    }
    //多行文字
    else {
        canvas = new Canvas(maxWidth, lineHeight * wrappedTextData.numberOfLines);

    }
    const ctx = canvas.getContext('2d');
    let y = lineHeight / 2 + textSize / 3
    ctx.textBaseline = 'alphabetic'
    setFontStyle(ctx, textSize, font);
    ctx.fillStyle = color;
    for (var i = 0; i < wrappedText.length; i++) {
        let tempX = 0
        for (var n = 0; n < wrappedText[i].length; n++) {
            if (typeof wrappedText[i][n] === "string") {
                ctx.fillText(wrappedText[i][n] as string, tempX, y);
                //tempX += ctx.measureText(wrappedText[i][n] as string).width
                tempX += cachedMeasureText(ctx, wrappedText[i][n] as string,textSize, font)

            } else {
                //等比例缩放图片，至高度与textSize相同
                let tempImage = wrappedText[i][n] as Canvas | Image
                let tempWidth = textSize * tempImage.width / tempImage.height//等比例缩放到高度与字体大小相同后，图片宽度
                ctx.drawImage(tempImage, tempX, y - (textSize / 3) - (textSize / 2), tempWidth, textSize)
                tempX += tempWidth
            }
            if (tempX != 0) {
                tempX += spacing
            }
        }
        y += lineHeight;
    }
    //console.log('绘制用时：'+ (Date.now() - t1))
    return canvas;
}

// 画文字包含图片 的计算换行
function warpTextWithImages({
    textSize = 40,
    maxWidth,
    lineHeight = textSize * 4 / 3,
    content,
    spacing = textSize / 3,
    font = 'old'
}: TextWithImagesOptions) {
    //console.log('warpTextWithImages Excute')
    //const canvas = reCanvas;
    const ctx = getFontCanvasCtxFromPool(setFontStyleArgs(textSize, font));
    //ctx.textBaseline = 'alphabetic';
    //setFontStyle(ctx, textSize, font);
    const temp: Array<Array<string | Image | Canvas>> = [[]];
    let lineNumber = 0;
    let tempX = 0;

    function newLine() {
        lineNumber++;
        tempX = 0;
        temp.push([]);
    }

    for (let i = 0; i < content.length; i++) {
        if (content[i] == undefined || content[i] == null) {
            content[i] = "?"
        }
        if (typeof content[i] === "string") {
            //console.log('String')
            let temptext = content[i] as string;
            while (temptext.length > 0) {
                const lineBreakIndex = temptext.indexOf("\n");
                if (lineBreakIndex !== -1) {
                    const substring = temptext.slice(0, lineBreakIndex);
                    temp[lineNumber].push(substring);
                    newLine();
                    temptext = temptext.slice(lineBreakIndex + 1);
                    continue;
                }

                const remainingWidth = maxWidth - tempX;
                const measuredWidth = cachedMeasureText(ctx, temptext,textSize, font);
                if (remainingWidth >= measuredWidth) {
                    temp[lineNumber].push(temptext);
                    tempX += measuredWidth;
                    break;
                } else {
                    
                    let splitIndex = 0;
                    
                    for (let j = temptext.length - 1; j >= 0; j--) {
                        const substr = temptext.slice(0, j);
                        //var flags = substr + textSize + font
                        const substrWidth = cachedMeasureText(ctx, substr,textSize, font);
                        if (substrWidth <= remainingWidth) {
                            splitIndex = j;
                            break;
                        }
                    }
                    
                    //const splitIndex = findSplitIndex(ctx, temptext, remainingWidth);
                    const substring = temptext.slice(0, splitIndex);
                    temp[lineNumber].push(substring);
                    newLine();
                    temptext = temptext.slice(splitIndex);
                }
            }
        } else  {
            const type = content[i]?.constructor?.name;
            if (type === 'Canvas' || type === 'Image') {
                //content[i] instanceof Canvas || content[i] instanceof Image
            //console.log('Image')
            let tempImage = content[i] as Image;
            let tempWidth = tempImage.width * (textSize / tempImage.height);
            if (tempX + tempWidth > maxWidth) {
                newLine();
            }
            temp[lineNumber].push(tempImage);
            tempX += tempWidth;
        }
        tempX += spacing;
    }
    }
    if (temp[temp.length - 1].length === 0) {
        temp.pop();
    }

    return {
        numberOfLines: temp.length,
        wrappedText: temp,
    };
}


export var setFontStyle = function (ctx: CanvasRenderingContext2D, textSize: number, font: string) {//设置字体大小
    ctx.font = textSize + 'px ' + font + ",Microsoft Yahei"
}
export function setFontStyleArgs (textSize: number, font: string):string {//设置字体参数
    return  textSize + 'px ' + font + ",Microsoft Yahei"
}
