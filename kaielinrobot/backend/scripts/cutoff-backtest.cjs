const { predict } = require('../src/api/cutoff.cjs');

const SERVER = 0;
const TIER = 1000;
const EVENT_LIMIT = 3;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function getEndedEvents() {
  const now = Date.now();
  const events = await fetchJson('https://bestdori.com/api/events/all.6.json');
  return Object.entries(events)
    .map(([id, e]) => ({ id: Number(id), ...e }))
    .filter(e => e.endAt && e.endAt[SERVER] && Number(e.endAt[SERVER]) < now)
    .sort((a, b) => a.id - b.id)
    .slice(-EVENT_LIMIT);
}

function buildDailyIncrement(cutoffs, startTs, endTs) {
  if (!cutoffs || cutoffs.length === 0) return [];
  const daily = [];
  const byDay = new Map();
  const last = cutoffs[cutoffs.length - 1];
  for (const c of cutoffs) {
    const day = Math.max(0, Math.ceil((Number(c.time) / 1000 - startTs) / 86400));
    const prev = byDay.get(day);
    if (!prev || Number(c.time) > prev.time) {
      byDay.set(day, { time: Number(c.time), ep: Number(c.ep) });
    }
  }
  const maxDay = Math.max(...Array.from(byDay.keys()));
  let prevEp = 0;
  for (let d = 0; d <= maxDay; d++) {
    const point = byDay.get(d);
    if (point) {
      const inc = Math.max(0, point.ep - prevEp);
      daily.push(`${Math.round(inc / 10000)}`);
      prevEp = point.ep;
    }
  }
  if (daily.length === 0 && last) {
    daily.push(`${Math.round(Number(last.ep) / 10000)}`);
  }
  return daily;
}

function summarize(rows) {
  const total = rows.length;
  let hit10 = 0;
  let hit5 = 0;
  let highConfidence = 0;
  let highConfidenceHit10 = 0;
  let mape = 0;
  let avgConfidence = 0;
  let rushRate = 0;
  for (const row of rows) {
    mape += row.err;
    avgConfidence += row.conf;
    if (row.err <= 0.1) hit10 += 1;
    if (row.err <= 0.05) hit5 += 1;
    if (row.conf >= 0.8) {
      highConfidence += 1;
      if (row.err <= 0.1) highConfidenceHit10 += 1;
    }
    if (row.rush >= 0.45) rushRate += 1;
  }
  return {
    total,
    hit10: total ? hit10 / total : 0,
    hit5: total ? hit5 / total : 0,
    highConfidenceHit10: highConfidence ? highConfidenceHit10 / highConfidence : 0,
    avgConfidence: total ? avgConfidence / total : 0,
    rushRate: total ? rushRate / total : 0,
    mape: total ? mape / total : 0,
    rows,
  };
}

async function run() {
  const events = await getEndedEvents();
  const rows = [];
  for (const event of events) {
    const start = Number(event.startAt[SERVER]) / 1000;
    const end = Number(event.endAt[SERVER]) / 1000;
    const data = await fetchJson(`https://bestdori.com/api/tracker/data?server=${SERVER}&event=${event.id}&tier=${TIER}`);
    const cutoffs = data.cutoffs || [];
    if (cutoffs.length < 5) continue;
    const dailyIncrement = buildDailyIncrement(cutoffs, start, end);
    const step = Math.max(1, Math.floor(cutoffs.length / 12));
    for (let i = 2; i < cutoffs.length; i += step) {
      const pred = predict(cutoffs.slice(0, i + 1), start, end, 0, dailyIncrement);
      if (!pred || !pred.ep) continue;
      const actual = cutoffs[cutoffs.length - 1].ep || 0;
      if (!actual) continue;
      rows.push({
        err: Math.abs(pred.ep - actual) / actual,
        conf: pred.confidence || 0,
        rush: pred.rushScore || 0,
      });
    }
  }
  console.log(JSON.stringify(summarize(rows), null, 2));
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
