import { Canvas, loadImage } from 'skia-canvas'

import { Card } from '@/types/Card';
import { drawCardIcon } from '@/components/card';
import { drawDegree } from '@/components/degree';
import { Server } from '@/types/Server';
import { Degree } from '@/types/Degree';
import { drawText, releaseCanvas } from '@/image/text';
import { downloadFileCache } from '@/api/downloadFileCache';
import { Bestdoriurl } from "@/config"

interface User {
    uid: number,
    name: string,
    introduction: string,
    rank: number,
    sid: number,
    strained: number,
    degrees: number[]
    ranking: number,
    currentPt: number
}

export async function drawPlayerRankingInList(user: User, backgroudColor: string = 'white', server: Server,w:number=800,h:number=110): Promise<Canvas> {
    var canvas = new Canvas(w, h);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = backgroudColor;
    ctx.fillRect(0, 0, w, h);

    function removeBraces(text: string): string {
        var newText = text.replace(/\[[^\]]*\]/g, "");
        return newText;
    }

    //排名
    var rankingImage;
    if (user.ranking == undefined) {
        return;
    }
    var rankImageBuffer = null
    if (user.ranking > 0 && user.ranking <= 3) {
        rankImageBuffer = downloadFileCache(`${Bestdoriurl}/res/image/${Server[server]}_${user.ranking}.png`)
        //rankImageBufferPromise.push(downloadFileCache(`${Bestdoriurl}/res/image/${Server[server]}_${user.ranking}.png`))
        //rankingImage = await loadImage(rankImageBuffer);
        ///ctx.drawImage(rankingImage, 12, 45, 45, 21);
    }
    else {
        rankingImage = await drawText({
            text: '#' + user.ranking.toString(),
            textSize: 21,
            maxWidth: 100
        });
        ctx.drawImage(rankingImage, 12, 45);
  
    }

    //头像
    var headShotImage = drawCardIcon({
        card: new Card(user.sid),
        trainingStatus: user.strained == 0 ? false : true,
        cardIdVisible: false,
        skillTypeVisible: false,
        cardTypeVisible: false
    });


    //玩家昵称
    var playerNameImage = await drawText({
        text: removeBraces(user.name),
        textSize: 23,
        maxWidth: 450
    });

    var degreeImagePromise = []
    //牌子
    for (let i = 0; i < user.degrees.length; i++) {
        //var degreeImage = await drawDegree(new Degree(user.degrees[i]), server);
        degreeImagePromise.push(drawDegree(new Degree(user.degrees[i]), server))

    }
    var degreeImageResultAsync = Promise.all(degreeImagePromise)

    if (rankImageBuffer != null) ctx.drawImage(await loadImage(await rankImageBuffer), 12, 45, 45, 21);
    ctx.drawImage(await headShotImage, 85, 10, 90, 90);
    ctx.drawImage(playerNameImage, 210, 10);

    var degreeImageResult = await degreeImageResultAsync
    for (let i = 0; i < user.degrees.length; i++) {
        //var degreeImage = await drawDegree(new Degree(user.degrees[i]), server);
        //degreeImagePromise.push(drawDegree(new Degree(user.degrees[i]), server))
        var degreeImage = degreeImageResult[i]
        ctx.drawImage(degreeImage, 210 + (degreeImage.width / 2 + 10) * i, 46, degreeImage.width / 2, degreeImage.height / 2);
    }

    // ctx.drawImage(degreeImage, 210 + (degreeImage.width / 2 + 10) * i, 46, degreeImage.width / 2, degreeImage.height / 2);
    //简介
    var playerIntroductionImage = await drawText({
        text: removeBraces(user.introduction),
        textSize: 20,
        maxWidth: 450
    });
    ctx.drawImage(playerIntroductionImage, 210, 75);

    //等级
    var playerRankImage = await drawText({
        text: '等级 ' + user.rank.toString(),
        textSize: 23,
        maxWidth: 150
    });
    ctx.drawImage(playerRankImage, w-10 - playerRankImage.width, 10);

    //id
    var idImage = await drawText({
        text: '#' + user.uid,
        textSize: 20,
        maxWidth: 150
    });
    ctx.drawImage(idImage, w-10 - idImage.width, 45);


    //pt
    var ptImage = await drawText({
        text: user.currentPt.toString() + '分',
        textSize: 23,
        maxWidth: 150
    });
    
    ctx.drawImage(ptImage, w-10- ptImage.width, 70);


    return canvas;
}