import { Chart } from 'chart.js';
import { Canvas, Image } from 'skia-canvas';

export function stackImage(list: Array<Image | Canvas>,AutoDispose:boolean = false) {
    var maxW = 0
    var allH = 0
    for (var i = 0; i < list.length; i++) {
        if (list[i].width > maxW) {
            maxW = list[i].width
        }
        allH += list[i].height
    }
    var tempcanv = new Canvas(maxW, allH)
    var ctx = tempcanv.getContext("2d")
    var allH2 = 0
    for (var i = 0; i < list.length; i++) {
        ctx.drawImage(list[i], 0, allH2)
        allH2 = allH2 + list[i].height
    }
    if (AutoDispose) list.length = 0
    return (tempcanv)
}

export function stackImageHorizontal(list: Array<Image | Canvas>) {
    var maxH = 0
    var allW = 0
    for (var i = 0; i < list.length; i++) {
        if (list[i].height > maxH) {
            maxH = list[i].height
        }
        allW += list[i].width
    }
    var tempcanv = new Canvas(allW, maxH)
    var ctx = tempcanv.getContext("2d")
    var allW2 = 0
    for (var i = 0; i < list.length; i++) {
        ctx.drawImage(list[i], allW2, 0)
        allW2 = allW2 + list[i].width
    }
    return (tempcanv)
}

interface resizeImageOptions {
    image: Image | Canvas,
    heightMax?: number,
    widthMax?: number
}
//输入canvas或Image，高度，宽度，返回等比例缩放到限制高度的canvas
export function resizeImage({
    image,
    heightMax,
    widthMax
}: resizeImageOptions) {
    var height = image.height
    var width = image.width
    if (heightMax != undefined) {
        width = width * heightMax / height
        height = heightMax
    }
    if (widthMax != undefined) {
        height = height * widthMax / width
        width = widthMax
    }
    var canvas = new Canvas(width, height)
    var ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, width, height)
    return canvas
}

// 取得高度，节省空间
export function getOptHeight(n:number,x:number,y:number,line:number,line2:number,offsetN:number = 0){
    // n：多少个框
    // x：框长度比例
    // y：框高度比例
    // line：行高度
    // line2：列高度
    // offsetN：为了解决部分活动角色显示过多而设置的
    //n=n+2
    n = n + offsetN
    let size = 999999999999999
    let x1 = 0
    let y1 = 0
    let maxHeightLimit = 7000
    for(var i = 1;i<7;i++){ // 长度，最高7个长度
        let h = Math.ceil(n/i)  // 当每行有i个的时候，h预计要多少个
        let s = ((h*y + line*(h-1))*(x*i + line2*(i-1)))
        //console.log(`列${i} h=${h} 面积为${s} 高度${h*y}`)
        if (s <= size && ((h*y + y)  < maxHeightLimit)){
            size = s
            x1 = i
            y1 = (h * y) - 1000
            //console.log(`更新配置：列${i} h=${h} 面积为${s} 最终返回高度${y1}`)
        }
    }
    // 获取最佳的面积
    if ((y1 )  >= maxHeightLimit) return  maxHeightLimit 
    //console.log((y1 ))
    return (y1 )
}

// 取得每行最高绘制数量，节省空间
export function getOptDrawCount(n:number,x:number,y:number,line:number,line2:number,offsetN:number = 0){
    // n：多少个框
    // x：框长度比例
    // y：框高度比例
    // line：行高度
    // line2：列高度
    // offsetN：为了解决部分活动角色显示过多而设置的
    //n=n+2
    if (n  < 7) return n
    n = n +offsetN
    let size = 999999999999999
    let x1 = 0
    let y1 = 0
    let c = 0
    let maxHeightLimit = 7000
    let iMax = 5
    for(var i = 1;i<iMax;i++){ // 长度，最高5个长度
        let h = Math.ceil(n/i)  // 当每行有i个的时候，h预计要多少个
        let s = ((h*y + line*(h-1))*(x*i + line2*(i-1)))
        //console.log(`列${i} h=${h} 面积为${s} 高度${h*y}`)
        if (s <= size && ((h*y + y)  < maxHeightLimit)){
            size = s
            x1 = i
            //y1 = (h * y) - 1000
            c = h
            if ((h*y) < maxHeightLimit) return c
            //console.log(`更新配置：列${i} h=${h} 面积为${s} 最终返回高度${y1}`)
        }
    }
    if (c == 0){    // 防止畸形面积出现
        for(var i = 4;i<9;i++){ // 长度，最高7个长度
            let h = Math.ceil(n/i)  // 当每行有i个的时候，h预计要多少个
            let s = ((h*y + line*(h-1))*(x*i + line2*(i-1)))
            //console.log(`列${i} h=${h} 面积为${s} 高度${h*y}`)
            if (s <= size ){
                size = s
                x1 = i
                //y1 = (h * y) - 1000
                c = h
                //console.log(`更新配置：列${i} h=${h} 面积为${s} 最终返回高度${y1}`)
            }
        }
    }
    // 获取最佳的面积
    // if ((y1 )  >= maxHeightLimit) return  c
    //console.log(c + Math.ceil(offsetN))
    //console.log(Math.ceil(offsetN))
    //if ((c + Math.ceil(offsetN)) > 31) return 31
    return c + Math.ceil(offsetN)
}

export function disposeChartButKeepingCanvas(chart: any) {     // chart.js 的destroy() 6420行，仿照着写但是不清空Canvas
  chart.notifyPlugins?.('beforeDestroy');

  chart._stop?.();
  chart.config?.clearCache?.();
  chart.unbindEvents?.();

  delete Chart.instances[chart.id];

  chart.canvas = null;
  chart.ctx = null;

  chart.notifyPlugins?.('afterDestroy');
}