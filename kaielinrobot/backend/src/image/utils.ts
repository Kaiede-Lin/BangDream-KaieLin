import { fileExists } from '@/api/downloader';
import { LRUCacheAny } from '@/LRUCache';
import * as fs from 'fs';
import * as path from 'path';
import { Canvas, loadImage, Image,CanvasRenderingContext2D as SkiaCtx } from 'skia-canvas';
import svg2img  from 'svg2img';

const assetsRootPath: string = path.join(__dirname, '../../assets');

export const assetErrorImageBuffer = fs.readFileSync(`${assetsRootPath}/err.png`)
export const assetErrorImage = loadImage(fs.readFileSync(`${assetsRootPath}/err.png`))
const MAX_CACHE_SIZE = 100;  // 设置SkiaCtx最大缓存量
const ENABLE_CACHE = true; // 是否启用缓存
const FontCanvasPool = new LRUCacheAny(MAX_CACHE_SIZE);
//const FontCanvasPool = new Map<string, SkiaCtx>();

export function getFontCanvasCtxFromPool(fontArgs: string):SkiaCtx {
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


//import {Worker,MessageChannel,MessagePort,SHARE_ENV} from 'node:worker_threads';
//import Piscina from 'piscina';

//const jsonWorker = new Worker('./jsonWorker.js');

//const pool = new Piscina({ filename: workerPath,minThreads:4,maxThreads:4 });


//const jsonWorker = new Worker('./jsonWorker.js');
/*
const workerPath = path.resolve(__dirname, "../readFileWorker.js");
const readFileWorker = new Worker(workerPath,{execArgv: ['--inspect=9233']}); // 如果需要debug new Worker(workerPath,{execArgv: ['--inspect=9233']})
const pending = new Map();
readFileWorker.on('message', msg => {
  const { id, result, error } = msg;
  const handler = pending.get(id);
  if (!handler) return;

  if (error) handler.reject(new Error(error));
  else handler.resolve(result);

  pending.delete(id);
});

async function callWorker<T>(action: string, text: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = Math.random();
    pending.set(id, { resolve, reject });

    readFileWorker.postMessage({ id, action, text });
  });
}
*/

export async function loadImageFromPath(path: string): Promise<Image> {
    //判断文件是否存在
    if (!await fileExists(path)) {
        return assetErrorImage;
    }
    //const stats =  fs.statSync(path);
    //const buf: Buffer = await pool.run(path, { name: 'readFiles'});
    //const buffer = new Buffer()
    return await loadImage(await fs.promises.readFile(path));
}




//指定字体，字号，文本，获取文本宽度
export function getTextWidth(text: string, textSize: number, font: string) {    // 可以转移到worker
    //const canvas = reCanvas;
    const context = getFontCanvasCtxFromPool( `${textSize}px ${font}`);;
    if (!context) {
        throw new Error("Cannot create canvas context");
    }

    //context.font = `${textSize}px ${font}`;
    const metrics = context.measureText(text);

    return metrics.width;
}

export function convertSvgToPngBuffer(svgBuffer: Buffer): Promise<Buffer> {
  //console.trace()
    return new Promise((resolve, reject) => {
      // 将 SVG buffer 转换为字符串
      const svgString = svgBuffer.toString('utf-8');
  
      // 使用 svg2img 将 SVG 字符串转换为 PNG buffer
      svg2img(svgString,{
        quality:70,
        resvg: {
          //shapeRendering: 0,
          //textRendering: 0,
          //imageRendering: 1,
          fitTo: { mode: 'width', value: 100 }
        }
      }, (error, buffer) => {
        if (error) {
          return reject(new Error(`Failed to convert SVG to PNG: ${error.message}`));
        }
        resolve(buffer);
      });
    });
  }