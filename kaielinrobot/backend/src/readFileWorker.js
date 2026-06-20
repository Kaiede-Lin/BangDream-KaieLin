import fs from 'fs';


export async function readJson(path) {
  //console.log(path)
  
  const data = await fs.promises.readFile(path, 'utf-8'); //await fs.promises.readFile
  return JSON.parse(data);
}
export async function readJsonText(path) {
  //console.log(path)
  
  const data = await fs.promises.readFile(path, 'utf-8'); //await fs.promises.readFile
  return data;
}
export async function readJsonFromText(str){
  return JSON.parse(str);
}
export async function readFiles(path) {
  //console.log(path)
  return fs.readFileSync(path);
}
export async function fileExists(path) {
  return fs.existsSync(path)
}