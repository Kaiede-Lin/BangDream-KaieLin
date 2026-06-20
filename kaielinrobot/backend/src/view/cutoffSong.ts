import { callAPIAndCacheResponse } from '@/api/getApi';
import { Event } from '@/types/Event';
import { Server } from '@/types/Server';
import { Song } from '@/types/Song';
import { Image, Canvas } from 'skia-canvas';
import { drawList, line, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils';
import { drawTitle } from '@/components/title';
import { drawSongListInListWithMoreDetail, drawSongListInListWithMoreDetailKey } from '@/components/list/song';
import { outputFinalBuffer } from '@/image/output';
import { changeTimePeriodFormat, changeTimefomant } from '@/components/list/time';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { logger } from '@/logger';

// 暂时全部集中在一个页面，待上游合入。
interface cutoffSongsResponse {
    result: boolean;
    cutoffs: Record<string, cutoffSongsDetail[]>;
}
interface cutoffSongsDetail {
    time: number;
    ep: number;
}

export async function drawCutoffSongsDetail(eventId: number, tier: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    const event = new Event(eventId);
    if (!event.isExist) {
        return ['错误: 活动不存在'];
    }

    await event.initFull();

    const eventTypes: string[] = ['versus', 'challenge', 'medley'];
    if (!eventTypes.includes(event.eventType) || !event.musics || event.musics.length === 0) {
        return ['错误: 该活动不是歌榜活动或没有歌曲数据'];
    }
    const drawEventDatablockP = await drawEventDatablock(event, [mainServer]).catch(err => {
            logger('drawEventDatablock error:', err);
            return null;
        });
    const defaultServer = Server.jp;
    const songList: Song[] = [];
    for (let i = 0; i < event.musics[defaultServer].length; i++) {
        songList.push(new Song(event.musics[defaultServer][i].musicId));
    }

    const SongTierUrl = `https://hhwx.org/api/bandori/tracker/data?server=${mainServer}&event=${eventId}&type=song&tier=${tier}`;
    const SongT1Url = `https://hhwx.org/api/bandori/tracker/data?server=${mainServer}&event=${eventId}&type=song&tier=1`;

    const [tier1, tierN] = await Promise.all([
        callAPIAndCacheResponse(SongT1Url, 0, 1, false, 2),
        callAPIAndCacheResponse(SongTierUrl, 0, 1, false, 2)
    ]) as [cutoffSongsResponse, cutoffSongsResponse];

    const t1Score = new Map<number, number>();
    const tierScore = new Map<number, number>();
    const latestUpdateTime = new Map<number, number>();

    for (const song of songList) {
        const songId = song.songId.toString();
        if (!tier1.cutoffs[songId] || !tierN.cutoffs[songId]) {
            continue;
        }

        const t1List = tier1.cutoffs[songId];
        const tierList = tierN.cutoffs[songId];
        const lastT1 = t1List[t1List.length - 1];
        const lastTier = tierList[tierList.length - 1];

        t1Score.set(Number(songId), lastT1.ep);
        tierScore.set(Number(songId), lastTier.ep);
        latestUpdateTime.set(Number(songId), lastTier.time);
    }



    const list: Array<Image | Canvas> = [];

    list.push(new Canvas(800, 30));
    list.push(await drawList({ key: '活动名称', text: event.eventName[mainServer] || '' }));
    list.push(line);

    const now = Date.now();
    const remainingText = event.endAt[mainServer] != null
        ? changeTimePeriodFormat(Math.max(0, event.endAt[mainServer] - now), false)
        : '未知';
    const latestTimeStamp = Math.max(...Array.from(latestUpdateTime.values(), v => v || 0));
    const updateText = latestTimeStamp > 0
        ? `${changeTimePeriodFormat(now - latestTimeStamp, false)}前`
        : '未知';

    list.push(drawListMerge([
        await drawList({ key: '活动剩余时间', text: remainingText }),
        await drawList({ key: '更新时间', text: updateText })
    ]));
    list.push(line);
    let indexFlags  = 1
    for (const song of songList) {
        const songId = song.songId;
        const latest = tierScore.get(songId);
        const t1 = t1Score.get(songId);
        if (latest == null || t1 == null) {
            continue;
        }

        const ratio = t1 === 0 ? 'N/A' : `${((latest / t1) * 100).toFixed(2)}%`;

        //list.push(await drawList({ key: '歌曲', text: `${song.musicTitle[mainServer]} (${song.songId})` }));
        list.push(await drawSongListInListWithMoreDetailKey([song], undefined, `歌曲${indexFlags}`, [mainServer], false));
        //list.push(line);
        list.push(drawListMerge([
            await drawList({ key: '最新分数', text: latest.toString() }),
            await drawList({ key: '占比', text: ratio })
        ]));
        list.push(line);
        indexFlags++
    }
    list.pop()
    if (list.length === 0) {
        return ['错误: 歌曲信息加载失败'];
    }

    const listImage = await drawDatablock({ list });
    const all: Array<Image | Canvas> = [];
    all.push(await drawTitle('查询', `歌榜 T${tier}`));
    const eventBannerCanvas = await drawEventDatablockP;

    all.push(eventBannerCanvas);
    all.push(listImage);

    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, text: 'Event', compress });
    return [buffer];
}
