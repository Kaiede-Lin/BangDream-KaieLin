process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});
import express from 'express';
import { gachaSimulateRouter } from '@/routers/gachaSimulate';
import { cardIllustrationRouter } from '@/routers/getCardIllustration';
import { roomListRouter } from '@/routers/roomList';
import { searchCardRouter } from '@/routers/searchCard';
import { searchCharacterRouter } from '@/routers/searchCharacter';
import { searchEventRouter } from '@/routers/searchEvent';
import { searchGachaRouter } from '@/routers/searchGacha';
import { searchPlayerRouter } from '@/routers/searchPlayer';
import { searchSongRouter } from '@/routers/searchSong';
import { songMetaRouter } from '@/routers/songMeta';
import { cutoffDetailRouter } from '@/routers/cutoffDetail';
import { cutoffListOfRecentEventRouter } from '@/routers/cutoffListOfEvent';
import { cutoffAllRouter } from '@/routers/cutoffAll';
import { cutoffSongRouter } from '@/routers/cutoffSong';
import { songChartRouter } from '@/routers/songChart'; 1
import { userRouter } from '@/routers/user'
import { stationRouter } from '@/routers/station'
import { eventPreviewRouter } from '@/routers/article/eventPreview'
import { eventReportRouter } from '@/routers/article/eventReport'
import { eventStageRouter } from '@/routers/eventStage'
import { songRandomRouter } from '@/routers/songRandom'
import { fuzzySearchRouter } from '@/routers/fuzzySearch'
import { topRateDetailRouter } from './routers/topRateDetail';
import { logger } from '@/logger'
import * as dotenv from 'dotenv';
import { canvasPool } from './image/text';
import { teamBuildDetailRouter } from '@/routers/teamBuildDetail'
import { calcResultRouter } from './routers/calcResult';
import { searchCompositionRouter } from '@/routers/searchComposition';


export var LagTimes:number
dotenv.config();


const app = express();

app.use(express.json());

app.use('/gachaSimulate', gachaSimulateRouter);
app.use('/getCardIllustration', cardIllustrationRouter);
app.use('/roomList', roomListRouter);
app.use('/searchCard', searchCardRouter);
app.use('/searchCharacter', searchCharacterRouter);
app.use('/searchEvent', searchEventRouter);
app.use('/searchGacha', searchGachaRouter);
app.use('/searchPlayer', searchPlayerRouter);
app.use('/searchSong', searchSongRouter);
app.use('/songMeta', songMetaRouter);
app.use('/songChart', songChartRouter);
app.use('/cutoffDetail', cutoffDetailRouter);
app.use('/cutoffListOfRecentEvent', cutoffListOfRecentEventRouter);
app.use('/cutoffAll', cutoffAllRouter);
app.use('/cutoffSong', cutoffSongRouter)
app.use('/eventStage', eventStageRouter)
app.use('/songRandom', songRandomRouter);
app.use('/fuzzySearch', fuzzySearchRouter);
app.use('/topRateDetail', topRateDetailRouter);
app.use('/searchComposition', searchCompositionRouter)
app.use('/teamBuildDetail', teamBuildDetailRouter);
app.use('/calcResult', calcResultRouter);


if (process.env.LOCAL_DB == 'true') {
    app.use('/user', userRouter);
    app.use('/station', stationRouter);
}
else {
    app.use('/user', (req, res) => {
        res.status(404).send({
            status: 'fail',
            data: '错误: 服务器未启用数据库'
        });
    });
    app.use('/station', (req, res) => {
        res.status(404).send({
            status: 'fail',
            data: '错误: 服务器未启用数据库'
        });
    });
}
if (process.env.ARTICLE == 'true') {
    app.use('/eventPreview', eventPreviewRouter);
    app.use('/eventReport', eventReportRouter);
}

const port: number = parseInt(process.env.BACKEND_PORT || '30000');

if (isNaN(port)) {
    logger('expressMainThread', 'port is not a number');
    process.exit(1);
}

//404
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

app.listen(port, () => {
    logger(`expressMainThread`, `listening on port ${port}`);
});
function measureLag(interval = 350) {
    
    let last = Date.now();
  
    setInterval(() => {
        //console.log('canvasPool池长度：' + canvasPool.length)
      const now = Date.now();
      const lag = now - last - interval;
      if (lag > 100) {
        LagTimes = lag
        logger('measureLag','High lag time detected! Current Lag time is:' + lag )
      }
      last = now;
    }, interval);
  }
  
  measureLag();