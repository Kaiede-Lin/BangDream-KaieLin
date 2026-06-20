import { parentPort, threadId,isMainThread  } from'worker_threads';
if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }

export function logger(type: string, message: any) {
    const requestTime = Date.now();
    // hh:mm:ss
    const timeString = new Date(requestTime).toString().split(' ')[4];
    console.log(`[${timeString}] [${type}] ${message}`);
}