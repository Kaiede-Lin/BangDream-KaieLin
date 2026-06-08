import mainAPI from '@/types/_Main';
import { parentPort, threadId, isMainThread } from 'worker_threads';
import { Character } from '@/types/Character';
import { Image, loadImage } from 'skia-canvas'
import { downloadFileCache } from '@/api/downloadFileCache';
import { formatNumber } from '@/types/utils';
import { Bestdoriurl } from "@/config"
import { convertSvgToPngBuffer } from '@/image/utils'
import { assetErrorImageBuffer } from "@/image/utils";
import { logger } from '@/logger';

export class Band {
    bandId: number;
    isExist: boolean = false;
    data: object;
    bandName: Array<string | null>;
    members: Array<Character | null>;
    hasIcon: boolean = false;
    constructor(bandId: number) {
        this.bandId = bandId
        const bandData = mainAPI['singer'][bandId.toString()]
        if (mainAPI['bands'][bandId.toString()] != undefined) {
            this.hasIcon = true;
        }
        if (bandData == undefined) {
            this.isExist = false;
            return
        }
        this.isExist = true;
        this.data = bandData
        this.bandName = this.data['bandName']
        this.getMembers()
    }
    getMembers() {
        var members = []
        var characterList = mainAPI['characters']
        for (var characterID in characterList) {
            var character = new Character(parseInt(characterID))
            if (character.bandId == this.bandId) {
                members.push(character)
            }
        }
        this.members = members
    }
    async getIcon(): Promise<Image> {
        return await getBandIcon(this.bandId)
    }
    async getLogo(): Promise<Image> {
        const logoBuffer = await downloadFileCache(`${Bestdoriurl}/assets/jp/band/logo/${formatNumber(this.bandId, 3)}_rip/logoL.png`)
        return (await loadImage(logoBuffer))
    }
}


let bandIconCache: { [bandId: number]: Image } = {}

export async function getBandIcon(bandId: number): Promise<Image> {
    if (bandIconCache[bandId]) {
        return bandIconCache[bandId]
    }
    const iconSvgBuffer = await downloadFileCache(`${Bestdoriurl}/res/icon/band_${bandId}.svg`)
    
    const iconPngBuffer = await convertSvgToPngBuffer(iconSvgBuffer)

    // 在算力不足的CPU上，convertSvgToPngBuffer通常需要花费1秒钟左右的时间去运行，在程序开始就缓存起来对出图速度有很大的帮助。
    const image = await loadImage(iconPngBuffer)
    if (!iconSvgBuffer.equals(assetErrorImageBuffer)){
        bandIconCache[bandId] = image
        logger('getBandIcon','Cache HotSpot Image Successful.');
    }
    
    return image
}


