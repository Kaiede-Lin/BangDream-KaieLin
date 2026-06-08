import { Image, Canvas } from 'skia-canvas'
import { drawTitle } from "@/components/title";
import { serverNameFullList } from "@/config";
import { CutoffEventTop } from "@/types/CutoffEventTop";
import { Event } from '@/types/Event';
import { Server } from "@/types/Server";
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawDatablock } from '@/components/dataBlock';
import { outputFinalBuffer } from '@/image/output';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import { drawCutoffEventTopChart } from '@/components/chart/cutoffChart';
import { songChartRouter } from '@/routers/songChart';
import { drawList, drawListMerge, drawListMergeMin, line } from '@/components/list';
import { drawDottedLine } from '@/image/dottedLine';
import { resizeImage } from '@/components/utils';
import { stackImage } from '@/components/utils';
import { logger } from '@/logger';
import { drawText } from '@/image/text';
import { drawTips } from '@/components/tips';
import { changeTimePeriodFormat, changeTimefomant, formatSeconds } from '@/components/list/time';
import mainAPI, { TopRateSpeed } from '@/types/_Main';
import array from 'ref-array-di';
import { min } from 'moment';

export async function drawCutoffEventTop(eventId: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull();
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    var all = [];
    all.push(await drawTitle('档线', `${serverNameFullList[mainServer]} 10档线`));
    var list: Array<Image | Canvas> = [];


    // all.push(await drawEventDatablock(event, [mainServer]));
    var drawPlayerRankingInListPromise = []
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(cutoffEventTop, false, mainServer).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    //前十名片
    var userInRankings = cutoffEventTop.getLatestRanking();
    for (let i = 0; i < userInRankings.length; i++) {
        var color = i % 2 == 0 ? 'white' : '#f1f1f1';
        var user = cutoffEventTop.getUserByUid(userInRankings[i].uid);
        //var playerRankingImage = await drawPlayerRankingInList(user, color, mainServer);
        drawPlayerRankingInListPromise.push(drawPlayerRankingInList(user, color, mainServer))

    }
    var drawPlayerRankingInListResult = await Promise.all(drawPlayerRankingInListPromise)
    for(var r of drawPlayerRankingInListResult){
        if (r != undefined) {
          list.push(r);
        }
    }

    list.push(new Canvas(800, 50))
    
    //折线图
    list.push(await drawCutoffEventTopChartPromise)

    var listImage = await drawDatablock({ list });
    all.push(await drawEventDatablockPromise)
    all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateDetail(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    if (playerId == 1 || playerId == 0 || tier == 0) return drawTopRateSpeedRank(eventId,playerId,tier,maxCount,mainServer,compress)
    if (playerId == 3 ) return drawTopRateSleep(eventId,1007987242,tier,maxCount,mainServer,compress)
    if (playerId == 4 ) return drawTopRateChanged(eventId,1004512554,tier,maxCount,mainServer,compress)
    if (!maxCount) {
        maxCount = 20
    }
    if (maxCount >400) return [`错误: 查岗次数过多，请适当缩减查岗的次数。次数过多会占用大量Bot硬件资源且图片可能会无法被正常送出。如需查T10时速表请回复查岗 0`];
    // 因为没用上所以凭感觉优化了一下，不知道能不能用
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    if (cutoffEventTop.status != "in_progress" && false) {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }

    var all = [];
    const widthMax = 1000, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(await drawTitle('查岗', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        // var event = new Event(eventId);
        // all.push(await drawEventDatablock(event, [mainServer]));
        //名片
        var userInRankings = cutoffEventTop.getLatestRanking();
        var drawPlayerRankingInListPromise1 = []
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer,widthMax))
            /*
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);

            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
            */
        }
        var drawPlayerRankingInListResult1 = await Promise.all(drawPlayerRankingInListPromise1)
        for(var r of drawPlayerRankingInListResult1){
            if (r != undefined) {
              list.push(r);
            }
        }

        if (list.length > 0) {
            all.push(await drawDatablock({ list, maxWidth: widthMax }))
        }
        else 
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId)
    //最近maxCount次分数变化
    {
        const list = [], imageList = []
        let count = 0
        if (!maxCount) {
            maxCount = 20
        }
        list.push(drawListMerge([await drawList({ key: '时间' }), await drawList({ key: '分数' }), await drawList({ key: '时间' }), await drawList({ key: '分数' })], widthMax))
        const halfLine: Canvas = drawDottedLine({
            width: widthMax / 2,
            height: 30,
            startX: 15,
            startY: 15,
            endX: widthMax / 2 - 15,
            endY: 15,
            radius: 2,
            gap: 10,
            color: "#a8a8a8"
        })
        for (let i = 0; i + 1 < playerRating.length; i += 1) {
            if (playerRating[i + 1].value == -1) {
                break
            }
            if (count == maxCount) {
                break
            }
            if (playerRating[i].value != playerRating[i + 1].value) {
                count += 1
                const mid = new Date((playerRating[i + 1].time + playerRating[i].time) / 2), score = playerRating[i].value - playerRating[i + 1].value
                const timeChangeImage = drawListMerge([await drawList({ text: `${mid.toTimeString().slice(0, 5)}`}), await drawList({ text: `${score}`})], widthMax / 2)
                const ctx = timeChangeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`${mid.getMonth()+1}.${mid.getDate()}`, 45, 13)
                imageList.push(timeChangeImage)
                // list.push(line)
            }
        }
        if (count == 0) {
            list.push(await drawList( {text: '数据不足'} ))
        }
        else {
            imageList.reverse()
            const leftImage = [], rightImage = []
            for (let i = 0; i < count + 1 >> 1; i += 1) {
                leftImage.push(imageList[i])
                leftImage.push(halfLine)
            }
            leftImage.pop()
            for (let i = count + 1 >> 1; i < count; i += 1) {
                rightImage.push(imageList[i])
                rightImage.push(halfLine)
            }
            if (count % 2 == 0)
                rightImage.pop()
            list.push(drawListMerge([stackImage(leftImage), stackImage(rightImage)], widthMax))
        }
        all.push(await drawDatablock({ list, topLeftText: `最近${maxCount}次分数变化`}))
    }
        // CP Traces
    if (mainAPI["events"][eventId.toString()]["eventType"]=="challenge" &&  playerRating.length > 70){

    
    // 根据t10的习惯，一般是先清火再计算CP。以3火一把的协力为基准，作为CP200的值（通常情况下）。
    // 取前8次的CP平均值
    const cpTraceList = []
    let cpCount = playerRating.length   // 这里是player分数表总数
    let cpCountTmp = 0  // 用来确定循环次数
    let cooperationAvgPt = 0    // 定义协力平均Pt
    let cooperationAvgPtTotalTmp = 0    // 确定协力总Pt的一个临时变量
    //console.log(playerRating)
    let errCount = 0
    for(var cpindex = cpCount -2 - 50;cpindex > 0;cpindex--){// 避免fever，从第52次开始算
        if (cpCountTmp >50) break    //如果大于50次就可以跳出了
        // 判断数据是否正常
        
        if (playerRating[cpindex -1].value == -1 || playerRating[cpindex].value == -1){
            errCount ++
            continue
        }
        else{
            let tmp = playerRating[cpindex -1].value - playerRating[cpindex].value
            if(tmp !=0 && tmp<15000){   // 防止意外计算
                cpCountTmp++
                cooperationAvgPtTotalTmp += tmp
            }
        }
    }

    if (!(cpCountTmp == 0 || cooperationAvgPtTotalTmp ==0)){
        cooperationAvgPt = cooperationAvgPtTotalTmp / cpCountTmp
    }
    //console.log('该用户协力把均Pt基准：',cooperationAvgPt,' errCount',errCount)
    // 定义各个CP的Pt增加基准
    let cp200 = cooperationAvgPt    // cp200是没有办法与pt做区分的。但前排一般都是1600清cp。200清cp效率太低不太可能
    let cp400 = cooperationAvgPt * 1.6
    let cp800 = cooperationAvgPt * 3.5
    let cp1600 = cooperationAvgPt * 7.4
    let cooperationPtTotal = 0  // 判定为协力的总Pt
    let cooperationCounts = 0   // 协力的数据量
    let cpPtTotal = 0   // 判定为清CP的总Pt
    let cpCounts = 0    // 清CP的数据量
    let currentCps = 0; // CP数量（推断）
    let cooperationToCpsTotal = 0;  // 获取到的总CP
    let negativeOne = true // 是否存在-1
    let negativeOneToVaildValue = 0 // 最后一个-1.
    let totalCpToPts = 0   // 有效数据（记录内）清CP所获得的总Pt数
    // 根据游戏内观察得出，CP一般是协力分数/20
    let f100CpCounts = 0    // 前100次一共清CP次数
    let f100CooeprCounts = 0 //  前100次一共协力次数
    let cpTraceRange = 100  // 取样范围
    for(var cpindex = cpCount -2 ;cpindex > 0;cpindex--){ 
        // 判断数据是否正常
        if (playerRating[cpindex -1].value == playerRating[cpindex].value || playerRating[cpindex -1].value == -1 || playerRating[cpindex].value == -1){
            //if (negativeOne)negativeOne = true
            continue
        }
        else{
            if (negativeOne){   // 这里已经不是-1了
                negativeOneToVaildValue = playerRating[cpindex].value +1
                negativeOne = false
            }
            let onceAddPt = (playerRating[cpindex -1].value - playerRating[cpindex].value)  // index越小的value越大
            if (onceAddPt >= cp1600){
                currentCps -=1600
                cpCounts++
                cpPtTotal += onceAddPt
                if ((f100CooeprCounts + f100CpCounts) < cpTraceRange) f100CpCounts++
                //console.log('清CP1600：',playerRating[cpindex -1].value,playerRating[cpindex].value)
            }else if (onceAddPt >= cp800){
                currentCps -=800
                cpCounts++
                cpPtTotal += onceAddPt
                if ((f100CooeprCounts + f100CpCounts) < cpTraceRange) f100CpCounts++
               //console.log('清CP800：',playerRating[cpindex -1].value,playerRating[cpindex].value,playerRating[cpindex -1].value-playerRating[cpindex].value,(playerRating[cpindex -1].time - playerRating[cpindex].time)/1000)
            }
            else if (onceAddPt >= cp400 && (playerRating[cpindex -1].value > 910000)){ // 与烧fever作分辨
                currentCps -=400
                cpCounts++
                cpPtTotal += onceAddPt
                if ((f100CooeprCounts + f100CpCounts) < cpTraceRange) f100CpCounts++
                //console.log('清CP400：',playerRating[cpindex -1].value,playerRating[cpindex].value,playerRating[cpindex -1].value-playerRating[cpindex].value,(playerRating[cpindex -1].time - playerRating[cpindex].time)/1000)
                // 不统计CP400，与BD记录间隙相鉴别
            }
            else{   // cp200 与 3火一把Pt没办法分辨。
                currentCps += (onceAddPt / 20)
                cooperationCounts++
                cooperationPtTotal += onceAddPt
                cooperationToCpsTotal+= (onceAddPt / 20)
                if ((f100CooeprCounts + f100CpCounts) < cpTraceRange) f100CooeprCounts++
                //console.log('清CP200：',playerRating[cpindex -1].value,playerRating[cpindex].value,playerRating[cpindex -1].value-playerRating[cpindex].value,(playerRating[cpindex -1].time - playerRating[cpindex].time)/1000)
            }
        }
    }
    let cooperationPtTotalLast50 = 0  // 判定为协力的总Pt
    let cooperationCountsLast50 = 0   // 协力的数据量
    let cpPtTotalLast50 = 0   // 判定为清CP的总Pt
    let cpCountsLast50 = 0    // 清CP的数据量
    let currentCpsLast50 = 0; // 
    let cooperationToCpsTotalLast50 = 0;  // 获取到的总CP
    let last50CalcCount = 0
    // 根据游戏内观察得出，CP一般是协力分数/20
    for(var cpindex = 0;cpindex < cpCount - 1;cpindex++){
        // 判断数据是否正常
        if (playerRating[cpindex ].value == playerRating[cpindex+1].value || playerRating[cpindex ].value == -1 || playerRating[cpindex].value == -1){
            continue
        }
        if (last50CalcCount >= 50) break;
        else{

            let onceAddPt = (playerRating[cpindex].value - playerRating[cpindex+1].value)  // index越小的value越大
            if (onceAddPt >= cp1600){
                currentCpsLast50 -=1600
                cpCountsLast50++
                cpPtTotalLast50 += onceAddPt
                last50CalcCount++
            }else if (onceAddPt >= cp800){
                currentCpsLast50 -=800
                cpCountsLast50++
                cpPtTotalLast50 += onceAddPt
                last50CalcCount++
            }
            else if (onceAddPt >= cp400){
                currentCpsLast50 -=400
                cpCountsLast50++
                cpPtTotalLast50 += onceAddPt
                last50CalcCount++
            }
            else{   // cp200 与 3火一把Pt没办法分辨。
                currentCpsLast50 += (onceAddPt / 20)
                cooperationCountsLast50++
                cooperationPtTotalLast50 += onceAddPt
                cooperationToCpsTotalLast50 += (onceAddPt / 20)
                last50CalcCount++
            }
        }
    }
    // 处理-1到有数据这段时间的数据
    let fullFeverPts = cooperationAvgPt * 2 * 12    // 固定12次
    let maxPts = playerRating[0].value  // 当前最高分数
    let ptsTotalUnRecord = maxPts - cooperationPtTotal - cpPtTotal // 未被BD记录在内的总Pt
    //console.log(maxPts,cooperationPtTotal,cpPtTotal)
    // 1. 前排通常不会这么快清CP
    // 2. 通常BD后期稳定CP记录的时候，t10排名基本稳定了
    // 这里暂时使用已有数据协力次数与清CP次数之比来处理未被BD记录在内的数据。

    // 记录当前有数据的协力与清cp的比例
    /*
     这里最开始的想法是记录所有的清CP/协力的比例，但是考虑到有些人一开始有一段时间没有在清CP
     又有一些人是是后期清CP冲上来的，因此还是考虑
     1. 取最后一次-1往后300条数据进行计算，计算ratio
     2. 
    */    let avgClearCpPts = cpCounts==0?0:Math.round(cpPtTotal / cpCounts)  // 平均清CP所用的PT
           let cp_clear_value = 0  // 确定清cp挡位
            if (avgClearCpPts >= cp1600){
                cp_clear_value = 1600
            }else if (avgClearCpPts >= cp800){
                cp_clear_value = 800
            }
            else if (avgClearCpPts >= cp400){
                cp_clear_value = 400
            }
            else{
                cp_clear_value = 200
            }
    let cooperationRatio = f100CooeprCounts / ( f100CpCounts +f100CooeprCounts)
    let cpRatio = f100CpCounts / ( f100CpCounts +f100CooeprCounts)
    // 这里如果cooperationRatio < 0.7,则明显是不对的
    if (cooperationRatio < 0.7){
        /*
        // 我们就预估他CP收支是平很的
        console.log(cp_clear_value)
        let cor = cooperationCounts == 0?0:Math.round(cooperationPtTotal / cooperationCounts)   // 协力获得的PT
        let cpr = cpCounts==0?0:Math.round(cpPtTotal / cpCounts)    // 清CP获得的pt
        /*
            则我们可以得到以下方程
           var cpcor = cpr / cor
           ptsTotalUnRecord = cor x + cpr y


        
       let t1 = (cor / 20) / cp_clear_value // t1: 
       let x = ptsTotalUnRecord / ((cpr*t1) + cor)   // 协力次数，x
       let y = ((cor / 20) * x) / cp_clear_value // 清CP次数，y
       console.log(x,y,cor,cpr)
    cpRatio = y/(x+y)
    cooperationRatio = x/(x+y)
    */
       cpRatio = 0.11    // 当无法推断出他的清CP比例的时候我们就假设他前面清了10% CP
        cooperationRatio = 1-cpRatio
    }
    //console.log('cpRatio:',cpRatio,' cooperationRatio' , cooperationRatio)


    // 根据avg推算清cp挡位
    // 预估现有CP = 协力获得的CP - CP次数*CP挡位
    let unRecordCooperationPts = Math.floor(ptsTotalUnRecord * cooperationRatio)    // 未记录的预估总协力Pt数
    let unRecordCpPts = Math.floor(ptsTotalUnRecord * cpRatio)                         // 未记录的预估总清CP Pt数
   
    //console.log('unRecordCooperationPts',unRecordCooperationPts,'unRecordCpPts',unRecordCpPts)
    let unRecordCooperationCounts = cooperationAvgPt == 0?0:Math.floor(unRecordCooperationPts / cooperationAvgPt)   //未记录的预估总协力次数
    let unRecordPendingCpValue =  Math.floor(unRecordCooperationPts / 20)//维基路的预估通过协力获得的Cp数量
    let unRecordClearCpCounts =  avgClearCpPts == 0 ?0:Math.floor(unRecordCpPts / avgClearCpPts)// 预估未记录的已经清CP的次数
    //console.log(unRecordCpPts,avgClearCpPts)s
    let unRecordUnClearCpCounts =  avgClearCpPts == 0 ?0:Math.floor(unRecordCooperationPts / avgClearCpPts) - unRecordClearCpCounts// 预估未记录的未清CP次数


    let unRecordCurrentCpValues = unRecordPendingCpValue - (unRecordClearCpCounts * cp_clear_value)
    /*
    if (currentCps + unRecordCurrentCpValues <0){   // 如果剩余CP小于0则全用于协力
        unRecordCpPts = 0
        unRecordCooperationPts =  Math.floor(ptsTotalUnRecord * cooperationRatio) 
        unRecordCooperationCounts = Math.floor(unRecordCooperationPts / cooperationAvgPt)
        unRecordCurrentCpValues = ptsTotalUnRecord / 20
        unRecordClearCpCounts = 0
    }
        */
    console.log(cooperationCounts,unRecordCooperationCounts)
    cpTraceList.push(drawListMerge([await drawList({ text: `估算协力次数`}), await drawList({ text: `${cooperationCounts + unRecordCooperationCounts}`})]))// 记录的次数+估计的次数
    cpTraceList.push(line)
    cpTraceList.push(drawListMerge([await drawList({ text: `估算协力获得的CP`}), await drawList({ text: `${Math.round(cooperationToCpsTotal) + Math.round(unRecordCooperationPts / 20)}`})])) // 记录的CP+未记录的Pt转CP 
    cpTraceList.push(line)
    //console.log(cooperationToCpsTotal,unRecordCooperationPts)
    cpTraceList.push(drawListMerge([await drawList({ text: `把均Pt(协力/CP)`}), await drawList({ text: `${cooperationCounts == 0?0:Math.round(cooperationPtTotal / cooperationCounts)} / ${cpCounts==0?0:Math.round(cpPtTotal / cpCounts)}`})]))   // 真实数据
    cpTraceList.push(line)
    cpTraceList.push(drawListMerge([await drawList({ text: `把均Pt(近50把)`}), await drawList({ text: `${cooperationCountsLast50 == 0?0:Math.round(cooperationPtTotalLast50 / cooperationCountsLast50)} / ${cpCountsLast50==0?0:Math.round(cpPtTotalLast50 / cpCountsLast50)}`})]))    // 真实数据
    cpTraceList.push(line)
    cpTraceList.push(drawListMerge([await drawList({ text: `估算清CP次数`}), await drawList({ text: `${cpCounts + unRecordClearCpCounts}`})])) // 记录的次数+预估的次数
    console.log(cpCounts,unRecordClearCpCounts)
    cpTraceList.push(line)
    cpTraceList.push(drawListMerge([await drawList({ text: `估算现有CP`}), await drawList({ text: `${Math.round(currentCps + unRecordCurrentCpValues)}`})]))  // 
    //console.log(currentCps,unRecordCurrentCpValues)
    cpTraceList.push(line)
    all.push(await drawDatablock({ list:cpTraceList, topLeftText: `CP估算 (Beta)`}))
    let cpTraceDebugFlags = false
            if (cpTraceDebugFlags){
    console.log('记录内协力次数：',cooperationCounts ,' 缺失数据的协力次数（估计）',unRecordCooperationCounts)
    console.log('记录内协力获得的CP',cooperationToCpsTotal ,' 缺失数据的协力获得CP点数（预估）',Math.round(unRecordCooperationPts / 20))
    console.log('把均Pt(协力/CP)',`${cooperationPtTotal / cooperationCounts}/${cpPtTotal / cpCounts}`)
    console.log('把均Pt(近50把)',`${cooperationPtTotalLast50 / cooperationCountsLast50}/${cpPtTotalLast50 / cpCountsLast50}`)
    console.log('记录内清CP次数 ',cpCounts,' 缺失数据的清CP次数（预估）',unRecordClearCpCounts)
    console.log('记录内现有CP ',currentCps,'缺失数据的清CP次数（预估）',unRecordCurrentCpValues)
    console.log('现有记录协力 / 清CP次数 ',cooperationCounts,' / ',cpCounts)
    console.log('3火协力/CP200 基准估算：',cooperationAvgPt)
    console.log('平均清CP获得的PT / 当前已有数据CP Value / 当前已有数据CP数量',avgClearCpPts,cpPtTotal,cpCounts)
    console.log('f100CpCounts：',f100CpCounts,'f100CooeprCounts',f100CooeprCounts)
            }
        }
    //近期统计数据
    const timeList = [1, 3, 12, 24]
    {
        const list = [], now = Date.now()
        list.push(drawListMerge([await drawList({ key: '时间' }), await drawList({ key: '分数变动次数' }), await drawList({ key: '平均时间间隔' }), await drawList({ key: '平均分数' })], widthMax))
        for (const a of timeList) {
            const begin = now - a * 60 * 60 * 1000
            const st = new Date(begin), ed = new Date(now)
            const timeImage = await drawList({ text: `${st.toTimeString().slice(0, 5)}~${ed.toTimeString().slice(0, 5)}`})
            const offset = Math.floor((now / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60) - Math.floor((begin / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60)
            // console.log(st.getTimezoneOffset())
            if (offset > 0) {
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`-${offset}`, 30, 13)
            }
            let flag = 0, count = 0, sumScore = 0, timestamps = []
            for (let i = 0; i + 1 < playerRating.length; i += 1) {
                if (playerRating[i + 1].value == -1) {
                    flag = 1
                    break
                }
                if (playerRating[i].value != playerRating[i + 1].value) {
                    timestamps.push(playerRating[i].time)
                    if (playerRating[i + 1].time < begin)
                        break
                    count += 1
                    sumScore += playerRating[i].value - playerRating[i + 1].value
                }
                if (playerRating[i + 1].time < begin)
                    break
            }
            if (flag) {
                list.push(drawListMerge([timeImage, await drawList({ text: '数据不足' })], widthMax))
            }
            else {
                const averageTime = getAverageTime(timestamps)
                list.push(drawListMerge([timeImage, await drawList({ text: `${count}` }), await drawList({ text: timestamps.length <= 1 ? '-' : `${(new Date(averageTime)).toTimeString().slice(3, 8)}` }), await drawList({ text: count == 0 ? '-' : `${Math.floor(sumScore / count)}` })], widthMax))
            }
            list.push(line)
        }
        list.pop()
        all.push(await drawDatablock({ list, topLeftText: `近期统计数据`}))
    }
    all.push(await drawEventDatablock(new Event(eventId), [mainServer]))
    // list.push(new Canvas(800, 50))

    // //折线图
    // list.push(await drawCutoffEventTopChart(cutoffEventTop, false, mainServer))

    // var listImage = drawDatablock({ list });
    // all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateSpeedRank(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    console.log(eventId)
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    /*
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    */
    if (playerId < 1 ){    // 如果不等于114514就返回缓存。缓存每隔5分钟刷新一次
        if (TopRateSpeed) return TopRateSpeed   // 如果缓存不存在就走正常获取流程
    }
    let subTimeTips = (playerId==2)?'上个时段统计':'即刻统计'
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    let pId = playerId

    //var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    var userInRankings = cutoffEventTop.getLatestRanking(); // 前十当前排名，其中包含UID跟Point
    var rank = []   // 分数
    var rankBetween = []    // 前后两个分差
    var rankBetweenLastTick = [] //前后两个时刻分数变化
    var rankChangeCount = [] // 分数变动次数
    var avgRankChange = [] // 把均pt
    var rankForBetween = []
    var userName = []
    var prevNull = []   // 前空白
    var nextNull = []   // 尾空白
    

    var thisHour = cutoffEventTop.points[cutoffEventTop.points.length -1].time
    
    var LastHour = thisHour - 3600000
    var LastHourInCutoffT10 = 0
    for(let i = cutoffEventTop.points.length -1;i>0;i--){   // 找出LastHour的上一个时间点
        if (cutoffEventTop.points[i].time < LastHour){
            //console.log(cutoffEventTop.points[i].time,LastHour)
            LastHourInCutoffT10 = cutoffEventTop.points[i].time
            break
        }
    }
    LastHour = LastHourInCutoffT10
    //LastHour = thisHour - 3600000
    //console.log(LastHour)
    // thisHour是当前小时如16:37就返回16:00
    // LastHour是上一个小时，到时候就只要取这几个区间的就好
    //console.log(userInRankings)
    var sortUidList = []
    for (let i = 0; i < userInRankings.length; i++) {
        

        playerId = userInRankings[i].uid
        sortUidList.push(playerId)
        var user = cutoffEventTop.getUserByUid(playerId);
        userName.push(user.name)
          // 玩家当前时刻分数
          rank.push(userInRankings[i].point)
        let countChange = 0
        let lastScore = 0
        let nowScore = 0
        var isFirst = true
        const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照时间段排的分数，最高返回最近400次的变化分数，从最近到最远。
        //console.log( playerRating.length)

        for (let j = 0; j  < playerRating.length; j += 1) {
            if (playerRating[j ].value == -1) {
                break
            }
            //console.log(playerRating[j].time)
            if (playerRating[j].time >thisHour) continue
            if (playerRating[j].time <LastHour) {
                lastScore = playerRating[j].value
                break
            }
            if(isFirst) {
                nowScore = playerRating[j].value
                //
                rank[i] = nowScore  // 玩家状态将会显示
                //rank.push(nowScore)
                isFirst = false
            }
            if (playerRating[j].value != playerRating[j + 1].value) {
                countChange ++
                lastScore = playerRating[j].value
            }
        }
        //console.log(new Date(LastHour).getHours(),new Date(LastHour).getMinutes(),new Date(LastHour).getSeconds())
        // 前后空白
        let tmpScore = playerRating[0].value == -1?0:playerRating[0].value
        let tmpTime = thisHour
        let isPrev = false
        let pushPrev = false
        let pushNext = false
        let prevNextInListTime = 1000
        for (let j = 0; j  < playerRating.length; j += 1) {
            if (pushPrev) break
            if (!isPrev){   //计算尾空白
                
                if (playerRating[j].value!= tmpScore){      // 尾空白大于3600喵置0
                    if ((playerRating[j].time - tmpTime) <= -3600000) {
                        isPrev = true
                        nextNull.push(1/0)
                        pushNext = true
                        break
                    }else{
                        //nextNull.push(playerRating[j].time - tmpTime + 60000)
                        nextNull.push(Math.round((playerRating[j].time - tmpTime +60000) / (60000)))
                        isPrev = true
                        pushNext = true
                    }
                }
            }
            if (isPrev){
                if (playerRating[j].time >=LastHour && playerRating[j].value!= tmpScore){
                    tmpScore = playerRating[j].value
                    tmpTime = playerRating[j].time
                }
                if (playerRating[j].time <LastHour){
                    if (playerRating[j].value!= tmpScore){
                        if (Math.round((tmpTime - LastHour) / (60000)) <= 30){
                            prevNull.push(Math.round((tmpTime - LastHour +60000) / (60000)))
                            pushPrev = true
                            //console.log((Math.round((tmpTime - LastHour+60000) / (60000))),nextNull.at(-1))
                        } 
                        else{
                            prevNull.push(1/0)
                            pushPrev = true
                            //console.log(1/0,nextNull.at(-1))
                        }

                    }
                }
            }
        }
        if (!pushPrev) prevNull.push(1/0)
        if (!pushNext) nextNull.push(1/0)
        
        //rankBetweenLastTick.push()
        rankChangeCount.push(countChange)   // 分数变动次数

        if(lastScore >0 ){
            rankBetweenLastTick.push(nowScore - lastScore)// 与上一时刻相比相差了多少
        }else{
            rankBetweenLastTick.push(0)
        }
       // console.log((nowScore-lastScore) / countChange==0?1:countChange)
        avgRankChange.push(countChange==0?0:Math.round((nowScore-lastScore) / countChange))    // 把均Pt
        if (i == 0) {
            rankBetween.push(0)
        }
        else rankBetween.push(rank[i-1] - nowScore  )  // 与上一名的分数差距
    }


    for (let h = 0; h < rankBetweenLastTick.length; h++) {
        let rank = 1;
        for (let g = 0; g < rankBetweenLastTick.length; g++) {
            if (rankBetweenLastTick[g] > rankBetweenLastTick[h]) rank++;
        }
        rankForBetween.push(rank);
    }

    // 判断是否在同一房间内
    // 基本思路：抽取出同一时间value的人，数据越多越纯。
    // [[1,2,3,4,5,6,8],[7,9]],[[1,2,3,4,5],[6,8],[7,9]]
    // 就可以判断得出，[1,2,3,4,5]在同一辆车上,[6,8]在同一辆车上,[7,9]在同一辆车上
    let possibleAtSameRoom = []
    let tempArr1 = []
    let tempArr2 = []
    try{
        var pureData = []
        for(let pd of cutoffEventTop.points){
            if (pd.time >= LastHour && pd.time <=thisHour){
                pureData.push(pd)
            } 
        }
        var timeList = [];  // 一共有多少个time（采集点）
        for (let pd of pureData){
            if (!timeList.includes(pd.time)) timeList.push(pd.time)
        }
        // 获取uid
        var uidList = []
        for (let pd of pureData){
            if (!uidList.includes(pd.uid)) uidList.push(pd.uid)
        }
        // 获取到采集点之后，开始对比采集点之间的不同
        var timeListIndex = 0;
        var valueChangeData = []
        // 将每一次采集点之间的变动情况进行记录
        for (let t = 0;t<timeList.length;t++){  // 便利timeList 。 t为timeList的Index
            let tempData1 = []
            let tempData2 = []
            for(let pd of pureData){
                if (pd.time == timeList[t]) tempData1.push(pd)
                if (pd.time == timeList[t+1]) tempData2.push(pd)
            }
            let valueChangeUid = []
            for(let tIndex1 = 0;tIndex1<tempData1.length;tIndex1++){
                for(let tIndex2 = 0;tIndex2<tempData2.length;tIndex2++){
                    if (tempData1[tIndex1].uid == tempData2[tIndex2].uid  && tempData1[tIndex1].value != tempData2[tIndex2].value) {
                        valueChangeUid.push(tempData1[tIndex1].uid)
                    }
                }
            }
            valueChangeData.push(valueChangeUid)
        }
        possibleAtSameRoom =  inferPossibleRoomsByScoreChange(valueChangeData,sortUidList)
    }
    catch{
        // TODO: 在房间出现变动的时候使用较多数据的一个房间进行判断。（已完成）
    }
    var all = [];
    
    all.push(await drawTitle('T10时速排名', `${serverNameFullList[mainServer]} ${subTimeTips}`));
    var list = [], imageList = []
    const widthMax = 200+300+420+250+275+300+300+300+200 + 200+200+200
    var timeTips = `统计时段：${changeTimefomant(LastHour)} - ${changeTimefomant(thisHour)}`
    
    list.push(drawListMergeMin([await drawList({ key: '排名' ,maxWidth:200}), await drawList({ key: 'UID',maxWidth:300 }), await drawList({ key: '昵称' ,maxWidth: 420}), await drawList({ key: pId==2?'统计时分数':'分数',maxWidth:275 })

    ,await drawList({ key: '上下分差',maxWidth:250 }),await drawList({ key: '1小时内分差',maxWidth:300 }),await drawList({ key: '速度排名',maxWidth:300 }),await drawList({ key: '分数变动次数',maxWidth:300 }),
    await drawList({ key: '把均PT' ,maxWidth:200}),await drawList({ key: '前空白' ,maxWidth:200}),await drawList({ key: '尾空白' ,maxWidth:200}),await drawList({ key: '猜房间' ,maxWidth:200})]))
    const FullLine: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 15,
        startY: 15,
        endX: widthMax,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    list.push(FullLine)
    for(let k = 0;k<10;k++){
        //console.log(`${k+1}   ${userInRankings[k].uid}   ${rank[k]}   ${rankBetween[k]}   ${rankBetweenLastTick[k]}   ${rankChangeCount[k]}   ${avgRankChange[k]}`)
        imageList.push(drawListMergeMin([
            await drawList({ key: `${k+1}`,maxWidth:200}),
            await drawList({ key: `${userInRankings[k].uid}`,maxWidth:300}),
            await drawList({ key: `${userName[k]}`,maxWidth:420}),
            await drawList({ key: `${rank[k]}`,maxWidth:275}),
            await drawList({ key: `${rankBetween[k]}`,maxWidth:250}),
            await drawList({ key: `${rankBetweenLastTick[k]}`,maxWidth:300}),
            await drawList({ key: `${rankForBetween[k]}`,maxWidth:300}),
            await drawList({ key: `${rankChangeCount[k]}`,maxWidth:300}),
            await drawList({ key: `${avgRankChange[k]}`,maxWidth:200}),
            await drawList({ key: `${isFinite(prevNull[k])?prevNull[k]:'--'}min`,maxWidth:200}),
            await drawList({ key: `${isFinite(nextNull[k])?nextNull[k]:'--'}min`,maxWidth:200}),
            await drawList({key:`${getPossibleRoom(possibleAtSameRoom,userInRankings[k].uid)}`,maxWidth:200})
        ]))
        imageList.push(FullLine)
    }
    list.push(...imageList)
    all.push(await drawDatablock({ list}))
    all.push(await drawTips({text:timeTips + '\n仅在T10用户一直保持在一个房间，猜房间数据才具有可信度',maxWidth:widthMax}))
    //all.push(...list)
    all.push(await drawEventDatablockPromise)
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateSleep(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    /*
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    */


    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    if(!playerId){
        var userInRankings = cutoffEventTop.getLatestRanking();
        playerId = userInRankings[tier-1].uid
        console.log(playerId)
    }
    var all = [];
    var breakTime = 1490000 // 如果间隔相差25min则认定为休息
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照最近到最远排名
    // console.log(playerId)
   // console.log(playerRating)
    var breakTimeSt = [];
    var breakTimeEd = [];
    var StIndex = playerRating.length-1;
    var tempScore =  playerRating[StIndex].value;
    var allCount = 0;
    if (playerRating.length <3) return ['数据唔够Bot统计喔']
    for (var i =playerRating.length-1;i>0;i--){
        if (playerRating[i].value != tempScore){  //如果分数不一样了,那就读取上一个一样的数据。因为是倒过来，所以i-1意味着比i时间要大的记录。
            if ((playerRating[i-1].time - playerRating[StIndex].time) > breakTime){   // 如果前后间隔大于设定的休息时间，这两段之间是休息的
                breakTimeSt.push(playerRating[StIndex].time)    //push开始的时间
                breakTimeEd.push(playerRating[i-1].time)    // push 不一样的上一个时间
                StIndex = i
                tempScore = playerRating[i].value
                allCount++
            }
            else{   // 如果不算是休息，则更新StIndex及tempScore方便下一次计算
                StIndex = i
                tempScore = playerRating[i].value
            }
        }
        else if(i == 1){    //一直处于暂停中
           // console.log(i)
            //console.log(playerRating[StIndex].time,playerRating[i-1].time)
            breakTimeSt.push(playerRating[StIndex].time)    //push开始的时间
            breakTimeEd.push(playerRating[i-1].time)    // push 不一样的上一个时间
            allCount++
        }

    }

    var all = [];

    all.push(await drawTitle('查停摆', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        // var event = new Event(eventId);
        // all.push(await drawEventDatablock(event, [mainServer]));
        //名片
        var widthMax = 420+420+270
        var userInRankings = cutoffEventTop.getLatestRanking();
        var drawPlayerRankingInListPromise1 = []
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer,widthMax))
            /*
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);

            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
            */
        }
        var drawPlayerRankingInListResult1 = await Promise.all(drawPlayerRankingInListPromise1)
        for(var r of drawPlayerRankingInListResult1){
            if (r != undefined) {
              list.push(r);
            }
        }

        if (list.length > 0) {
            all.push(await drawDatablock({ list, maxWidth: 400+400+200+200+250 }))
        }
        else 
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
  
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(cutoffEventTop, false, mainServer,playerId,widthMax,900).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    var list = [], imageList = []
    //下面是ai生成的
// 分割线

const FullLine2: Canvas = drawDottedLine({
    width: widthMax,
    height: 30,
    startX: 15,
    startY: 15,
    endX: widthMax,
    endY: 15,
    radius: 2,
    gap: 10,
    color: "#a8a8a8"
})

list.push(drawListMergeMin([
    await drawList({ key: '开始时间', maxWidth: 420 }),
    await drawList({ key: '结束时间', maxWidth: 420 }),
    await drawList({ key: '停摆时长', maxWidth: 270 }),
]))
list.push(FullLine2)
// 数据行
for (let j = allCount> 10? allCount -10 : 0; j < allCount; j++) {    // 人工注：只允许查后10

    


    imageList.push(drawListMergeMin([
        await drawList({ key: `${changeTimefomant(breakTimeSt[j])}`, maxWidth: 420 }),
        await drawList({ key: `${changeTimefomant(breakTimeEd[j])}`, maxWidth: 420 }),
        await drawList({ key: `${changeTimePeriodFormat(breakTimeEd[j] - breakTimeSt[j],false)}`, maxWidth: 270 }),
    ]))

    imageList.push(FullLine2)
}
list.push(...imageList)
list.push(await drawCutoffEventTopChartPromise)
all.push(await drawDatablock({ list}))
    all.push(await drawEventDatablockPromise)

    /*
    for(var j = 0;j<allCount;j++){
        console.log(`${changeTimeSt[j]} - ${changeTimeEd[j]}  ${changeTimeCounts[j]}  ${changeTimeTotalPts[j]}`)
    }
    */
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })
    return [buffer]

    for(var j = 0;j<allCount;j++){
        console.log(`${breakTimeSt[j]} - ${breakTimeEd[j]} `)
    }
    return ['Check Console']
}

export async function drawTopRateChanged(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);

    /*
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    */
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    if(playerId == undefined){
        var userInRankings = cutoffEventTop.getLatestRanking();
        playerId = userInRankings[tier-1].uid
    }
    //console.log(playerId)
    var all = [];
    var breakTime = 1500000 // 如果间隔相差15min则认定为休息
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照最近到最远排名
    var changeTimeSt = [];
    var changeTimeEd = [];
    var changeTimeTotalPts = [];    // 总Pts
    var changeTimeCounts = [];  // 把均Pt
    var allCount = 0

/*
1. PlayRating中途会有-1的存在，先将-1的处理完毕
2. 从高到低排Pt
3. 重复的要特殊标记
*/
    var fixPlayerRating = []
    var oldValue = 0;
    var oldTime =0;
    for(var i = playerRating.length-1;i>0;i--){   //从尾倒回头,[i-1]永远要比[i]分数高,反向读取进fixPlayerRating
        if (playerRating[i].value == -1) {
        if(fixPlayerRating.length>0) fixPlayerRating[fixPlayerRating.length-1].isContinuous =false
        continue}
        var isContinuousStatus = false
        
        if(playerRating[i].value == oldValue) {
         if (playerRating[i-1].time-playerRating[i].time > breakTime) fixPlayerRating[fixPlayerRating.length-1].isContinuous =false
        continue
        }
        if(playerRating[i].value == playerRating[i-1].value)  isContinuousStatus = true
        oldValue = playerRating[i].value
        fixPlayerRating.push({time:playerRating[i].time,value:playerRating[i].value,isContinuous:isContinuousStatus,part:0})
    }
    // 这样处理完毕后，fixPlayerRating中就不会存在相同的value，以及value为-1的参数
    // 接下来开始处理fixPlayerRating，此时fixPlayerRating已经是从低到高排序了
    var tempSt = 0
    var tempEt = 0
    var isProcessing = false// 判定当前是新段还是旧段处理中
    var totalCount = 0
    var totalPts = 0
    var partIndex =0
    for(var i  = 1;i<fixPlayerRating.length;i++){

        if (fixPlayerRating[i].time-fixPlayerRating[i-1].time>=breakTime ){
            partIndex++
        }

        fixPlayerRating[i].part = partIndex
    }
    var partIndexRuntime = -1
    var  statusOKIndex = 2
    for(var i = 1;i<fixPlayerRating.length;i++){
        if(fixPlayerRating[i].time - fixPlayerRating[i-1] < breakTime) {    // 寻昭可以开始计算的Index
            statusOKIndex = i
            break
        }
    }
    
    for(var i  = statusOKIndex;i<fixPlayerRating.length;i++){ // 从第四个开始，因为第一个通常不准。
        if (partIndexRuntime == -1){    // 初始状态，初始化
            totalCount++
            tempSt =fixPlayerRating[i].time
            tempEt =fixPlayerRating[i].time
            //allCount++
            totalPts +=(fixPlayerRating[i].value - fixPlayerRating[i-1].value)
            partIndexRuntime=fixPlayerRating[i].part
            continue
         }
        if (fixPlayerRating[i].part>partIndexRuntime){//结束了上一轮但是由于上一轮没有统计分数，因此在这里统计
            allCount++
            //totalCount++
            //totalPts +=fixPlayerRating[i].value - fixPlayerRating[i-1].value
            if (tempSt == tempEt) tempSt -=(2*1000*60)
            changeTimeSt.push(tempSt)
            changeTimeEd.push(tempEt)
            changeTimeCounts.push(totalCount)
            changeTimeTotalPts.push(totalPts)
            totalCount=0
            tempEt=0
            tempSt=fixPlayerRating[i].time
            totalPts=0
            partIndexRuntime =fixPlayerRating[i].part   // 标记最新的Part
         }


        if (fixPlayerRating[i].part==partIndexRuntime){ 
            if (fixPlayerRating[i-1].isContinuous && fixPlayerRating[i-1].part!=partIndexRuntime){ // 如果上一个part跟这个part不一样，即新分段，如果是连续的 
                totalCount++
                tempEt =fixPlayerRating[i].time
                totalPts +=fixPlayerRating[i].value - fixPlayerRating[i-1].value    // 这里要注意，
            }
            if (fixPlayerRating[i-1].part==partIndexRuntime){   // 如果是连续的一段
                totalCount++
                tempEt =fixPlayerRating[i].time
                totalPts +=fixPlayerRating[i].value - fixPlayerRating[i-1].value    // 这里要注意，
            }
            tempEt =fixPlayerRating[i].time
            //如果上一段不标记连续，则是新的开始，跳过
         }
         if (i == fixPlayerRating.length-1){//处理最后一个分数
            allCount++
            if (tempSt == tempEt) tempSt -=(2*1000*60)
            changeTimeSt.push(tempSt)
            changeTimeEd.push(tempEt)
            changeTimeCounts.push(totalCount)
            changeTimeTotalPts.push(totalPts)
         }
    }
    var all = [];
    var widthMax = 420+420+200+200+250
    all.push(await drawTitle('查变动', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        // var event = new Event(eventId);
        // all.push(await drawEventDatablock(event, [mainServer]));
        //名片
        var userInRankings = cutoffEventTop.getLatestRanking();
        var drawPlayerRankingInListPromise1 = []
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer,widthMax))
            /*
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);

            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
            */
        }
        var drawPlayerRankingInListResult1 = await Promise.all(drawPlayerRankingInListPromise1)
        for(var r of drawPlayerRankingInListResult1){
            if (r != undefined) {
              list.push(r);
            }
        }

        if (list.length > 0) {
            all.push(await drawDatablock({ list, maxWidth: 400+400+200+200+250 }))
        }
        else 
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    var list = [], imageList = []
    
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(cutoffEventTop, false, mainServer,playerId,widthMax,900).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    //下面部分是ai生成的
// 分割线

const FullLine2: Canvas = drawDottedLine({
    width: widthMax,
    height: 30,
    startX: 15,
    startY: 15,
    endX: widthMax,
    endY: 15,
    radius: 2,
    gap: 10,
    color: "#a8a8a8"
})

list.push(drawListMergeMin([
    await drawList({ key: '开始时间', maxWidth: 420 }),
    await drawList({ key: '结束时间', maxWidth: 420 }),
    await drawList({ key: '变动次数', maxWidth: 200 }),
    await drawList({ key: '把均Pt', maxWidth: 200 }),
    await drawList({ key: '总变动Pt', maxWidth: 250 }),
]))
list.push(FullLine2)
// 数据行
var totalTimes = 0
for(let h = 0;h<allCount;h++){
    totalTimes +=(changeTimeEd[h] - changeTimeSt[h])
}
for (let j = allCount> 100? allCount -100 : 0; j < allCount; j++) {    // 人工注：只允许查后10

    // 把均Pt = 总变化Pt / 次数（避免除 0）
    const avgPt = changeTimeCounts[j] > 0 
        ? Math.floor(changeTimeTotalPts[j] / changeTimeCounts[j])
        : "0"
    imageList.push(drawListMergeMin([
        await drawList({ key: `${changeTimefomant(changeTimeSt[j])}`, maxWidth: 420 }),
        await drawList({ key: `${changeTimefomant(changeTimeEd[j])}`, maxWidth: 420 }),
        await drawList({ key: `${changeTimeCounts[j]}`, maxWidth: 200 }),
        await drawList({ key: `${avgPt}`, maxWidth: 200 }),
        await drawList({ key: `${changeTimeTotalPts[j]}`, maxWidth: 250 }),
    ]))

    imageList.push(FullLine2)
}
list.push(...imageList)
var eventNowTimestamp = Date.now() - event.startAt[mainServer]
var avgPerDayTimesPresent = totalTimes / eventNowTimestamp

var avePerDayTimes = Math.floor(86400000 * avgPerDayTimesPresent)
//console.log(eventNowTimestamp,avgPerDayTimesPresent,avePerDayTimes)

list.push(await drawList({ key: `有效数据内总计：${changeTimePeriodFormat(totalTimes,false)} | 平均每天：${changeTimePeriodFormat(avePerDayTimes,false)}`, maxWidth: 1250 }))
list.push(await drawCutoffEventTopChartPromise)
all.push(await drawDatablock({ list}))
    all.push(await drawEventDatablockPromise)
    /*
    for(var j = 0;j<allCount;j++){
        console.log(`${changeTimeSt[j]} - ${changeTimeEd[j]}  ${changeTimeCounts[j]}  ${changeTimeTotalPts[j]}`)
    }
    */
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })
    return [buffer]
}

export function getRatingByPlayer(points: Array<{
    time:number,
    uid:number,
    value:number
}>, playerId: number) {
    const map = {}
    for (const info of points) {
        if (map[info.time] == undefined)
            map[info.time] = -1
        if (info.uid == playerId)
            map[info.time] = info.value
    }
    const timestamp = Object.keys(map)
    return timestamp.sort((a, b) => parseInt(b) - parseInt(a)).map((t) => {
        return {
            time: parseInt(t),
            value: map[t]
        }
    })
}

export function getAverageTime(timestamps: Array<number>) {
    let res = 0
    for (let i = 0; i < timestamps.length >> 1; i += 1)
        res += timestamps[i]
    for (let i = timestamps.length + 1 >> 1; i < timestamps.length; i += 1)
        res -= timestamps[i]
    return res / (timestamps.length >> 1) / (timestamps.length + 1 >> 1)
}

function getPossibleRoom (data,uid){
    //return '无数据'
    if (!data) return '猜不透'
    try{
        for(let i = 0;i<data.length;i++){
            if (data[i].includes(uid)) return '房间' + String.fromCharCode(65 +i)
        }
        return '猜不透'
    }
    catch{
        return '猜不透'
    }

}
export function compareSameDataArray(arr1,arr2){       // 判断两个数组是否包含相同的数据
    if (arr1.length != arr2.length) return false
    var tempArr = []
    for (let i = 0;i<arr1.length;i++){
        if (!tempArr.includes(arr1[i])){
            tempArr.push(arr1[i])
            var count1 = 0  // 判断相同元素
            var count2 = 0
            for(var i1 of arr1){
                if (i1 === arr1[i] || isNaN(i1))  count1 ++
            }
            for (var j1 of arr2){
                if (j1 === arr1[i] || isNaN(j1))  count2 ++
            }
            if (count1 != count2)
                return false
        }
    }
    return true
}
// 猜房间
// 首先取出要猜UID（参数UID）出现变动时，跟着一起变的用户
// 然后对于整个小时数据而言，出现总数量相同，且变动数量相同的用户，则可以百分百确认时同一个房间的
// 对于变动稍有出入的用户来说，允许设置一定的偏移去应对可能出现的掉线等情况从而无法记录。
function inferPossibleRoomsByScoreChange(valueChangeData: number[][] = [],uidSort?: number[]){
    //console.log('test')
    //console.log(valueChangeData)
    var finalResultOut = []
    var uidTotalList: number[] = []
    var dupUid = []
    var totalChangeCount = 0    // 总变动次数，是否启用严格模式。处于严格模式下，只允许绝对确认
    const strictCount = 295
    const offsetRatioConfidence = 0.9  // 用于判断偏移以应对玩家中途掉线的情况，一般不要调整这个参数。
    const offsetCountConfidenceInCurrentUidChange = 2  // 用于判断偏移以应对玩家中途掉线的情况，一般不要调整这个参数。
    const offsetCountConfidenceTotalCount = 2  // 用于判断偏移以应对玩家中途掉线的情况，一般不要调整这个参数。
    const offsetCountDifferentCount = 2  // 用于判断偏移以应对玩家中途掉线的情况，一般不要调整这个参数。
    const minTogetherCount = 10    // 最小同房数量
    for(let t of valueChangeData){
        if (!uidSort){
            for(let t1 of t){
                if (!uidTotalList.includes(t1)) uidTotalList.push(t1)
            }
        }
        totalChangeCount += t.length
    }
    //console.log(totalChangeCount)
    const strictMode = totalChangeCount>=strictCount ?true:false
    if (uidSort) uidTotalList = uidSort
    for(let utl = 0;utl<uidTotalList.length;utl++){
        if (dupUid.includes(utl)) continue  // 掩耳盗铃，但是确实可以避免一些问题
        var finalResultIn = []
        var uid = uidTotalList[utl]
        //if (uid == 0) uid = 1000522880
        // 首先，将当前uid发生变动的提取出来
        var currentUidChange = []   // 这个array的length就是代表当前uid总变动次数
        for(let uidArray of valueChangeData){
            if (uidArray.includes(uid) && uidArray.length < 11) currentUidChange.push(uidArray)
        }
        var tempUidList = []    // 临时uidList，用于标记与当前查询uid分数一起变动的其他uid列表
        var tempUidListAppearCount = [] // 临时uidList中的uid在pointData中出现的总次数
        var tempUidListAppearCountInCurrentUidChange = [] // 临时uidList中的uid在currentUidChange中出现的总次数

        for(let uidArray of currentUidChange){  // 标记所有一同更改过的uid
            for(let uid2 of uidArray){
                if (!tempUidList.includes(uid2))tempUidList.push(uid2)
            }
        }
        for(let i =0;i<tempUidList.length;i++){ // 遍历tempUidList，将出现次数增加进入tempUidListAppearCount
            let appearCount = 0
            for(let uidArray of valueChangeData){
                if (uidArray.includes(tempUidList[i])) {
                    appearCount++
                }
            }
            tempUidListAppearCount.push(appearCount)
        }
        for(let i =0;i<tempUidList.length;i++){ // 遍历currentUidChange，将出现次数增加进入tempUidListAppearCount
            let appearCount = 0
            for(let uidArray of currentUidChange){
                if (uidArray.includes(tempUidList[i])) {
                    appearCount++
                }
            }
            tempUidListAppearCountInCurrentUidChange.push(appearCount)
        }
        var sureAtSameRoom = [] // 完全确认是在同一个房间的
        var possibleAtSameRoom = [] // 可能在同一个房间的Uid
        var possibleAtSameRoomRatio = [] // 可能在同一个房间的可能概率
        // 先把最有可能时同一个房间的uid加起来
        for(let i = 0;i<tempUidList.length;i++){    // 严格模式下。优先添加
            // 参数UID与待查UID占整个时段的变动次数，取大
            var largeCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?tempUidListAppearCount[i]:currentUidChange.length
            // 参数UID与待查UID占整个时段的变动次数，取小
            var smallCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCount[i]
            // 参数UID与待查UID占与 参数UID 一起变动 的变动次数，取大
            var largeCountInPart = (tempUidListAppearCountInCurrentUidChange[i] < currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
            // 参数UID与待查UID占与 参数UID 一起变动 的变动次数，取小
            var smallCountInPart = (tempUidListAppearCountInCurrentUidChange[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
            if (largeCountInTotal == smallCountInTotal && largeCountInPart == smallCountInPart && sureAtSameRoom.length <5 && !dupUid.includes(tempUidList[i])){
                sureAtSameRoom.push(tempUidList[i])     // 确认是在一个房间的   
            }
        }
        for(let i = 0;i<tempUidList.length;i++){
            if (sureAtSameRoom.includes(tempUidList[i]))continue
            if (sureAtSameRoom.length>=5)break
            if (strictMode)break
            // 参数UID与待查UID占整个时段的变动次数，取大
            var largeCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?tempUidListAppearCount[i]:currentUidChange.length
            // 参数UID与待查UID占整个时段的变动次数，取小
            var smallCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCount[i]
            // 参数UID与待查UID占与 参数UID 一起变动 的变动次数，取大
            var largeCountInPart = (tempUidListAppearCountInCurrentUidChange[i] < currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
            // 参数UID与待查UID占与 参数UID 一起变动 的变动次数，取小
            var smallCountInPart = (tempUidListAppearCountInCurrentUidChange[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
            if (smallCountInPart>= minTogetherCount && !dupUid.includes(tempUidList[i])){     // 房间数量小于5且最小同房次数>=3 总数Ratio>= offsetRatioConfidence
                // 假如参数uid因为掉线不与其他uid在一个房间，掉两把
                if (largeCountInPart == smallCountInPart && (smallCountInTotal /largeCountInTotal >= offsetRatioConfidence) ){  // 如果是完全一起变动，且总变动 小/大 >= offsetRatioConfidence。
                    possibleAtSameRoom.push(tempUidList[i])
                    possibleAtSameRoomRatio.push(smallCountInTotal /largeCountInTotal)
                }else if(smallCountInTotal == largeCountInTotal && (largeCountInPart - smallCountInPart <=  offsetCountConfidenceInCurrentUidChange)){  // 如果总变动一样，但是一起变动 大-小 <= offsetCountConfidenceInCurrentUidChange
                    possibleAtSameRoom.push(tempUidList[i])
                    possibleAtSameRoomRatio.push(smallCountInTotal /largeCountInTotal)
                }else if((largeCountInTotal  - smallCountInTotal) == (largeCountInPart - smallCountInPart) && (largeCountInPart - smallCountInPart) <= offsetCountConfidenceTotalCount){    // 如果总数差 = 变动差 且差值<=2 则可能在同一个房间
                    possibleAtSameRoom.push(tempUidList[i])
                    possibleAtSameRoomRatio.push(smallCountInTotal /largeCountInTotal)
                }else if((largeCountInTotal - smallCountInPart) <= offsetCountDifferentCount && (largeCountInPart - smallCountInPart) <= offsetCountDifferentCount){
                    possibleAtSameRoom.push(tempUidList[i])
                    possibleAtSameRoomRatio.push(smallCountInTotal /largeCountInTotal)
                }
            }
        }
        for(let f of sureAtSameRoom){
            if (finalResultIn.length <5){
                finalResultIn.push(f)
                dupUid.push(f)
            }
        }
        for(let f of possibleAtSameRoom){
            if (finalResultIn.length <5){
                finalResultIn.push(f)
                dupUid.push(f)
            }
        }
        if (finalResultIn.length != 0)finalResultOut.push(finalResultIn)
    }
    //console.log(finalResultOut)
    return finalResultOut
}