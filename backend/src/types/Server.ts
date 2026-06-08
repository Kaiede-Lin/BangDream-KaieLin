import { downloadFileCache } from '@/api/downloadFileCache'
import { loadImage, Image } from 'skia-canvas'
import { globalDefaultServer, serverNameFullList } from '@/config'
import { globalServerPriority, Bestdoriurl } from '@/config'
import { loadImageFromPath, convertSvgToPngBuffer, assetErrorImageBuffer } from '@/image/utils';
import { logger } from '@/logger';


//服务器列表，因为有TW而不适用country
export const serverList: Array<Server> = [0, 1, 2, 3, 4]

export enum Server {
    jp, en, tw, cn, kr
}

export function getServerByServerId(serverId: number): Server {
    //如果是string，则按服务器名查服务器
    if (typeof serverId == 'string') {
        serverId = getServerByName(serverId)
    }
    // 根据服务器id获取对应服务器
    return serverList[serverId]
}

export function getServerByName(name: string): Server {
    // 根据服务器名获取对应服务器
    let server: Server
    server = Server[name as keyof typeof Server];
    if (server == undefined) {
        for (let i = 0; i < serverNameFullList.length; i++) {
            if (name == serverNameFullList[i]) {
                server = i
                break;
            }
        }
    }
    return server
}

let serverIconCache: { [server: number]: Image } = {}

export async function getIcon(server: Server): Promise<Image> {
    if (serverIconCache[server]) {
        return serverIconCache[server]
    }
    let image: Image
    let readyToCache = false
    if (server == Server.tw) {
        image = await loadImageFromPath('./assets/tw.png')
    }
    else {
        const iconSvgBuffer = await downloadFileCache(`${Bestdoriurl}/res/icon/${Server[server]}.svg`)
        if (!iconSvgBuffer.equals(assetErrorImageBuffer)){
            readyToCache = true
            logger('getServerIcon','Cache HotSpot Image Successful.');
        }
        const iconPngBuffer = await convertSvgToPngBuffer(iconSvgBuffer)
        image = await loadImage(iconPngBuffer)
    }
    if (readyToCache) serverIconCache[server] = image
    return image
}

export function getServerByPriority(content: Array<any>, displayedServerList: Server[] = globalDefaultServer) {
    if (!displayedServerList) displayedServerList = globalDefaultServer
    const serverPriority: Server[] = [...new Set([...displayedServerList, ...globalServerPriority])];
    for (let i = 0; i < serverPriority.length; i++) {
        const tempServer = serverPriority[i];
        if (content[tempServer] != null) {
            return tempServer;
        }
    }
    return undefined;
}

export function isServer(server: any): boolean {
    if (typeof server == 'number') {
        server = Server[server]
    }
    else{
        return false
    }
    return Object.keys(Server).includes(server)
}

export function isServerList(serverList: Array<any>): boolean {
    let result = true
    for (let i = 0; i < serverList.length; i++) {
        const element = serverList[i];
        if (!isServer(element)) {
            result = false
            break
        }
    }
    return result
}
