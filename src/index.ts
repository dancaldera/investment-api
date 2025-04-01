import { Hono ,Context } from "hono";
import { getSignal } from "./strategy";
import { sendTelegramMessage } from "./telegram";

const app = new Hono();

app.get("/", (c: Context) => c.text("📊 API de Inversión (diaria o semanal)"));

app.get("/signal/:symbol", async (c: Context) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const interval = c.req.query("interval") ?? "1wk"; // default semanal
  const signal = await getSignal(symbol, interval);

  await sendTelegramMessage(signal, c.env.TELEGRAM_TOKEN, c.env.TELEGRAM_CHAT_ID);

  return c.json({ symbol, interval, signal });
});

export default app;
