import { FontLibrary, Image, Canvas, CanvasRenderingContext2D as SkiaCtx } from 'skia-canvas';
const canvas = new Canvas(1, 1);
var isRegisterFonts = false;
var assetsRootPath = process.env.ASROOT
FontLibrary.use("old", [`${assetsRootPath}/Fonts/old.ttf`])
FontLibrary.use("FangZhengHeiTi", [`${assetsRootPath}/Fonts/FangZhengHeiTi_GBK.ttf`])
const ctx = canvas.getContext('2d');
ctx.textBaseline = 'alphabetic';
export function wrapText({
    text,
    textSize,
    maxWidth,
    lineHeight,
    font = "old",
}) {
    const temp = text.split('\n');
    setFontStyle(ctx, textSize, font);

    for (var i = 0; i < temp.length; i++) {
        let temptext = temp[i]
        let a = 0
        for (var n = 0; n < temptext.length; n++) {
            if (maxWidth > ctx.measureText(temptext.slice(0, temptext.length - n)).width) {
                a = n
                break
            }

        }
        if (a != 0) {
            temp.splice(i + 1, 0, temp[i].slice(temp[i].length - a, temp[i].length))
            temp[i] = temp[i].slice(0, temp[i].length - a)
        }
    }

    for (var i = 0; i < temp.length; i++) {
        if (temp[i] == "") {
            temp.splice(i, 1);
            //去除空值
            i--;
        }
    }
    return {
        numberOfLines: temp.length,
        wrappedText: temp,
    };
}
export var setFontStyle = function (ctx, textSize, font) {//设置字体大小
    ctx.font = textSize + 'px ' + font + ",Microsoft Yahei"
}

export async function drawTextInternalWorker({
    text,
    textSize = 40,
    maxWidth,
    lineHeight = textSize * 4 / 3,
    color = "#505050",
    font = "old",
    cHeight,
    cWidth,
    wrappedTextData
}) {

    var canvas = new Canvas(cWidth, cHeight)
    
    var ctx = canvas.getContext('2d');
    //ctx.clearRect(0, 0, canvas.width, canvas.height);
    let y = lineHeight / 2 + textSize / 3
    ctx.textBaseline = 'alphabetic'

    setFontStyle(ctx, textSize, font);

    ctx.fillStyle = color;
    var wrappedText = wrappedTextData.wrappedText
    //console.log(wrappedText)
    
    for (var i = 0; i < wrappedText.length; i++) {
        ctx.fillText(wrappedText[i], 0, y);
        y += lineHeight;
    }
    const resultBuffer =  canvas.toBuffer('raw');
    return {resultBuffer,transferList: [resultBuffer.buffer]}
}
const FontCanvasPool = new Map();

export function getFontCanvasCtxFromPool(fontArgs) {
  if (!FontCanvasPool.has(fontArgs)) {
    //console.log('Creat new CanvasCtx: '+fontArgs)
    const canvas = new Canvas(1, 1);
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = 'alphabetic'
    ctx.font = fontArgs;
    FontCanvasPool.set(fontArgs, ctx);
  }
  return FontCanvasPool.get(fontArgs);
}
export function measureTextWorker({fontArgs,measureTextData}){
    var  ctx = getFontCanvasCtxFromPool(fontArgs);
    //console.log(measureTextData)
    return ctx.measureText(measureTextData).width
}