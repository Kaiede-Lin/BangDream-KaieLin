import { MongoClient } from 'mongodb';
import { Server } from '@/types/Server';
import { Event } from '@/types/Event';
import { difficultyColorList, Song } from '@/types/Song';
import { eventTypeList, playerDetail } from '@/teamBuilder/types';
import { logger } from '@/logger';

export class PlayerDB {
  private client: MongoClient;
  private db: any;
  private uri: string;
  private dbName: string;


  private enabled: boolean = false;

  constructor(uri: string, dbName: string) {
    if (process.env.LOCAL_DB !== 'true') {
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.uri = uri
    this.dbName = dbName
    this.client = new MongoClient(this.uri);
    this.db = this.client.db(this.dbName);
    this.connect().catch((err) => {
      console.log(`连接数据库失败 Error: ${err.message}`);
    });
  }

  private getCollection() {
    if (!this.enabled) throw new Error('MongoDB is disabled (LOCAL_DB != true)');
    return this.db.collection('players');
  }


  async connect(): Promise<void> {
    if (!this.enabled) throw new Error('MongoDB is disabled (LOCAL_DB != true)');
    var rebuildFlags = false
    if (this.client && this.db) {
      try {
        await this.client.db(this.dbName).command({ ping: 1 });
        return;
      } catch (e) {
        rebuildFlags = true
        logger('playerDB.ts','MongoDB Connection is lose,start to rebuild MongoDB Instance......');
      }
    }
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    if (rebuildFlags) logger('playerDB.ts','MongoDB Instance rebuild Successful.');
  }

  async init(playerId: number) {
    const key = playerId
    const data = new playerDetail(playerId)
    data.init()
    await this.getCollection().insertOne({ _id: key, ...data })
    return data;
  }
  async updCurrentEvent(playerId: number, server: Server, eventId: number) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    data.currentEvent = eventId
    if (!data.eventSongs[eventId]) {
      const event = new Event(eventId)
      if (eventTypeList.includes(event.eventType)) {
        var defaultServer = server
        if (!event.startAt[defaultServer]) {
            defaultServer = Server.jp
        }
        await event.initFull()
        const list = data.eventSongs[eventId] = []
        if (event.eventType != 'challenge') {
          for (var element of event.musics[defaultServer]) {
              const song = new Song(element.musicId)
              list.push({
                  songId: song.songId,
                  difficulty: song.getMaxMetaDiffId()
              })
          }
        }
        else {
          const song = new Song(event.musics[defaultServer][0].musicId)
          list.push({
            songId: song.songId,
            difficulty: song.getMaxMetaDiffId()
          })
        }
      }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  async resetSong(playerId: number, server: Server, eventId: number) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    delete data.eventSongs[eventId]
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return this.updCurrentEvent(playerId, server, eventId)
  }
  async updateSong(playerId: number, eventId: number, id: number, songId: number, difficulty: number) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    for (let i = 0; i < data.eventSongs[eventId].length; i += 1) {
      if (id >> i & 1) data.eventSongs[eventId][i] = { songId, difficulty }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  async addCard(playerId: number, list) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    for (const { id, illustTrainingStatus, limitBreakRank, skillLevel} of list) {
      data.cardList[id] = { illustTrainingStatus, limitBreakRank, skillLevel }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  async delCard(playerId: number, list) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    for (const id of list) {
      delete data.cardList[id]
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  
  async updateCharacterBouns(playerId: number, list) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    for (const { characterId, potential, characterTask} of list) {
      data.characterBouns[characterId] = { potential, characterTask}
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }

  async updateAreaItem(playerId: number, list) {
    await this.connect();
    var data: playerDetail = await this.getPlayer(playerId)
    for (const { id, level} of list) {
      data.areaItem[id] = { level }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }

  async getPlayer(playerId: number): Promise<playerDetail | null> {
    await this.connect();
    var data: playerDetail
    const res = await this.getCollection().findOne({ _id: playerId })
    if (res == null) {
      data = await this.init(playerId)
    }
    else {
      data = new playerDetail(playerId)
      data.init(await this.getCollection().findOne({ _id: playerId }))
    }
    return data;
  }
}