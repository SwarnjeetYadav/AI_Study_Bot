import { Bot } from 'grammy';
import { env } from '../config/env';
let instance: Bot | undefined;
export function getBot(): Bot { if (!instance) instance = new Bot(env.telegramToken()); return instance; }
export async function sendLongMessage(chatId: string | number, text: string) {
  const bot = getBot(); const max = 3800;
  for (let i = 0; i < text.length; i += max) await bot.api.sendMessage(chatId, text.slice(i, i + max));
}
