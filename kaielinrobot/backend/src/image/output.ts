import { Canvas, Image } from 'skia-canvas';
import { CreateBG, CreateBGEazy, CreateBGPure } from '@/image/BG';
import { assetsRootPath } from '@/config';
import * as path from 'path';
import { loadImageFromPath } from '@/image/utils';
import { logger } from '@/logger';
var BGDefaultImage: Image
var useGpu = false  // 控制是否使用GPU
async function loadImageOnce() {
    BGDefaultImage = await loadImageFromPath(path.join(assetsRootPath, "/BG/live.png"));
    /*
    BGImageCache = await CreateBGPure({
                width: 1334,
                height: 1002
            })
                */
}
export async function genEasyBGCache() {
    BGImageCache = await CreateBGPure({
                width: 1334,
                height: 1002
            })
}

loadImageOnce()


let BGImageCache = null
interface outputFinalOptions {
    startWithSpace?: boolean;
    imageList: Array<Image | Canvas>;
    useEasyBG?: boolean;
    text?: string;
    BGimage?: Image | Canvas;
    compress?: boolean;
}

//将图片列表从上到下叠在一起输出为一张图片
export var outputFinalCanv = async function ({ imageList,
    startWithSpace = true,
    useEasyBG = true,
    text = 'BanG Dream!',
    BGimage = BGDefaultImage
}: outputFinalOptions
): Promise<Canvas> {
    //console.log(imageList)
    let allH = 30
    if (startWithSpace) {
        allH += 50
    }
    var maxW = 0
    for (var i = 0; i < imageList.length; i++) {
        allH = allH + imageList[i].height
        allH += 30
        if (imageList[i].width > maxW) {
            maxW = imageList[i].width
        }
    }
    var tempcanv = new Canvas(maxW, allH)
    tempcanv.gpu = useGpu
    
    var ctx = tempcanv.getContext("2d")
    ctx.imageSmoothingEnabled = false
    const bgColor = '#fef3ef'
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, maxW, allH);
    
    if (useEasyBG) {
        //if ((maxW * allH) < 5000000) ctx.drawImage(BGImageCache, 0, 0)
        
        
    }
    else {
        ctx.drawImage(await CreateBG({
            text,
            image: BGimage,
            width: maxW,
            height: allH
        }), 0, 0)
    }


    let allH2 = 0
    if (startWithSpace) {
        allH2 += 50
    }
    for (var i = 0; i < imageList.length; i++) {
        ctx.drawImage(imageList[i], 0, allH2)
        allH2 = allH2 + imageList[i].height
        allH2 += 30
    }

    return (tempcanv)
}



//输出为二进制流
export var outputFinalBuffer = async function ({
    startWithSpace = true,
    imageList,
    useEasyBG = true,
    text,
    BGimage,
    compress = true,
}: outputFinalOptions): Promise<Buffer> {
    var tempcanv = await outputFinalCanv({
        startWithSpace,
        imageList,
        useEasyBG,
        text,
        BGimage,
    })
    var tempBuffer: Buffer
    if (compress != undefined && compress) {
        var size = (tempcanv.height * tempcanv.width)
        var qualityValue = 0.7
        //console.log(size)
        if (size >=5000000) qualityValue = 0.6
        if (size >=70000000) qualityValue = 0.5
        logger('adjustImageOutputQuality',`Image Size:${size} Final output quality:${qualityValue}`)
        tempBuffer = await tempcanv.toBuffer('jpeg', { quality:qualityValue,downsample:true, matte: '#fef3ef', })
    }
    else {
        tempBuffer = await tempcanv.toBuffer('png')
    }
    return (tempBuffer)
    
    
}


  // Worker思想就是Post过去然后接收器接收。await就是等待message的
  // 然后现在新开一个Worker给Canvas。由于toBuffer本身是使用skia线程池的，因此理论上可以占满CPU
  // 目的就是不阻塞主线程