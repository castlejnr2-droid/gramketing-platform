import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import axios from 'axios';

const API_BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId: string, text: string, replyMarkup?: object) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await axios.post(`${API_BASE()}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

async function editMessage(chatId: string, messageId: number, text: string, replyMarkup?: object) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await axios.post(`${API_BASE()}/editMessageText`, {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

async function answerCallbackQuery(callbackQueryId: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await axios.post(`${API_BASE()}/answerCallbackQuery`, {
    callback_query_id: callbackQueryId,
  });
}

function buildNotificationKeyboard(prefs: {
  notifyOutranked: boolean;
  notifyPoolEndingSoon: boolean;
  notifyRewardsDistributed: boolean;
  notifyNewPools: boolean;
}) {
  const on = '✅';
  const off = '❌';
  return {
    inline_keyboard: [
      [{ text: `${prefs.notifyOutranked ? on : off} Outranked alerts`, callback_data: 'toggle_outranked' }],
      [{ text: `${prefs.notifyPoolEndingSoon ? on : off} Pool ending soon`, callback_data: 'toggle_ending_soon' }],
      [{ text: `${prefs.notifyRewardsDistributed ? on : off} Rewards distributed`, callback_data: 'toggle_rewards' }],
      [{ text: `${prefs.notifyNewPools ? on : off} New pools`, callback_data: 'toggle_new_pools' }],
    ],
  };
}

const WELCOME_TEXT =
  `👋 Welcome to Gramketing Bot! I'll keep you updated on your campaigns.\n\n` +
  `Choose which notifications you want:\n` +
  `/notifications — manage your notification preferences\n` +
  `/status — see your active pools`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Callback queries (inline button presses) ──────────────────────────
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId = String(query.message.chat.id);
      const messageId: number = query.message.message_id;
      const data: string = query.data;

      await answerCallbackQuery(query.id);

      let prefs = await prisma.telegramNotificationPrefs.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!prefs) {
        await sendMessage(chatId, 'Please send /start first.');
        return NextResponse.json({ ok: true });
      }

      const toggleMap: Record<string, object> = {
        toggle_outranked:    { notifyOutranked: !prefs.notifyOutranked },
        toggle_ending_soon:  { notifyPoolEndingSoon: !prefs.notifyPoolEndingSoon },
        toggle_rewards:      { notifyRewardsDistributed: !prefs.notifyRewardsDistributed },
        toggle_new_pools:    { notifyNewPools: !prefs.notifyNewPools },
      };

      if (toggleMap[data]) {
        prefs = await prisma.telegramNotificationPrefs.update({
          where: { id: prefs.id },
          data: toggleMap[data],
        });
      }

      await editMessage(chatId, messageId, 'Choose which notifications you want:', buildNotificationKeyboard(prefs));
      return NextResponse.json({ ok: true });
    }

    // ── Regular messages ──────────────────────────────────────────────────
    const message = body.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);
    const fromId = String(message.from?.id ?? chatId);
    const text: string = message.text ?? '';

    if (text === '/start' || text.startsWith('/start ') || (!text.startsWith('/'))) {
      // Try to link account: look up user by telegramId
      const user = await prisma.user.findFirst({ where: { telegramId: fromId } });
      if (user) {
        await prisma.telegramNotificationPrefs.upsert({
          where: { userId: user.id },
          create: { userId: user.id, telegramChatId: chatId },
          update: { telegramChatId: chatId },
        });
      }
      await sendMessage(chatId, WELCOME_TEXT);
      return NextResponse.json({ ok: true });
    }

    if (text === '/notifications') {
      const prefs = await prisma.telegramNotificationPrefs.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!prefs) {
        await sendMessage(
          chatId,
          "⚠️ Your Telegram account isn't linked to a Gramketing account yet. Please connect your Telegram in the Gramketing dashboard first."
        );
        return NextResponse.json({ ok: true });
      }
      await sendMessage(chatId, 'Choose which notifications you want:', buildNotificationKeyboard(prefs));
      return NextResponse.json({ ok: true });
    }

    if (text === '/status') {
      const prefs = await prisma.telegramNotificationPrefs.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!prefs) {
        await sendMessage(chatId, "⚠️ Your Telegram account isn't linked to a Gramketing account yet.");
        return NextResponse.json({ ok: true });
      }
      const participants = await prisma.poolParticipant.findMany({
        where: { userId: prefs.userId, pool: { status: 'ACTIVE' } },
        include: { pool: { include: { project: true } } },
        orderBy: { totalPoints: 'desc' },
      });
      if (participants.length === 0) {
        await sendMessage(chatId, "📊 You're not in any active pools right now.");
        return NextResponse.json({ ok: true });
      }
      const lines = participants.map(
        (p) => `• <b>${p.pool.project.name}</b> — ${p.totalPoints.toFixed(0)} pts`
      );
      await sendMessage(chatId, `📊 Your active pools:\n\n${lines.join('\n')}`);
      return NextResponse.json({ ok: true });
    }

    // Unknown command
    await sendMessage(chatId, WELCOME_TEXT);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: true }); // Always 200 to Telegram
  }
}
