import axios from "axios";

export async function getHistoricalData(symbol: string, interval: string): Promise<number[]> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 60 * 60 * 24 * 365 * 2; // 2 años

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&period1=${start}&period2=${end}`;

  const res = await axios.get(url);
  const closes = res.data.chart.result[0].indicators.quote[0].close;
  return closes.filter((c: number | null) => c !== null);
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

  if (buy) return `📈 Señal de COMPRA para ${symbol} (${interval})`;
  if (sell) return `📉 Señal de VENTA para ${symbol} (${interval})`;
  return `⏳ Sin señal clara para ${symbol} (${interval})`;
}

