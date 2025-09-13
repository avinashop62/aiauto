const axios = require('axios');

async function runPredictionCycle(config) {
    if (!config.isSessionActive) {
        console.log("Skipping cycle: Session not active.");
        return null;
    }

    try {
        const response = await axios.get(config.apiUrl, { 
            headers: { 'Authorization': `Bearer ${config.bearerToken}` } 
        });
        const results = response.data?.data?.list;

        if (!results || results.length === 0) {
            console.log("API returned no results.");
            return { error: "API returned no results." };
        }

        const latestResult = results[0];
        const prediction = superAiPredict(results, latestResult.issueNumber);
        const nextPeriodNumber = BigInt(latestResult.issueNumber) + BigInt(1);

        return {
            nextPeriod: nextPeriodNumber.toString(),
            invest: prediction.bigSmall,
        };

    } catch (error) {
        if (error.response && [401, 403].includes(error.response.status)) {
            console.log("❌ Prediction cycle failed: Authorization error.");
            return { error: "Authorization" };
        } else {
            console.error("❌ An error occurred during the prediction cycle:", error.message);
            return { error: error.message };
        }
    }
}

function superAiPredict(history, latestIssueNumber) {
    if (!history || history.length < 10) return { bigSmall: "BIG", number: 7 };
    const historyData = history.map(item => ({ number: item.number, issueNumber: item.issueNumber }));
    const strategyIndex = parseInt(latestIssueNumber.slice(-1)) % 3;
    const recentHistory = historyData.slice(0, 10);

    if (strategyIndex === 0) {
        const num1 = parseInt(recentHistory[0].number);
        const num2 = parseInt(recentHistory[1].number);
        const sum = num1 + num2;
        const predictedNumber = sum % 10;
        return { bigSmall: predictedNumber >= 5 ? "BIG" : "SMALL", number: predictedNumber };
    }

    const bigNumbers = [5, 6, 7, 8, 9];
    const smallNumbers = [0, 1, 2, 3, 4];
    const numberFreq = {};
    recentHistory.forEach(item => {
        const num = parseInt(item.number);
        numberFreq[num] = (numberFreq[num] || 0) + 1;
    });
    const bigCount = recentHistory.filter(item => parseInt(item.number) >= 5).length;
    const smallCount = 10 - bigCount;

    if (strategyIndex === 1) {
        if (bigCount >= smallCount) {
            const bigFreq = bigNumbers.map(n => ({ num: n, freq: numberFreq[n] || 0 }));
            return { bigSmall: "BIG", number: bigFreq.reduce((a, b) => a.freq >= b.freq ? a : b).num };
        } else {
            const smallFreq = smallNumbers.map(n => ({ num: n, freq: numberFreq[n] || 0 }));
            return { bigSmall: "SMALL", number: smallFreq.reduce((a, b) => a.freq >= b.freq ? a : b).num };
        }
    }
    if (strategyIndex === 2) {
        if (bigCount > smallCount) {
            const smallFreq = smallNumbers.map(n => ({ num: n, freq: numberFreq[n] || 0 }));
            return { bigSmall: "SMALL", number: smallFreq.reduce((a, b) => a.freq <= b.freq ? a : b).num };
        } else {
            const bigFreq = bigNumbers.map(n => ({ num: n, freq: numberFreq[n] || 0 }));
            return { bigSmall: "BIG", number: bigFreq.reduce((a, b) => a.freq <= b.freq ? a : b).num };
        }
    }
}


module.exports = { runPredictionCycle };
