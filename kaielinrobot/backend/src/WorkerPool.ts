import Piscina from 'piscina';
import path from 'path';
import { isMainThread } from 'worker_threads';

export const piscina = isMainThread?{
    drawList: new Piscina({ // draw song list
        filename: path.resolve(__dirname, './worker/drawSongList.worker.js'),
        minThreads: 1,
        maxThreads: 1,
        concurrentTasksPerWorker: 8,
        idleTimeout:0,
        execArgv:[]
        
    }),/*
    drawDetail: new Piscina({
        filename: path.resolve(__dirname, './worker/drawSongDetail.worker.js'),
        minThreads: 1,
        maxThreads: 4,
    })
    
   drawEventList: new Piscina({
    filename: path.resolve(__dirname, './worker/drawEventList.worker.js'),
    minThreads: 1,
    maxThreads: 1,
    concurrentTasksPerWorker: 1,
    
}),*/
}:null;
if (isMainThread && piscina) {
    piscina.drawList.on('message', (msg) => {
        if (msg.type === 'log') {
            console.log(`[drawList Worker ${msg.threadId}]`, ...msg.args);
        }
    });

    piscina.drawList.run({}, { name: 'initWorker' });
/*
    setInterval(() => {
        piscina.drawList.run({ warmup: true }, { name: 'warmup' });
    }, 15000);

*/
}