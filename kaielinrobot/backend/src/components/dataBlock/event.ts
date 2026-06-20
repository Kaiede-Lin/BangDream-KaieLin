import { Event } from "@/types/Event";
import { drawListWithLine, drawList } from "@/components/list";
import { drawDatablock } from '@/components/dataBlock'
import { drawCharacterInList } from '@/components/list/character'
import { drawAttributeInList } from "@/components/list/attribute";
import { Canvas } from 'skia-canvas';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils'
import { drawTimeInList } from '@/components/list/time'
import { Server } from '@/types/Server';
import { globalDefaultServer } from '@/config'

export async function drawEventDatablock(
    event: Event,
    displayedServerList: Server[] = globalDefaultServer,
    topLeftText?: string
) {
    // 初始化事件（加载基本信息）
    //await event.initFull();

    // -------------------------------
    // Step 1. 并发区准备
    // -------------------------------

    // Banner 图片
    const bannerImagePromise = event.getBannerImage();

    // 活动属性 / 角色加成并行计算
    const attributeList = event.getAttributeList();
    const characterList = event.getCharacterList();

    const attributePromiseList: Promise<Canvas>[] = [];
    for (const i in attributeList) {
        if (Object.prototype.hasOwnProperty.call(attributeList, i)) {
            const element = attributeList[i];
            attributePromiseList.push(
                drawAttributeInList({
                    content: element,
                    text: ` +${i}%`
                })
            );
        }
    }

    const characterPromiseList: Promise<Canvas>[] = [];
    for (const i in characterList) {
        if (Object.prototype.hasOwnProperty.call(characterList, i)) {
            const element = characterList[i];
            characterPromiseList.push(
                drawCharacterInList({
                    content: element,
                    text: ` +${i}%`
                })
            );
        }
    }

    // 活动时间并行
    const drawTimePromise = drawTimeInList(
        {
            content: event.startAt,
            eventId: event.eventId,
            estimateCNTime: true
        },
        displayedServerList
    );

    // -------------------------------
    // Step 2. 并行执行所有 Promise
    // -------------------------------
    const [
        eventBannerImage,
        attributeImageList,
        characterImageList,
        timeImage
    ] = await Promise.all([
        bannerImagePromise,
        Promise.all(attributePromiseList),
        Promise.all(characterPromiseList),
        drawTimePromise
    ]);

    // -------------------------------
    // Step 3. 构建最终输出
    // -------------------------------
    const list: Canvas[] = [];

    // Banner 绘制
    const eventBannerImageCanvas = drawBannerImageCanvas(eventBannerImage);
    list.push(eventBannerImageCanvas);

    // 信息文字区
    const textImageList: Array<Canvas> = [];

    // 活动类型与ID
    textImageList.push(
        await drawList({
            text: `${event.getTypeName()}   ID: ${event.eventId}`
        })
    );

    // 属性加成
    textImageList.push(...attributeImageList);

    // 角色加成
    textImageList.push(...characterImageList);

    // 活动时间
    textImageList.push(timeImage);

    // 画左侧有竖线的排版
    const textImageListImage = drawListWithLine(textImageList);
    list.push(textImageListImage);

    // 组装为最终数据块
    return drawDatablock({ list, topLeftText });
}
