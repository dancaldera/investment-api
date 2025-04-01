import axios from "axios"

export async function sendTelegramMessage(text: string, TELEGRAM_TOKEN: string, CHAT_ID: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: CHAT_ID,
    text,
    parse_mode: "Markdown",
  });
}
