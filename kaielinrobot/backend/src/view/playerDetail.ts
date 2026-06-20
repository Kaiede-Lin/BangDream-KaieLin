import { Canvas, Image } from 'skia-canvas'
import { outputFinalBuffer } from '@/image/output'
import { Server } from '@/types/Server'
import { Player } from '@/types/Player';
import { drawPlayerDetailBlockWithIllust } from '@/components/dataBlock/playerDetail'
import { assetsRootPath, serverNameFullList } from '@/config'
import * as path from 'path'
import { drawPlayerCardInList } from '@/components/list/playerCardIconList'
import { line, drawList, drawTipsInList } from '@/components/list'
import { drawStatInList } from '@/components/list/stat';
import { drawDatablock } from '@/components/dataBlock';
import { drawPlayerBandRankInList, drawPlayerStageChallengeRankInList, drawPlayerDeckTotalRatingInList } from '@/components/list/bandDetail'
import { drawPlayerDifficultyDetailInList } from '@/components/list/difficultyDetail'
import { drawCharacterRankInList } from '@/components/list/characterDetail'
import { loadImageFromPath } from '@/image/utils';
import { Result } from 'express-validator';

let BGDefaultImage: Image
async function loadImageOnce() {
    BGDefaultImage = await loadImageFromPath(path.join(assetsRootPath, "/BG/common.png"));
}
loadImageOnce()

export async function drawPlayerDetail(playerId: number, mainServer: Server, useEasyBG: boolean, compress: boolean): Promise<Array<Buffer | string>> {
    let result = []
    var player = new Player(playerId, mainServer)
    //尽可能不使用缓存查询。若等待时间过长，则使用缓存查询
    await player.initFull(false, 2)
    if (player.initError) {
        //result.push(`错误: 查询玩家时发生错误: ${playerId}, 正在使用可用缓存`)
        result.push(`错误: 查询玩家时发生错误, 正在使用可用缓存`)
        //使用缓存查询，如果失败则返回失败
        player = new Player(playerId, mainServer)
        await player.initFull(false, 0)
        if (player.initError || !player.isExist) {
            return [`错误: 查询玩家时发生错误: ${playerId}`]
        }
    }

    //检查玩家信息是否存在
    if (!player.isExist) {
        return [`错误: 该服务器 (${serverNameFullList[mainServer]}) 不存在该玩家ID: ${playerId}`]
    }/*
    var stat = await player.calcStat()
    console.log(stat)
    console.log(stat.performance+stat.technique+stat.visual)
    */

    const list: Array<Canvas | Image> = []
    var drawPlayerDetailBlockWithIllustTask = drawPlayerDetailBlockWithIllust(player).catch(err => {
        console.error('drawPlayerDetailBlockWithIllust error:', err);
        return null;
    });
    //卡组
    var drawPlayerCardInListTask = null
    drawPlayerCardInListTask = drawPlayerCardInList(player, '卡牌信息', true).catch(err => {
        console.error('drawPlayerCardInList error:', err);
        return null;
    });
    
    //综合力
    var TotalDeckPowerFlg = null;
    if (player.profile.publishTotalDeckPowerFlg) {
        TotalDeckPowerFlg = drawStatInList(await player.calcStat()).catch(err => {
            console.error('drawStatInList error:', err);
            return null;
        });
    }
    //难度完成信息
    var MusicClearedFlg = null
    if (player.profile.publishMusicClearedFlg) {
        MusicClearedFlg = drawPlayerDifficultyDetailInList(player, 'clearedMusicCount', '完成歌曲数')
    }
    var MusicFullComboFlg = null
    if (player.profile.publishMusicFullComboFlg) {
        MusicFullComboFlg = drawPlayerDifficultyDetailInList(player, 'fullComboMusicCount', 'FullCombo 歌曲数')
    }
    var MusicAllPerfectFlg = null
    if (player.profile.publishMusicAllPerfectFlg) {
        MusicAllPerfectFlg = drawPlayerDifficultyDetailInList(player, 'allPerfectMusicCount', 'AllPerfect 歌曲数')
    }
    //乐队等级
    var BandRankFlg = null
    if (player.profile.publishBandRankFlg) {
        BandRankFlg = drawPlayerBandRankInList(player, "乐队等级").catch(err => {
            console.error('drawPlayerBandRankInList error:', err);
            return null;
        });
    }
    //stageChallenge完成情况
    var StageChallengeAchievementConditionsFlg = null
    if (player.profile.publishStageChallengeAchievementConditionsFlg && player.profile.publishStageChallengeFriendRankingFlg) {
        StageChallengeAchievementConditionsFlg = drawPlayerStageChallengeRankInList(player, '舞台挑战 达成情况').catch(err => {
            console.error('drawPlayerStageChallengeRankInList error:', err);
            return null;
        });
    }

    //乐队编成等级
    var DeckRankFlg = null;
    if (player.profile.publishDeckRankFlg) {
        DeckRankFlg = drawPlayerDeckTotalRatingInList(player, '乐队编成等级').catch(err => {
            console.error('drawPlayerDeckTotalRatingInList error:', err);
            return null;
        });
    }
    //hsr
    var HighScoreRatingFlg = null;
    if (player.profile.publishHighScoreRatingFlg) {
        HighScoreRatingFlg = drawList({
            key: 'High Score Rating',
            text: player.calcHSR().toString()
        })
    }
    var CharacterRankFlg = null;
    if (player.profile.publishCharacterRankFlg) {
        CharacterRankFlg = drawCharacterRankInList(player, '角色等级').catch(err => {
            console.error('drawCharacterRankInList error:', err);
            return null;
        });
    }

    // taskAll.push(drawPlayerDetailBlockWithIllustTask)
    const taskAll = [
        drawPlayerDetailBlockWithIllustTask,
        drawPlayerCardInListTask,
        TotalDeckPowerFlg,
        MusicClearedFlg,
        MusicFullComboFlg,
        MusicAllPerfectFlg,
        BandRankFlg,
        StageChallengeAchievementConditionsFlg,
        DeckRankFlg,
        HighScoreRatingFlg,
        CharacterRankFlg
    ].filter(Boolean)

    const results = await Promise.all(taskAll)

    for(var n = 1;n<results.length;n++){
        list.push(results[n])
        list.push(line)
    }
    // console.log(list)
    





    //与顶部框一起

    //console.log(promises)

    //角色等级


    list.pop()
    const all: Array<Canvas | Image> = []
    //玩家信息 顶部 
    //all.push(await drawPlayerDetailBlockWithIllust(player))
    all.push(results[0])
    var listImage = await drawDatablock({ list })
    all.push(listImage)
    //console.log(all)
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: useEasyBG,
        text: ' ',
        BGimage: BGDefaultImage,
        compress: compress,
    })
    result.push(buffer)
    return result
}
