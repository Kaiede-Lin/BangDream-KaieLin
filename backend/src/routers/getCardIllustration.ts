import express from 'express';
import { body } from 'express-validator';
import { Card } from '@/types/Card';
import { isInteger, listToBase64 } from '@/routers/utils';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { getDoujinshiSayoHina } from './searchCard';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { drawCardList, matchCardList } from '@/view/cardList';
import { Server } from '@/types/Server';
import { piscina } from '@/WorkerPool';

const router = express.Router();

router.post('/',
  [
    // Define validation rules using express-validator
    body('cardId').isString(),
    body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
  ],
  middleware,
  async (req: Request, res: Response) => {

    const { cardId,fuzzySearchResult } = req.body;
    const cardText = cardId
    if (cardText && fuzzySearchResult) res.send(listToBase64(['text 与 fuzzySearchResult 不能同时存在']))
    try {
      // Ensure cardId is a valid number (no need to check isNaN again)
      const images = await commandGetCardIllustration(cardText || fuzzySearchResult);
      res.send(listToBase64(images));
    } catch (error) {
      console.log(error);
      res.status(500).send({ status: 'failed', data: '内部服务器错误' });
    }
  }
);

async function commandGetCardIllustration(cardText: string| FuzzySearchResult): Promise<Array<Buffer | string>> {
  //console.log(cardText)
  var after_training = null
  let fuzzySearchResult: FuzzySearchResult
  var cardId = 0
  if (typeof cardText === 'string'){
    if(cardText.includes('开花前') || cardText.includes('花前')){
      after_training = false
    }
    if(cardText.includes('开花后') || cardText.includes('花后')){
      after_training = true
    }
    let pureData = cardText.replace('开花前','').replace('花前','').replace('花后','').replace('开花后','')
    pureData = pureData.replace(/\s+/g, '')
    if (isInteger(pureData)){
      cardId = parseInt(pureData)
    }
    else{
       if(cardText.includes('开花前') || cardText.includes('花前')){
         after_training = false
       }
       if(cardText.includes('开花后') || cardText.includes('花后')){
         after_training = true
       }
       cardText = cardText.replace('开花前','').replace('花前','').replace('花后','').replace('开花后','')
       fuzzySearchResult = fuzzySearch(cardText)
       const tempCardList: Array<Card> = matchCardList(fuzzySearchResult,[Server.jp]);
       if (tempCardList.length == 0) {
           return [`没有搜索到符合条件的卡片`]
       }
       if (tempCardList.length == 1) {
           cardId = tempCardList[0].cardId
       }
       if (tempCardList.length > 1) {
           var result = await drawCardList(fuzzySearchResult, [Server.jp],true, true,after_training==null?true:after_training)
           if(result == null){
                 return (await piscina.drawList.run({
                         matches: fuzzySearchResult,
                         displayedServerList:[Server.jp],
                         useEasyBG:true,
                         compress:true,
                         after_training,
                         mainAPI:{}
                     },{name:'drawCardList'})).map(toBuffer)
           }
           else{
             return result
           }
       }
   }
}



  let card = new Card(cardId);

  if (!card.isExist) {
    return ['错误: 该卡不存在']
  }
  const trainingStatusList = card.getTrainingStatusList();
  let trainingStatusListLength;
  let index:number = after_training? (after_training==true?1:0) :0
  if (card.cardId === 947 || after_training == false) {
    trainingStatusListLength = 1;
  } else {
    trainingStatusListLength = trainingStatusList.length;
  }
  if (index >= trainingStatusListLength) index = 0
  const imageList = [];
  for (let i = index; i < trainingStatusListLength; i++) {
    const element = trainingStatusList[i];
    const illustration = await card.getCardIllustrationImageBuffer(element);
    // 直接添加插图到列表中，不需要绘制到Canvas
    imageList.push(illustration);
  }
  return imageList;
}
function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x);
    }
    return x; // string 或已是 Buffer
}
export { router as cardIllustrationRouter }
