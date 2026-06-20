
var HOUR = 3600

function clamp(value, min, max) {
    if (value < min) return min
    if (value > max) return max
    return value
}

function normalizeSamples(cutoff, start_ts, end_ts) {
    var data = []
    for (var i = 0; i < cutoff.length; i++) {
        var item = cutoff[i]
        var time = item["time"]
        if (time - start_ts < 43200) continue
        if (end_ts - time < 3600) continue
        data.push({
            time: time,
            percent: (time - start_ts) / (end_ts - start_ts),
            ep: item["ep"],
        })
    }
    return data
}

function normalizeSamplesRelaxed(cutoff, start_ts, end_ts, startGapSeconds, endGapSeconds) {
    var data = []
    for (var i = 0; i < cutoff.length; i++) {
        var item = cutoff[i]
        var time = item["time"]
        if (time - start_ts < startGapSeconds) continue
        if (end_ts - time < endGapSeconds) continue
        data.push({
            time: time,
            percent: (time - start_ts) / (end_ts - start_ts),
            ep: item["ep"],
        })
    }
    return data
}

function calcWeight(sample, last_ts) {
    var tau = 12 * HOUR
    var timeDiff = Math.max(0, last_ts - sample.time)
    var wTime = Math.exp(-timeDiff / tau)
    var wPhase = 1 + 1.5 * sample.percent
    return Math.max(0.05, wTime * wPhase)
}

function weightedRegression(data) {
    var sumW = 0, sumX = 0, sumY = 0
    for (var i = 0; i < data.length; i++) {
        var d = data[i]
        sumW += d.weight
        sumX += d.weight * d.percent
        sumY += d.weight * d.ep
    }
    if (sumW === 0) return { a: 0, b: 0, valid: false }
    var avgX = sumX / sumW
    var avgY = sumY / sumW
    var z = 0, w = 0
    for (var j = 0; j < data.length; j++) {
        var p = data[j]
        z += p.weight * (p.percent - avgX) * (p.ep - avgY)
        w += p.weight * (p.percent - avgX) * (p.percent - avgX)
    }
    if (w === 0) return { a: avgY, b: 0, valid: true }
    return { a: avgY - (z / w) * avgX, b: z / w, valid: true }
}

function fitWindowRegression(samples, windowSeconds) {
    if (!samples.length) return { a: 0, b: 0, valid: false }
    var lastTime = samples[samples.length - 1].time
    var windowData = samples.filter(function (s) { return lastTime - s.time <= windowSeconds })
    if (windowData.length < 2) return { a: 0, b: 0, valid: false }
    var start = samples[0].time
    var end = samples[samples.length - 1].time
    return weightedRegression(windowData.map(function (item) {
        return {
            percent: (item.time - start) / (end - start),
            ep: item.ep,
            weight: 1,
        }
    }))
}

function parseDailyHints(dailyIncrement) {
    if (!dailyIncrement || !dailyIncrement.length) return []
    var hints = []
    for (var i = 0; i < dailyIncrement.length; i++) {
        var raw = dailyIncrement[i]
        if (raw == null) continue
        var str = String(raw)
        var clean = str.replace(/!/g, '').trim()
        var value = Number(clean)
        if (!isFinite(value) || value <= 0) continue
        hints.push(value * 10000)
    }
    return hints
}

function calcDailyBaseRate(dailyHints, fallbackRate) {
    if (dailyHints && dailyHints.length > 0) {
        var recent = dailyHints.slice(Math.max(0, dailyHints.length - 3))
        var maxRecent = Math.max.apply(Math, recent)
        return Math.round(Math.max(maxRecent, fallbackRate || 0))
    }
    return Math.round(Math.max(0, fallbackRate || 0))
}

function estimateDailyRate(samples, dailyHints) {
    var recentDaily = []
    var windows = [6, 12, 24]
    for (var i = 0; i < windows.length; i++) {
        var slope = slopeOfWindow(samples, windows[i] * HOUR) * 24
        if (isFinite(slope) && slope > 0) recentDaily.push(slope)
    }
    if (dailyHints && dailyHints.length > 0) {
        for (var j = Math.max(0, dailyHints.length - 3); j < dailyHints.length; j++) {
            var hint = dailyHints[j]
            if (isFinite(hint) && hint > 0) recentDaily.push(hint)
        }
    }
    if (recentDaily.length === 0) return 0
    return Math.max.apply(Math, recentDaily)
}

function projectTailFromDailyRate(latestEp, remainingDays, dailyRate, rushScore) {
    if (!isFinite(dailyRate) || dailyRate <= 0 || remainingDays <= 0) return latestEp
    var segments = []
    var whole = Math.floor(remainingDays)
    var fraction = remainingDays - whole
    if (fraction > 0) segments.push(fraction)
    for (var i = 0; i < whole; i++) segments.push(1)
    var gain = 0
    for (var idx = 0; idx < segments.length; idx++) {
        var chunksLeft = segments.length - idx
        var multiplier = 1
        if (chunksLeft === 1) multiplier = 2
        else if (chunksLeft === 2) multiplier = 1.5
        gain += dailyRate * segments[idx] * multiplier
    }
    if (rushScore > 0) {
        gain *= 1 + clamp(rushScore * 0.12, 0, 0.18)
    }
    return latestEp + gain
}

function estimateElapsedAverageDaily(latestEp, start_ts, latestTime) {
    var elapsedDays = Math.max(0.25, (latestTime - start_ts) / (24 * HOUR))
    if (!isFinite(elapsedDays) || elapsedDays <= 0) return 0
    return latestEp / elapsedDays
}

function dragonTailProjection(latestEp, remainingHours, dailyBaseRate, dailyHints, progress, rush) {
    var remainingDays = Math.max(0, remainingHours / 24)
    if (remainingDays <= 0 || dailyBaseRate <= 0) return latestEp
    var chunks = []
    var remaining = remainingDays
    while (remaining > 0) {
        var step = Math.min(1, remaining)
        chunks.push(step)
        remaining -= step
    }
    var gain = 0
    for (var i = 0; i < chunks.length; i++) {
        var chunksLeft = chunks.length - i
        var multiplier = 1
        if (chunksLeft <= 1) {
            multiplier = 2.0
        } else if (chunksLeft <= 2) {
            multiplier = 1.5
        }
        gain += dailyBaseRate * chunks[i] * multiplier
    }
    if (dailyHints && dailyHints.length >= 2) {
        var last = dailyHints[dailyHints.length - 1]
        var prev = dailyHints[dailyHints.length - 2]
        if (prev > 0 && last > prev) {
            gain *= 1 + clamp((last - prev) / prev * 0.2, 0, 0.2)
        }
    }
    if (rush && rush.score) {
        gain *= 1 + clamp(rush.score * 0.15 + (progress > 0.8 ? 0.05 : 0), 0, 0.22)
    }
    return latestEp + gain
}

function predictAtEnd(fit, rate) {
    if (!fit || !fit.valid) return 0
    var pred = fit.a + fit.b
    if (!isFinite(pred)) return 0
    if (rate && isFinite(rate)) {
        pred = pred * (1 + clamp(rate * 0.08, -0.12, 0.12))
    }
    return pred
}

function slopeOfWindow(samples, windowSeconds) {
    if (!samples || samples.length < 2) return 0
    var lastTime = samples[samples.length - 1].time
    var windowData = samples.filter(function (s) { return lastTime - s.time <= windowSeconds })
    if (windowData.length < 2) return 0
    var first = windowData[0]
    var last = windowData[windowData.length - 1]
    if (last.time === first.time) return 0
    return (last.ep - first.ep) / ((last.time - first.time) / HOUR)
}

function fallbackFromTail(cutoff, rate, end_ts) {
    if (!cutoff || cutoff.length === 0) return { ep: 0, confidence: 0, mode: "insufficient", rangeMin: 0, rangeMax: 0 }
    var last = cutoff[cutoff.length - 1]
    if (cutoff.length < 2) {
        return {
            ep: last.ep || 0,
            confidence: 0.2,
            mode: "tail",
            rangeMin: Math.max(0, (last.ep || 0) * 0.9),
            rangeMax: Math.max(0, (last.ep || 0) * 1.1),
        }
    }
    var prev = cutoff[cutoff.length - 2]
    var dt = Math.max(1, last.time - prev.time)
    var slopePerSecond = (last.ep - prev.ep) / dt
    var remaining = Math.max(0, end_ts - last.time)
    var extrapolated = last.ep + slopePerSecond * remaining * (1 + (rate || 0))
    var growth = Math.max(0, last.ep - prev.ep)
    return {
        ep: Math.max(0, extrapolated),
        confidence: 0.35,
        mode: "tail",
        rangeMin: Math.max(0, extrapolated - growth * 2),
        rangeMax: Math.max(0, extrapolated + growth * 2),
    }
}

function detectRush(samples, end_ts) {
    if (samples.length < 3) return { score: 0, isRush: false, strongRush: false }
    var lastTime = samples[samples.length - 1].time
    var windows = [6 * HOUR, 12 * HOUR, 24 * HOUR]
    var slopes = windows.map(function (windowSeconds) {
        var windowData = samples.filter(function (s) { return lastTime - s.time <= windowSeconds })
        if (windowData.length < 2) return 0
        var first = windowData[0]
        var last = windowData[windowData.length - 1]
        if (last.time === first.time) return 0
        return (last.ep - first.ep) / ((last.time - first.time) / HOUR)
    })
    var slope6 = Math.max(0, slopes[0])
    var slope12 = Math.max(0, slopes[1])
    var slope24 = Math.max(0, slopes[2])
    var ratio6 = slope24 > 0 ? slope6 / slope24 : 1
    var ratio12 = slope24 > 0 ? slope12 / slope24 : 1
    var timeLeft = Math.max(0, (end_ts - lastTime) / HOUR)
    var timePressure = clamp((24 - timeLeft) / 24, 0, 1)
    var acceleration = clamp((ratio6 - 1) * 0.7 + (ratio12 - 1) * 0.3, 0, 2)
    var score = clamp(
        0.38 * clamp((ratio6 - 0.9) / 0.8, 0, 1) +
        0.32 * clamp((ratio12 - 0.95) / 0.6, 0, 1) +
        0.2 * timePressure +
        0.1 * clamp(acceleration / 1.5, 0, 1), 0, 1
    )
    return { score: score, isRush: score >= 0.45, strongRush: score >= 0.65 }
}

function calcConfidence(dataCount, rush, baseResidualRatio, timeLeftHours, agreementRatio) {
    var sampleScore = clamp((dataCount - 3) / 10, 0, 1)
    var stabilityScore = clamp(1 - baseResidualRatio, 0, 1)
    var rushScore = rush.isRush ? (rush.strongRush ? 0.9 : 0.7) : 0.85
    var timeScore = clamp(1 - timeLeftHours / 72, 0.25, 1)
    var base = clamp(0.35 * sampleScore + 0.3 * stabilityScore + 0.2 * rushScore + 0.15 * timeScore, 0, 1)
    return clamp(base * 0.7 + agreementRatio * 0.3, 0, 1)
}

function progressProjection(lastSample, progress, rate) {
    if (!lastSample || !progress || progress <= 0) return 0
    var safeProgress = Math.max(progress, 0.05)
    var proj = lastSample.ep / safeProgress
    if (rate && isFinite(rate)) {
        proj = proj * (1 + clamp(rate * 0.15, -0.25, 0.25))
    }
    return proj
}

var predict = function(cutoff, start_ts, end_ts, rate, dailyIncrement) {
    if (!cutoff || cutoff.length < 3) {
        return {
            time: cutoff && cutoff.length ? cutoff[cutoff.length - 1]["time"] : 0,
            ep: cutoff && cutoff.length ? Math.floor(cutoff[cutoff.length - 1]["ep"] || 0) : 0,
            confidence: 0.15,
            rushScore: 0,
            mode: "insufficient",
            rangeMin: cutoff && cutoff.length ? Math.floor((cutoff[cutoff.length - 1]["ep"] || 0) * 0.9) : 0,
            rangeMax: cutoff && cutoff.length ? Math.floor((cutoff[cutoff.length - 1]["ep"] || 0) * 1.1) : 0,
            base: 0,
            rushAdjusted: 0,
            shortAdjusted: 0,
            samples: 0,
        }
    }

    var latestTime = cutoff[cutoff.length - 1]["time"]
    var progress = clamp((latestTime - start_ts) / (end_ts - start_ts), 0, 1)
    var samples = normalizeSamples(cutoff, start_ts, end_ts)
    if (samples.length < 6) {
        var adaptiveStartGap = progress < 0.25 ? 1800 : progress < 0.55 ? 10800 : 21600
        var adaptiveEndGap = progress > 0.85 ? 0 : 1800
        samples = normalizeSamplesRelaxed(cutoff, start_ts, end_ts, adaptiveStartGap, adaptiveEndGap)
    }
    if (samples.length < 4) {
        samples = normalizeSamplesRelaxed(cutoff, start_ts, end_ts, 0, progress > 0.9 ? 0 : 1800)
    }
    if (samples.length < 2) {
        var tail = fallbackFromTail(cutoff, rate, end_ts)
        return {
            time: latestTime,
            ep: Math.floor(tail.ep || 0),
            confidence: tail.confidence || 0,
            rushScore: 0,
            mode: tail.mode || "tail",
            rangeMin: Math.floor(tail.rangeMin || 0),
            rangeMax: Math.floor(tail.rangeMax || 0),
            base: Math.floor(tail.ep || 0),
            rushAdjusted: Math.floor(tail.ep || 0),
            shortAdjusted: Math.floor(tail.ep || 0),
            samples: 0,
        }
    }

    var weightedData = samples.map(function (sample) {
        return {
            percent: sample.percent,
            ep: sample.ep,
            weight: calcWeight(sample, latestTime),
        }
    })
    var baseFit = weightedRegression(weightedData)
    var basePrediction = predictAtEnd(baseFit, rate)
    if (!isFinite(basePrediction)) basePrediction = 0

    var rush = detectRush(samples, end_ts)
    var rushFit = fitWindowRegression(samples, 12 * HOUR)
    var shortFit = fitWindowRegression(samples, 24 * HOUR)
    var rushPrediction = predictAtEnd(rushFit, rate)
    var shortPrediction = predictAtEnd(shortFit, rate)
    if (!isFinite(rushPrediction)) rushPrediction = basePrediction
    if (!isFinite(shortPrediction)) shortPrediction = basePrediction

    var earlyPrediction = progressProjection(cutoff[cutoff.length - 1], progress, rate)
    if (!isFinite(earlyPrediction) || earlyPrediction <= 0) earlyPrediction = basePrediction

    var recentSlope = slopeOfWindow(samples, 12 * HOUR)
    var prevSlope = slopeOfWindow(samples.slice(0, Math.max(0, samples.length - 1)), 24 * HOUR)
    var timeLeftHours = Math.max(0, (end_ts - latestTime) / HOUR)
    var remainingDays = Math.max(0, timeLeftHours / 24)
    var dailyHints = parseDailyHints(dailyIncrement)
    var slopeDailyRate = Math.max(0, recentSlope * 24)
    var avgDailyRate = estimateElapsedAverageDaily(cutoff[cutoff.length - 1].ep, start_ts, latestTime)
    var dailyBaseRate = Math.max(calcDailyBaseRate(dailyHints, slopeDailyRate), estimateDailyRate(samples, dailyHints), slopeDailyRate, avgDailyRate * 0.45)
    if (remainingDays <= 6.0) {
        dailyBaseRate = Math.max(dailyBaseRate, 270000)
    }
    var tailProjection = latestTime && dailyBaseRate > 0
        ? projectTailFromDailyRate(cutoff[cutoff.length - 1].ep, Math.max(0, (end_ts - latestTime) / HOUR) / 24, dailyBaseRate, rush.score)
        : basePrediction
    if (!isFinite(tailProjection) || tailProjection <= 0) tailProjection = basePrediction

    var shortWeight = clamp((progress - 0.35) / 0.5, 0, 1)
    var rushWeight = rush.strongRush ? 0.3 : (rush.isRush ? 0.2 : 0.08)
    var trendPrediction = basePrediction * (1 - shortWeight) + shortPrediction * shortWeight
    trendPrediction = trendPrediction * (1 - rushWeight) + rushPrediction * rushWeight
    var finalPrediction = trendPrediction
    if (remainingDays <= 6.0) {
        finalPrediction = tailProjection
    } else if (remainingDays <= 8.0) {
        finalPrediction = trendPrediction * 0.3 + tailProjection * 0.7
    } else {
        finalPrediction = trendPrediction * 0.6 + tailProjection * 0.4
    }
    if (progress < 0.2) {
        finalPrediction = finalPrediction * 0.25 + earlyPrediction * 0.75
    } else if (progress < 0.45) {
        finalPrediction = finalPrediction * 0.7 + earlyPrediction * 0.3
    }
    if (!isFinite(finalPrediction) || finalPrediction <= 0) finalPrediction = tailProjection > 0 ? tailProjection : (shortPrediction > 0 ? shortPrediction : basePrediction)

    var residuals = weightedData.map(function (d) { return Math.abs(d.ep - (baseFit.a + baseFit.b * d.percent)) })
    var residualAvg = residuals.reduce(function (s, v) { return s + v }, 0) / residuals.length
    var residualRatio = basePrediction > 0 ? clamp(residualAvg / basePrediction, 0, 1) : 1
    var agreementSpread = Math.max(
        Math.abs(basePrediction - shortPrediction),
        Math.abs(basePrediction - earlyPrediction),
        Math.abs(shortPrediction - earlyPrediction)
    )
    var agreementRatio = finalPrediction > 0 ? clamp(1 - agreementSpread / Math.max(finalPrediction, 1), 0, 1) : 0
    var confidence = calcConfidence(weightedData.length, rush, residualRatio, timeLeftHours, agreementRatio)
    if (weightedData.length >= 8 && confidence < 0.8 && !rush.strongRush && residualRatio < 0.12 && agreementRatio > 0.75) {
        confidence = Math.max(confidence, 0.8)
    }
    if (weightedData.length >= 10 && confidence < 0.82 && rush.isRush && residualRatio < 0.18 && agreementRatio > 0.7) {
        confidence = Math.max(confidence, 0.82)
    }
    var spread = Math.max(basePrediction * (0.06 + (1 - confidence) * 0.14), residualAvg * 1.2, Math.abs(shortPrediction - basePrediction) * 0.45)

    var out = {
        time: latestTime,
        ep: Math.max(0, finalPrediction),
        confidence: confidence,
        rushScore: rush.score,
        mode: rush.strongRush ? "rush" : rush.isRush ? "watch" : "normal",
        rangeMin: Math.max(0, finalPrediction - spread),
        rangeMax: Math.max(0, finalPrediction + spread),
        base: basePrediction,
        rushAdjusted: rushPrediction,
        shortAdjusted: shortPrediction,
        samples: weightedData.length,
    }

    if (isNaN(out.ep)) out.ep = 0
    return out
}

module.exports = { predict }
/*
var cutoffs =  [{
    "time":1604984400,"ep":0},
{
    "time":1604997360,"ep":85647},
{
    "time":1605013860,"ep":159997},
{
    "time":1605015060,"ep":167838},
{
    "time":1605022380,"ep":200378},
{
    "time":1605070140,"ep":287999},
{
    "time":1605086100,"ep":342960},
{
    "time":1605106500,"ep":420660},
{
    "time":1605112200,"ep":443109},
{
    "time":1605149880,"ep":480347},
{
    "time":1605155460,"ep":498615},
{
    "time":1605180840,"ep":564771},
{
    "time":1605187560,"ep":581445},
{
    "time":1605193800,"ep":622054},
{
    "time":1605231780,"ep":664718},
{
    "time":1605243840,"ep":695625},
{
    "time":1605254880,"ep":764258},
{
    "time":1605286800,"ep":929219},
{
    "time":1605323100,"ep":980785},
{
    "time":1605336600,"ep":1053117}
]
var rate = 0.6924049325684304
var start_ts = 1604984400
var end_ts = 1605452340
console.log(predict(cutoffs,start_ts,end_ts,rate))
*/
