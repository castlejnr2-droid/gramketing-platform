import axios from 'axios';
import { prisma } from './prisma';

const API_BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await axios.post(`${API_BASE()}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error(`Failed to send Telegram message to ${chatId}:`, err);
  }
}

export async function notifyOutranked(userId: string, poolName: string, newRank: number): Promise<void> {
  const prefs = await prisma.telegramNotificationPrefs.findUnique({ where: { userId } });
  if (!prefs || !prefs.notifyOutranked) return;
  await sendTelegramMessage(
    prefs.telegramChatId,
    `⚠️ You've been outranked! You're now #${newRank} in <b>${poolName}</b>`
  );
}

export async function notifyPoolEndingSoon(userId: string, poolName: string, hoursLeft: number): Promise<void> {
  const prefs = await prisma.telegramNotificationPrefs.findUnique({ where: { userId } });
  if (!prefs || !prefs.notifyPoolEndingSoon) return;
  await sendTelegramMessage(
    prefs.telegramChatId,
    `⏰ <b>${poolName}</b> ends in ${hoursLeft} hours!`
  );
}

export async function notifyRewardsDistributed(userId: string, poolName: string, amount: string): Promise<void> {
  const prefs = await prisma.telegramNotificationPrefs.findUnique({ where: { userId } });
  if (!prefs || !prefs.notifyRewardsDistributed) return;
  await sendTelegramMessage(
    prefs.telegramChatId,
    `🎉 Rewards distributed for <b>${poolName}</b>! You earned ${amount} TON`
  );
}

export async function notifyNewPool(poolName: string, projectName: string, reward: string): Promise<void> {
  const allPrefs = await prisma.telegramNotificationPrefs.findMany({
    where: { notifyNewPools: true },
  });
  await Promise.all(
    allPrefs.map((prefs) =>
      sendTelegramMessage(
        prefs.telegramChatId,
        `🚀 New pool live: <b>${poolName}</b> by ${projectName} — ${reward} TON in rewards!`
      )
    )
  );
}
