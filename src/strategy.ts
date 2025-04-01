import axios, { AxiosError } from "axios";

// Rate limiting configuration
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
const MAX_RETRIES = 3;
let lastRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();
}

export async function getHistoricalData(symbol: string, interval: string): Promise<number[]> {
  // Calculate period1 as 7 days ago and period2 as current time (matching the curl example)
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - (7 * 24 * 60 * 60); // 7 days ago

  // Ensure correct symbol format and common symbol fixes
  let normalizedSymbol = symbol.toUpperCase().trim();
  // Fix common symbol mistakes
  const symbolMap: { [key: string]: string } = {
    'APPL': 'AAPL',  // Common typo for Apple Inc.
  };
  normalizedSymbol = symbolMap[normalizedSymbol] || normalizedSymbol;
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${normalizedSymbol}?interval=${interval}&period1=${period1}&period2=${period2}`;

  // Match headers exactly from the working curl command
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      await waitForRateLimit();
      const res = await axios.get(url, { headers });
      
      // Check for valid data structure
      if (!res.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
        const error = new Error('Invalid data structure received from Yahoo Finance');
        (error as any).responseData = res.data;
        throw error;
      }
      
      const closes = res.data.chart.result[0].indicators.quote[0].close;
      if (!Array.isArray(closes) || closes.length === 0) {
        throw new Error('No price data available for ' + normalizedSymbol);
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
        throw new Error(`Symbol ${normalizedSymbol} not found. Please check if the symbol is correct.`);
      }
      
      if (retries === MAX_RETRIES) {
        const errorMessage = `Failed to fetch data for ${normalizedSymbol} after ${MAX_RETRIES} retries: ${axiosError.message}`;
        if ((error as any).responseData) {
          throw new Error(`${errorMessage}\nResponse data: ${JSON.stringify((error as any).responseData, null, 2)}`);
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
    i < period - 1 ? NaN : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  );
}

export function calculateRSI(data: number[], period = 14): number[] {
  const rsi: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push(NaN);
      continue;
    }
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j] - data[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rs = gains / (losses || 1);
    rsi.push(100 - 100 / (1 + rs));
  }
  return rsi;
}

export async function getSignal(symbol: string, interval: string): Promise<string> {
  const data = await getHistoricalData(symbol, interval);

  const smaShort = interval === "1d" ? calculateSMA(data, 100) : calculateSMA(data, 20);
  const smaLong = interval === "1d" ? calculateSMA(data, 250) : calculateSMA(data, 50);
  const rsi = calculateRSI(data, 14);

  const i = data.length - 1;
  const buy = smaShort[i] > smaLong[i] && rsi[i] > 40 && rsi[i] < 70;
  const sell = smaShort[i] < smaLong[i] || rsi[i] > 70;

  if (buy) return ` Señal de COMPRA para ${symbol} (${interval})`;
  if (sell) return ` Señal de VENTA para ${symbol} (${interval})`;
  return ` Sin señal clara para ${symbol} (${interval})`;
}
