import axios, { AxiosError } from "axios";

// Rate limiting configuration
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
const MAX_RETRIES = 3;
let lastRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();
}

export async function getHistoricalData(
  symbol: string,
  interval: string
): Promise<number[]> {
  // Calculate time range based on interval
  const period2 = Math.floor(Date.now() / 1000);

  // Adjust the time range based on the interval to ensure we get enough data
  let period1: number;

  switch (interval) {
    case "1d":
      // For daily data, fetch 3 months (90 days)
      period1 = period2 - 90 * 24 * 60 * 60;
      break;
    case "1wk":
      // For weekly data, fetch 1 year
      period1 = period2 - 365 * 24 * 60 * 60;
      break;
    case "1mo":
      // For monthly data, fetch 5 years
      period1 = period2 - 5 * 365 * 24 * 60 * 60;
      break;
    default:
      // Default to 30 days
      period1 = period2 - 30 * 24 * 60 * 60;
  }

  // Ensure correct symbol format and common symbol fixes
  let normalizedSymbol = symbol.toUpperCase().trim();

  // Fix common ticker symbol typos/mistakes
  const symbolCorrections: Record<string, string> = {
    APPL: "AAPL", // Apple Inc.
    GOOGL: "GOOG", // Google (both are valid but GOOG is more commonly used)
    MSFT: "MSFT", // Microsoft (already correct but included for example)
    // Add more common corrections as needed
  };

  normalizedSymbol = symbolCorrections[normalizedSymbol] || normalizedSymbol;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${normalizedSymbol}?interval=${interval}&period1=${period1}&period2=${period2}`;

  // Match headers exactly from the working curl command
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      await waitForRateLimit();
      const res = await axios.get(url, { headers });

      // Check for valid data structure
      if (!res.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
        const error = new Error(
          "Invalid data structure received from Yahoo Finance"
        );
        (error as any).responseData = res.data;
        throw error;
      }

      const closes = res.data.chart.result[0].indicators.quote[0].close;
      if (!Array.isArray(closes) || closes.length === 0) {
        throw new Error("No price data available for " + normalizedSymbol);
      }

      return closes.filter((c: number | null) => c !== null);
    } catch (error) {
      const axiosError = error as AxiosError;
      retries++;

      if (axiosError.response?.status === 429) {
        if (retries < MAX_RETRIES) {
          const backoffDelay = Math.pow(2, retries) * 1000;
          await sleep(backoffDelay);
          continue;
        }
      } else if (axiosError.response?.status === 404) {
        throw new Error(
          `Symbol ${normalizedSymbol} not found. Please check if the symbol is correct.`
        );
      }

      if (retries === MAX_RETRIES) {
        const errorMessage = `Failed to fetch data for ${normalizedSymbol} after ${MAX_RETRIES} retries: ${axiosError.message}`;
        if ((error as any).responseData) {
          throw new Error(
            `${errorMessage}\nResponse data: ${JSON.stringify(
              (error as any).responseData,
              null,
              2
            )}`
          );
        }
        throw new Error(errorMessage);
      }

      const backoffDelay = 1000 * retries;
      await sleep(backoffDelay);
    }
  }
  throw new Error(`Maximum retries exceeded for ${normalizedSymbol}`);
}

export function calculateSMA(data: number[], period: number): number[] {
  return data.map((_, i) =>
    i < period - 1
      ? NaN
      : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  );
}

export function calculateRSI(data: number[], period = 14): number[] {
  const rsi: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push(NaN);
      continue;
    }
    let gains = 0,
      losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j] - data[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rs = losses === 0 ? 100 : gains === 0 ? 0 : gains / losses;;
    rsi.push(100 - 100 / (1 + rs));
  }
  return rsi;
}

export function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Initialize EMA with SMA
  let smaSum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }

    if (i === period - 1) {
      // First EMA value is SMA
      for (let j = 0; j < period; j++) {
        smaSum += data[i - j];
      }
      ema.push(smaSum / period);
    } else {
      // EMA = Close price × multiplier + Previous EMA × (1 – multiplier)
      ema.push(data[i] * multiplier + ema[i - 1] * (1 - multiplier));
    }
  }

  return ema;
}

export function calculateBollingerBands(
  data: number[],
  period = 20,
  stdDev = 2
): {
  middle: number[];
  upper: number[];
  lower: number[];
} {
  const middle = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (isNaN(middle[i])) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }

    let sum = 0;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      sum += Math.pow(data[j] - middle[i], 2);
    }
    const sd = Math.sqrt(sum / period);

    upper.push(middle[i] + stdDev * sd);
    lower.push(middle[i] - stdDev * sd);
  }

  return { middle, upper, lower };
}

export function calculateADX(
  high: number[],
  low: number[],
  close: number[],
  period = 14
): {
  adx: number[];
  pdi: number[];
  ndi: number[];
} {
  const tr: number[] = []; // True Range
  const pDM: number[] = []; // Plus Directional Movement
  const nDM: number[] = []; // Minus Directional Movement

  // Calculate TR, +DM, -DM
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      tr.push(high[i] - low[i]);
      pDM.push(0);
      nDM.push(0);
      continue;
    }

    // True Range
    const tr1 = high[i] - low[i];
    const tr2 = Math.abs(high[i] - close[i - 1]);
    const tr3 = Math.abs(low[i] - close[i - 1]);
    tr.push(Math.max(tr1, tr2, tr3));

    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];

    pDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    nDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Calculate smoothed values (Wilder's smoothing method)
  const smoothTR: number[] = [];
  const smoothPDM: number[] = [];
  const smoothNDM: number[] = [];

  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      smoothTR.push(NaN);
      smoothPDM.push(NaN);
      smoothNDM.push(NaN);
    } else if (i === period) {
      smoothTR.push(tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0));
      smoothPDM.push(
        pDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      );
      smoothNDM.push(
        nDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      );
    } else {
      smoothTR.push(smoothTR[i - 1] - smoothTR[i - 1] / period + tr[i]);
      smoothPDM.push(smoothPDM[i - 1] - smoothPDM[i - 1] / period + pDM[i]);
      smoothNDM.push(smoothNDM[i - 1] - smoothNDM[i - 1] / period + nDM[i]);
    }
  }

  const pDI: number[] = smoothPDM.map((val, i) =>
    isNaN(val) || isNaN(smoothTR[i]) ? NaN : 100 * (val / smoothTR[i])
  );

  const nDI: number[] = smoothNDM.map((val, i) =>
    isNaN(val) || isNaN(smoothTR[i]) ? NaN : 100 * (val / smoothTR[i])
  );

  const dx: number[] = pDI.map((val, i) =>
    isNaN(val) || isNaN(nDI[i])
      ? NaN
      : 100 * (Math.abs(val - nDI[i]) / (val + nDI[i]))
  );

  const adx: number[] = [];
  for (let i = 0; i < dx.length; i++) {
    if (i < period * 2 - 1) {
      adx.push(NaN);
    } else if (i === period * 2 - 1) {
      adx.push(
        dx.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
      );
    } else {
      adx.push((adx[i - 1] * (period - 1) + dx[i]) / period);
    }
  }

  return { adx, pdi: pDI, ndi: nDI };
}

export function identifyPatterns(
  open: number[],
  high: number[],
  low: number[],
  close: number[]
): {
  bullish: boolean[];
  bearish: boolean[];
} {
  const bullish: boolean[] = [];
  const bearish: boolean[] = [];

  for (let i = 0; i < close.length; i++) {
    // Need at least 3 days of data for pattern recognition
    if (i < 2) {
      bullish.push(false);
      bearish.push(false);
      continue;
    }

    // Calculate body and shadow sizes
    const bodySize = Math.abs(close[i] - open[i]);
    const totalRange = high[i] - low[i];
    const upperShadow = high[i] - Math.max(open[i], close[i]);
    const lowerShadow = Math.min(open[i], close[i]) - low[i];

    // Previous day's info
    const prevBodySize = Math.abs(close[i - 1] - open[i - 1]);
    const prevTotalRange = high[i - 1] - low[i - 1];

    // Determine if bullish or bearish based on patterns

    // Bullish engulfing
    const bullishEngulfing =
      close[i] > open[i] && // Current day is bullish
      open[i - 1] > close[i - 1] && // Previous day is bearish
      open[i] <= close[i - 1] && // Current open <= previous close
      close[i] >= open[i - 1]; // Current close >= previous open

    // Hammer (bullish reversal)
    const hammer =
      lowerShadow > bodySize * 2 && // Lower shadow is at least twice the body
      upperShadow < bodySize * 0.5 && // Small or no upper shadow
      close[i - 1] < open[i - 1] && // Previous day was bearish
      close[i - 2] < open[i - 2]; // Day before was also bearish

    // Morning star (bullish reversal)
    const morningStar =
      i >= 3 &&
      open[i - 2] > close[i - 2] && // First day bearish
      Math.abs(open[i - 1] - close[i - 1]) < prevBodySize * 0.3 && // Second day small body
      close[i] > open[i] && // Third day bullish
      close[i] > (open[i - 2] + close[i - 2]) / 2; // Third day closes above midpoint of first day

    // Bearish engulfing
    const bearishEngulfing =
      close[i] < open[i] && // Current day is bearish
      open[i - 1] < close[i - 1] && // Previous day is bullish
      open[i] >= close[i - 1] && // Current open >= previous close
      close[i] <= open[i - 1]; // Current close <= previous open

    // Shooting star (bearish reversal)
    const shootingStar =
      upperShadow > bodySize * 2 && // Upper shadow is at least twice the body
      lowerShadow < bodySize * 0.5 && // Small or no lower shadow
      close[i - 1] > open[i - 1] && // Previous day was bullish
      close[i - 2] > open[i - 2]; // Day before was also bullish

    // Evening star (bearish reversal)
    const eveningStar =
      i >= 3 &&
      open[i - 2] < close[i - 2] && // First day bullish
      Math.abs(open[i - 1] - close[i - 1]) < prevBodySize * 0.3 && // Second day small body
      close[i] < open[i] && // Third day bearish
      close[i] < (open[i - 2] + close[i - 2]) / 2; // Third day closes below midpoint of first day

    bullish.push(bullishEngulfing || hammer || morningStar);
    bearish.push(bearishEngulfing || shootingStar || eveningStar);
  }

  return { bullish, bearish };
}

export async function getSignal(
  symbol: string,
  interval: string
): Promise<string> {
  try {
    // Fetch historical data
    const data = await getHistoricalData(symbol, interval);

    // Determine minimum data points based on interval
    const minDataPoints = {
      "1d": 15, // 3 weeks of data for daily
      "1wk": 10, // 10 weeks for weekly
      "1mo": 6, // 6 months for monthly
    };

    // Get required minimum or default to 10
    const requiredDataPoints =
      minDataPoints[interval as keyof typeof minDataPoints] || 10;

    // Check if we have enough data
    if (data.length < requiredDataPoints) {
      return `Datos insuficientes para ${symbol}. Se requieren al menos ${requiredDataPoints} puntos de datos para intervalo ${interval}.`;
    }

    // Simulate OHLC data (since we only have closing prices)
    // This is a limitation of our current data; in a real system we'd have full OHLC
    const high = data.map((price, i) => price * (1 + 0.01 * Math.random()));
    const low = data.map((price, i) => price * (1 - 0.01 * Math.random()));
    const open = data.map((price, i) => (i > 0 ? data[i - 1] : price));

    // Calculate technical indicators
    const smaShort =
      interval === "1d" ? calculateSMA(data, 50) : calculateSMA(data, 10);
    const smaLong =
      interval === "1d" ? calculateSMA(data, 200) : calculateSMA(data, 30);
    const ema20 = calculateEMA(data, 20);
    const rsi = calculateRSI(data, 14);
    const bollingerBands = calculateBollingerBands(data, 20, 2);
    const adxData = calculateADX(high, low, data, 14);
    const patterns = identifyPatterns(open, high, low, data);

    // Latest values for making decisions
    const i = data.length - 1;

    // Calculate signal strength metrics (0-100 scale)
    let bullishSignals = 0;
    let bearishSignals = 0;
    let totalSignals = 0;

    // Weight factors (sum should be 100)
    const weights = {
      trend: 35, // Trend following (SMA crossover)
      momentum: 20, // Momentum (RSI)
      volatility: 15, // Volatility (Bollinger Bands)
      adx: 10, // ADX trend strength
      patterns: 20, // Candlestick patterns
    };

    // === 1. Trend Analysis (SMA crossover) ===
    if (!isNaN(smaShort[i]) && !isNaN(smaLong[i])) {
      totalSignals += weights.trend;

      // Bullish: Short-term SMA above long-term SMA
      if (smaShort[i] > smaLong[i]) {
        // Check for recent crossover (stronger signal)
        if (i > 1 && smaShort[i - 1] <= smaLong[i - 1]) {
          // Fresh crossover - stronger signal
          bullishSignals += weights.trend;
        } else {
          // Existing uptrend
          const trendStrength = Math.min(
            100,
            (smaShort[i] / smaLong[i] - 1) * 1000
          );
          bullishSignals += weights.trend * (0.7 + (0.3 * trendStrength) / 100);
        }
      }
      // Bearish: Short-term SMA below long-term SMA
      else if (smaShort[i] < smaLong[i]) {
        // Check for recent crossover (stronger signal)
        if (i > 1 && smaShort[i - 1] >= smaLong[i - 1]) {
          // Fresh crossover - stronger signal
          bearishSignals += weights.trend;
        } else {
          // Existing downtrend
          const trendStrength = Math.min(
            100,
            (smaLong[i] / smaShort[i] - 1) * 1000
          );
          bearishSignals += weights.trend * (0.7 + (0.3 * trendStrength) / 100);
        }
      }
    }

    // === 2. Momentum Analysis (RSI) ===
    if (!isNaN(rsi[i])) {
      totalSignals += weights.momentum;

      // Overbought: RSI > 70 (bearish)
      if (rsi[i] > 70) {
        const overboughtLevel = Math.min(100, ((rsi[i] - 70) / 30) * 100);
        bearishSignals +=
          weights.momentum * (0.7 + (0.3 * overboughtLevel) / 100);
      }
      // Oversold: RSI < 30 (bullish)
      else if (rsi[i] < 30) {
        const oversoldLevel = Math.min(100, ((30 - rsi[i]) / 30) * 100);
        bullishSignals +=
          weights.momentum * (0.7 + (0.3 * oversoldLevel) / 100);
      }
      // Bullish momentum: 30 <= RSI < 50 and rising
      else if (rsi[i] >= 30 && rsi[i] < 50 && i > 0 && rsi[i] > rsi[i - 1]) {
        bullishSignals += weights.momentum * 0.7;
      }
      // Bearish momentum: 50 < RSI <= 70 and falling
      else if (rsi[i] > 50 && rsi[i] <= 70 && i > 0 && rsi[i] < rsi[i - 1]) {
        bearishSignals += weights.momentum * 0.7;
      }
    }

    // === 3. Volatility Analysis (Bollinger Bands) ===
    if (!isNaN(bollingerBands.upper[i]) && !isNaN(bollingerBands.lower[i])) {
      totalSignals += weights.volatility;

      // Price near upper band (potential reversal or continuation)
      if (
        data[i] >
        bollingerBands.middle[i] +
          0.85 * (bollingerBands.upper[i] - bollingerBands.middle[i])
      ) {
        // If RSI is also high, this is more likely a bearish signal
        if (rsi[i] > 65) {
          bearishSignals += weights.volatility * 0.8;
        } else {
          // Otherwise could be strong momentum (bullish)
          bullishSignals += weights.volatility * 0.4;
        }
      }
      // Price near lower band (potential reversal or continuation)
      else if (
        data[i] <
        bollingerBands.middle[i] -
          0.85 * (bollingerBands.middle[i] - bollingerBands.lower[i])
      ) {
        // If RSI is also low, this is more likely a bullish signal
        if (rsi[i] < 35) {
          bullishSignals += weights.volatility * 0.8;
        } else {
          // Otherwise could be strong downtrend (bearish)
          bearishSignals += weights.volatility * 0.4;
        }
      }
      // Narrow bands indicate potential breakout
      const bandWidth =
        (bollingerBands.upper[i] - bollingerBands.lower[i]) /
        bollingerBands.middle[i];
      if (i > 20) {
        const prevBandWidth =
          (bollingerBands.upper[i - 20] - bollingerBands.lower[i - 20]) /
          bollingerBands.middle[i - 20];
        if (bandWidth < prevBandWidth * 0.7) {
          // Decreasing volatility, potential breakout coming
          // Direction is neutral but we add a small factor based on recent price action
          if (smaShort[i] > smaShort[i - 3]) {
            bullishSignals += weights.volatility * 0.2;
          } else {
            bearishSignals += weights.volatility * 0.2;
          }
        }
      }
    }

    // === 4. ADX Analysis (Trend Strength) ===
    if (
      !isNaN(adxData.adx[i]) &&
      !isNaN(adxData.pdi[i]) &&
      !isNaN(adxData.ndi[i])
    ) {
      totalSignals += weights.adx;

      // Strong trend is present when ADX > 25
      if (adxData.adx[i] > 25) {
        const trendStrength = Math.min(1, (adxData.adx[i] - 25) / 25);

        // +DI above -DI indicates bullish trend
        if (adxData.pdi[i] > adxData.ndi[i]) {
          bullishSignals += weights.adx * trendStrength;
        }
        // -DI above +DI indicates bearish trend
        else if (adxData.ndi[i] > adxData.pdi[i]) {
          bearishSignals += weights.adx * trendStrength;
        }
      }
    }

    // === 5. Candlestick Pattern Analysis ===
    if (patterns.bullish[i] || patterns.bearish[i]) {
      totalSignals += weights.patterns;

      if (patterns.bullish[i]) {
        bullishSignals += weights.patterns;
      }

      if (patterns.bearish[i]) {
        bearishSignals += weights.patterns;
      }
    }

    // Normalize signals if we don't have all indicators
    if (totalSignals > 0) {
      bullishSignals = (bullishSignals / totalSignals) * 100;
      bearishSignals = (bearishSignals / totalSignals) * 100;
    }

    // Generate detailed analysis
    let detailedAnalysis = "";

    // Technical indicator summaries
    detailedAnalysis += `\n🔍 ANÁLISIS TÉCNICO para ${symbol}:\n`;
    detailedAnalysis += `• Precio actual: $${data[i].toFixed(2)}\n`;

    // Only include indicators that have valid values
    if (!isNaN(smaShort[i]) && !isNaN(smaLong[i])) {
      detailedAnalysis += `• Tendencia: ${
        smaShort[i] > smaLong[i] ? "✅ Alcista" : "❌ Bajista"
      }\n`;
    }

    if (!isNaN(rsi[i])) {
      detailedAnalysis += `• RSI(14): ${rsi[i].toFixed(2)} ${
        rsi[i] > 70
          ? "⚠️ Sobrecomprado"
          : rsi[i] < 30
          ? "⚠️ Sobrevendido"
          : "✅ Neutral"
      }\n`;
    } else {
      detailedAnalysis += `• RSI(14): No disponible\n`;
    }

    if (!isNaN(bollingerBands.upper[i]) && !isNaN(bollingerBands.lower[i])) {
      detailedAnalysis += `• Bandas de Bollinger: ${
        data[i] > bollingerBands.upper[i]
          ? "⚠️ Sobrecomprado"
          : data[i] < bollingerBands.lower[i]
          ? "⚠️ Sobrevendido"
          : "✅ Dentro de bandas"
      }\n`;
    }

    // Signal strength - ensure values make sense
    const totalStrength = Math.max(bullishSignals, bearishSignals);
    const confidenceLevel =
      totalStrength >= 70 ? "ALTA" : totalStrength >= 40 ? "MEDIA" : "BAJA";

    // Generate signal text - ensure consistency with indicator values
    let signal = "";

    // Make sure we have enough valid indicators before making a recommendation
    const minIndicatorsNeeded = 3;
    let validIndicatorsCount = 0;

    if (!isNaN(smaShort[i]) && !isNaN(smaLong[i])) validIndicatorsCount++;
    if (!isNaN(rsi[i])) validIndicatorsCount++;
    if (!isNaN(bollingerBands.upper[i]) && !isNaN(bollingerBands.lower[i]))
      validIndicatorsCount++;
    if (!isNaN(adxData.adx[i])) validIndicatorsCount++;

    if (validIndicatorsCount < minIndicatorsNeeded) {
      signal = `⚠️ Datos insuficientes para ${symbol} (${interval}) - Se necesitan más indicadores para un análisis confiable`;
    } else if (bullishSignals > bearishSignals + 10) {
      // Make sure the bullish signal aligns with the key indicators
      const isTrendBullish = smaShort[i] > smaLong[i];

      // Require at least one key indicator to confirm the bullish signal
      if (isTrendBullish || (rsi[i] < 50 && !isNaN(rsi[i]))) {
        if (bullishSignals > 70) {
          signal = `🚨 Señal FUERTE de COMPRA para ${symbol} (${interval})`;
        } else {
          signal = `📈 Señal de COMPRA para ${symbol} (${interval})`;
        }
      } else {
        // Mixed signals - bullish score is high but key indicators are bearish
        signal = `⚠️ Señales mixtas para ${symbol} (${interval}) - Considerar con cautela`;
      }
    } else if (bearishSignals > bullishSignals + 10) {
      // Make sure the bearish signal aligns with the key indicators
      const isTrendBearish = smaShort[i] < smaLong[i];

      // Require at least one key indicator to confirm the bearish signal
      if (isTrendBearish || (rsi[i] > 50 && !isNaN(rsi[i]))) {
        if (bearishSignals > 70) {
          signal = `🚨 Señal FUERTE de VENTA para ${symbol} (${interval})`;
        } else {
          signal = `📉 Señal de VENTA para ${symbol} (${interval})`;
        }
      } else {
        // Mixed signals - bearish score is high but key indicators are bullish
        signal = `⚠️ Señales mixtas para ${symbol} (${interval}) - Considerar con cautela`;
      }
    } else {
      signal = `🔄 Sin señal clara para ${symbol} (${interval})`;
    }

    // Add percentages and confidence to signal
    signal += `\nFuerza Alcista: ${bullishSignals.toFixed(
      1
    )}% | Fuerza Bajista: ${bearishSignals.toFixed(
      1
    )}%\nConfianza: ${confidenceLevel}`;

    // Add detailed analysis to signal
    signal += detailedAnalysis;

    return signal;
  } catch (error: any) {
    return `Error al analizar ${symbol}: ${error.message}`;
  }
}
