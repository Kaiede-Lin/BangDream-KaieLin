import { Canvas, ImageData } from 'skia-canvas';

export default async function ({ width, height, pixels,format }) {
        const canvas = new Canvas(width, height);
        
        const ctx = canvas.getContext('2d');
        canvas.gpu=false
        // 通过 raw buffer 创建 ImageData
        const imageData = ctx.createImageData(width, height);
        //const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);

        // 注意：skia-canvas 的 raw buffer 是 premultiplied alpha
        // 直接 set 会显示正确
        imageData.data.set(pixels);
        ctx.putImageData(imageData, 0, 0);

        // 输出 PNG/JPEG
        const buffer = format === 'jpeg'
            ? await canvas.toBuffer('jpeg',0.6)
            : await canvas.toBuffer('png');

        return  buffer
    }

