import * as fs from 'fs';
import { fuzzySearchPath } from '@/config';
import { isInteger } from '@/routers/utils';
import { logger } from './logger';
import { parentPort, threadId, isMainThread } from 'worker_threads';
if (!isMainThread && parentPort) {
  loadConfig()
  console.log = (...args) => {
    parentPort.postMessage({
      type: 'log',
      threadId,
      args,
    });
  };
}
const isWorker = !isMainThread

interface FuzzySearchConfig {
  [type: string]: { [key: string]: (string | number)[] };
}

function loadConfig(): FuzzySearchConfig {
  const fileContent = fs.readFileSync(fuzzySearchPath, 'utf-8');
  logger('fuzzySearch', 'loaded fuzzy search config');
  return JSON.parse(fileContent);
}

export function manualLoadFuzzyConfig() {
  if (config!=undefined) config = loadConfig()
}

function extractLvNumber(str: string): number | null {
  const regex = /^lv(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

function extractNoteNumber(str: string): number | null {
  const regex = /^(?:nt|note)(?:s)?(\d+)$/i;
  const match = str.match(regex);
  console.log(str)
  if (match && match[1]) {
    console.log('Match'+match[1])
    return parseInt(match[1], 10);
    
  }

  return null;
}

function extractSkillNumber(str: string): number | null {
  const regex = /^(?:sk|skill)(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

export let config: FuzzySearchConfig = loadConfig();

export interface FuzzySearchResult {
  [key: string]: (string | number)[];
}

// 自定义验证函数
export function isFuzzySearchResult(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.values(value).every(
    (arr) =>
      Array.isArray(arr) &&
      arr.every((item) => typeof item === 'string' || typeof item === 'number')
  );
}

export function fuzzySearch(keyword: string): FuzzySearchResult {
  //兼容引号
  const keywordList = (keyword.match(/["“”『』「」]([^"“”『』「」]+)["“”『』「」]|\S+/g) || []).map(item =>
    item.replace(/^[\"“”『』「」]|[\"“”『』「」]$/g, '') // 去掉前后可能的中英文引号
  );

  console.log(keywordList)
  const matches: { [key: string]: (string | number)[] } = {};

  for (var keyword_org of keywordList) {
    let matched = false;
    let keyword = keyword_org.toLowerCase();

    if (!matches['_all']) {
      matches['_all'] = [keyword];
    }
    else {
      matches['_all'][0] += ' ' + keyword
    }

    if (isInteger(keyword)) {
      const num = parseInt(keyword, 10);
      if (!matches['_number']) {
        matches['_number'] = [];
      }
      matches['_number'].push(num);
      continue;
    }

    keyword = keyword.replace(/&gt;/g, '>');
    keyword = keyword.replace(/&lt;/g, '<');
    keyword = keyword.replace(/＞/g, '>');
    keyword = keyword.replace(/＜/g, '<');

    const lvNumber = extractLvNumber(keyword);
    if (lvNumber !== null) {
      if (!matches['songLevels']) {
        matches['songLevels'] = [];
      }
      matches['songLevels'].push(lvNumber);
      continue;
    }

    const noteNumber = extractNoteNumber(keyword);
    if (noteNumber !== null) {
      if (!matches['notes']) {
        matches['notes'] = [];
      }
      matches['notes'].push(noteNumber);
      continue;
    }
    const skillNumber = extractSkillNumber(keyword);
    if (skillNumber !== null) {
      if (!matches['scoreUpMaxValue']) {
        matches['scoreUpMaxValue'] = [];
      }
      matches['scoreUpMaxValue'].push(skillNumber);
      continue;
    }

    if (isValidRelationStr(keyword)) {
      if (!matches['_relationStr']) {
        matches['_relationStr'] = [];
      }
      matches['_relationStr'].push(keyword);
      continue;
    }

    for (const type in config) {
      const typeConfig = config[type];
      for (const key in typeConfig) {
        const values = typeConfig[key];
        for (const value of values) {
          if (typeof value === 'string') {
            if (value === keyword) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }

          if (Array.isArray(value)) {
            if (value.includes(keyword)) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }

          if (typeof value === 'object') {
            if (Object.keys(value).includes(keyword)) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }
        }
      }
    }

  }
  console.log(matches + ' fuzzySearch Line178')
  return matches;
}

function isValidRelationStr(_relationStr: string): boolean {
  const lessThanPattern = /^<\d+$/;
  const greaterThanPattern = /^>\d+$/;
  const rangePattern = /^\d+-\d+$/;

  return lessThanPattern.test(_relationStr) ||
    greaterThanPattern.test(_relationStr) ||
    rangePattern.test(_relationStr);
}

export function include(source: string, target: string) {
  source = source.toLowerCase()
  return source.includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 3)
  || source.split(' ').includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 1)
  || source.split('-').includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 1)
  || source == target
}

export function match(matches: FuzzySearchResult, target: any, numberTypeKey: string[],disableBandCharaIdLimit = false): boolean {
  if (!target) {
    return false;
  }
  let match;
  let haveAttrFlags = false;
  //if(isWorker) loadConfig()
  for (var key in matches) {
    if (key === 'attribute') haveAttrFlags = true
    if (key === '_number' || key === '_all') {
      continue;
    }
    if (match == undefined) match = false
    if (key === '_relationStr') {match = true; continue}
    // 匹配关键词
    if (target[key] !== undefined) {
      // 处理 Array 类型
      if (Array.isArray(target[key]) || typeof target[key] === 'object') {
        let matchArray = false;
        for (let i = 0; i < target[key].length; i++) {
          const element = target[key][i];

          // 对比字符串（忽略大小写）
          if (
            typeof element === 'string' &&
            matches[key].some((m: any) => typeof m === 'string' && m.toLowerCase() === element.toLowerCase())
          ) {
            matchArray = true;
            break;
          }

          // 对比数字（songLevels 等）
          if (
            typeof element === 'number' &&
            matches[key].some((m: any) => typeof m === 'number' && m === element)
          ) {
            matchArray = true;
            break;
          }
        }
        if (matchArray) {
          match = true;
          continue;
        } else {
          match = false;
          break;
        }
      }
      // 处理 Object (string, number) 类型
      else {
        if (
          typeof target[key] === 'string' &&
          matches[key].some((m: any) => typeof m === 'string' && m.toLowerCase() === target[key].toLowerCase())
        ) {
          match = true;
          continue;
        }

        if (
          typeof target[key] === 'number' &&
          matches[key].some((m: any) => typeof m === 'number' && m === target[key])
        ) {
          match = true;
          continue;
        }

        match = false;
        break;
      }
    }
  }
    if (match == undefined) match = false
    // 处理指定的数字类型 key，比如 songLevels
    if (!match && numberTypeKey.length > 0 && matches['_number'] !== undefined) {
      for (let key of numberTypeKey) {
        if (matches['_number'].includes(target[key])) {
          match = true;
          break
        }
      }
    }
    if(!match){
      for(let key in matches){
        if (key == 'notes'){
          for(let n in target.notes){
            if(matches[key][0] == target.notes[n]){
              match = true
              break
            }
          }
        }
      }
    }


  //如果在config中所有类型都不符合的情况下，检查 _all
  
  disableBandCharaIdLimit = disableBandCharaIdLimit || matches['fuzzySearchPolicy']?.includes('disableBandCharaIdLimit')  // 检查fuzzySearchPolicy，是否需要禁用bandId与CharacterId限定检查
  if (!match && matches['_all'] && (disableBandCharaIdLimit ||  (!matches['bandId'] && !matches['characterId']))) { 
    for (let i = 0; i < matches['_all'].length; i++) {
      let matchValue = (matches['_all'][i] as string).toLowerCase();
      let matchValueReplaceSpace = matchValue.replace(/ /g, '');
      for (let key in target) {
        if (key != 'musicTitle' && key != 'nickname' && key != 'prefix' && !key.endsWith('Name'))
          continue
        if (typeof target[key] === 'string') {
          if (key == 'nickname') {
            let nicknames = target[key].split(',')
            for (let nickname of nicknames) {
              if (haveAttrFlags && target['eventId']) break; // 对于活动而言，如果拥有属性，则不再查询nickname
              if (include(nickname, matchValue)) {
                match = true;
                break;
              }
              /*
              else{ // 如果仍然没有匹配到，则尝试拆分空格匹配，不考虑将其作为增量查找结果，因为有些昵称确实包含空格的，如果可以精确匹配的话就不再需要增量结果了
                let keySplitSpace = matchValue.split(' ')
                for (let kss of keySplitSpace){
                  if (include(nickname, kss)) {
                    match = true;
                    break;
                  }
                }
              }
                */
              
              if (!match){  // 如果仍然无结果，则合并空格进行查找
                var nicknameReplaceSpace = nickname.replace(/ /g, '')
                if (include(nicknameReplaceSpace, matchValueReplaceSpace)) {
                  match = true;
                  break;
                }
              }
            }
          }
          if (match) break
          if (include(target[key], matchValue)) {
            match = true;
            break;
          }
        }
        if (!match && key == 'musicTitle'){
          for (var mt of target[key]){
            //console.log(mt,matchValue)
            //@ts-ignore
            var musicTitleReplaceSpace = mt?mt.replace(/ /g, ''):null
            if (mt!= null && musicTitleReplaceSpace && include(musicTitleReplaceSpace, matchValueReplaceSpace)){
              match = true;
              break;
            }
            if (!match&& mt){  // 如果仍然无结果，则尝试空格拆分，使用歌曲的第一个字进行搜索
              var cmpstr =  splitSpaceAndConcatFirstLetter(mt)
              if (cmpstr && include(cmpstr, matchValueReplaceSpace)) {
                match = true;
                break;
              }
            }
            /*
            // TODO：如果仍然没有结果，则拆分match value逐词匹配
            // include中已经包含了该段逻辑了，所以不需要再进行一次拆分匹配了
            if (!match && musicTitleReplaceSpace &&  mt){  // 如果仍然无结果，则尝试空格拆分搜索词
              for (var s of matchValue.split(' ')){
                //console.log(nicknameReplaceSpace,s)
                if (include(musicTitleReplaceSpace, s.toLowerCase())) {
                  match = true;
                  break;
                }
              }
            }
              */
          }

        }
        if (Array.isArray(target[key])) {
          for (let j = 0; j < target[key].length; j++) {
            if (typeof target[key][j] === 'string') {
              //@ts-ignore
              if (include(target[key][j], matchValue)) {
                match = true;
                break;
              }
            }
          }
        }
        if (match) break;
      }
    }
  }

  return match;
}

function splitSpaceAndConcatFirstLetter(str:string){
  if (!str) return null
  var arr = str.split(' ')
  if (arr.length <= 1) return null
  var result = ''
  for (var s of arr){
    result+=s.slice(0,1)
  }
  //console.log(result)
  return result
}


// 以下为数字与范围函数
export function checkRelationList(num: number, _relationStrList: string[]): boolean {
  function checkRelation(num: number, _relationStr: string): boolean {
    const lessThanMatch = _relationStr.match(/^<(\d+)$/);
    const greaterThanMatch = _relationStr.match(/^>(\d+)$/);
    const rangeMatch = _relationStr.match(/^(\d+)-(\d+)$/);

    if (lessThanMatch) {
      const boundary = parseFloat(lessThanMatch[1]);
      return num < boundary;
    }

    if (greaterThanMatch) {
      const boundary = parseFloat(greaterThanMatch[1]);
      return num > boundary;
    }

    if (rangeMatch) {
      const lowerBoundary = parseFloat(rangeMatch[1]);
      const upperBoundary = parseFloat(rangeMatch[2]);
      return num >= lowerBoundary && num <= upperBoundary;
    }

    throw new Error('Invalid relation string format');
  }

  for (let i = 0; i < _relationStrList.length; i++) {
    try {
      if (checkRelation(num, _relationStrList[i])) {
        return true;
      }
    } catch (e) {
      logger('fuzzySearch', "Invalid relation string format");
    }
  }
  return false;
}

