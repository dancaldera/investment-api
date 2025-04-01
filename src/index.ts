import { Hono ,Context } from "hono";
import { getSignal } from "./strategy";
import { sendTelegramMessage } from "./telegram";


interface Bindings {
  TELEGRAM_TOKEN: string
  TELEGRAM_CHAT_ID: string
}


const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c: Context) => c.text("📊 API de Inversión (diaria o semanal)"));

app.get("/signal/:symbol", async (c: Context) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const interval = c.req.query("interval") ?? "1wk"; // default semanal
  const signal = await getSignal(symbol, interval);

  await sendTelegramMessage(signal, c.env.TELEGRAM_TOKEN, c.env.TELEGRAM_CHAT_ID);

  return c.json({ symbol, interval, signal });
});

export default app;
