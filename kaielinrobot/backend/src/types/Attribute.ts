import { loadImage, Image } from 'skia-canvas'
import { downloadFileCache } from '@/api/downloadFileCache'
import { Bestdoriurl } from "@/config"
import { convertSvgToPngBuffer } from '@/image/utils'
import { assetErrorImageBuffer } from "@/image/utils";
import { logger } from '@/logger';

const attributeColor = {
    'happy': '#ff6600',
    'cool': '#4057e3',
    'pure': '#44c527',
    'powerful': '#ff345a'
}

export class Attribute {
    name: 'cool' | 'happy' | 'pure' | 'powerful'
    color: string
    constructor(name: string) {
        if (['cool', 'happy', 'pure', 'powerful'].includes(name as this['name'])) {
            this.name = name as this['name']
            this.color = attributeColor[name as this['name']]
        } else {

            throw new Error('Invalid attribute name.')
        }
    }

    async getIcon(): Promise<Image> {
        return getAttributeIcon(this.name)
    }
}

export let attributeIconCache: { [name: string]: Image } = {}   // 不太安全的做法，但是简单有效。

async function getAttributeIcon(attributeName: string): Promise<Image> {
    if (attributeIconCache[attributeName]) {
        return attributeIconCache[attributeName]
    }
    const iconSvgBuffer = await downloadFileCache(`${Bestdoriurl}/res/icon/${attributeName}.svg`)

    const iconPngBuffer = await convertSvgToPngBuffer(iconSvgBuffer)
    const image = await loadImage(iconPngBuffer)
    if (!iconSvgBuffer.equals(assetErrorImageBuffer)){
        attributeIconCache[attributeName] = image
        logger('getAttributeIcon','Cache HotSpot Image Successful.');
    }

    return image
} 