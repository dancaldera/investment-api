import { Hono, Context } from "hono";
import { getSignal } from "./strategy";
import { sendTelegramMessage } from "./telegram";

const app = new Hono();

app.get("/", (c: Context) => c.text("📊 API de Inversión (diaria o semanal)"));

app.get("/signal/:symbol", async (c: Context) => {
  // Check for API key in header
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ error: "Unauthorized - Invalid API Key" }, 401);
  }

  const symbol = c.req.param("symbol").toUpperCase();
  const interval = c.req.query("interval") ?? "1wk"; // default semanal
  const signal = await getSignal(symbol, interval);

  return c.json({ 
    symbol, 
    interval, 
    signal,
  });
});

app.post("/signal/send-telegram-message/:symbol", async (c: Context) => {
  // Check for API key in header
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ error: "Unauthorized - Invalid API Key" }, 401);
  }

  try {
    const symbol = c.req.param("symbol").toUpperCase();
    const interval = c.req.query("interval") ?? "1wk"; // default semanal
    const { telegramToken, chatId, sendTelegram = true } = await c.req.json();

    // Validate required fields if sendTelegram is true
    if (sendTelegram && (!telegramToken || !chatId)) {
      return c.json({ 
        error: "Bad Request - telegramToken and chatId are required when sendTelegram is true" 
      }, 400);
    }

    const signal = await getSignal(symbol, interval);

    if (sendTelegram) {
      await sendTelegramMessage(signal, telegramToken, chatId);
    }

    return c.json({ 
      symbol, 
      interval, 
      signal,
      telegramSent: sendTelegram 
    });
  } catch (error) {
    return c.json({ 
      error: "Bad Request - Invalid JSON body or missing required fields" 
    }, 400);
  }
});

export default app;
