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
  `/notifications - manage your notification preferences\n` +
  `/status - see your active pools`;

export async function POST(req: NextRequest) {
  // ── Authenticate webhook request ────────────────────────────────────────
  // Telegram sends X-Telegram-Bot-Api-Secret-Token on every update when a
  // secret_token was supplied to setWebhook. Reject anything without it.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret || req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
        await sendMessage(chatId, 'Please link your account first by sending your LINK code here.');
        return NextResponse.json({ ok: true });
      }

      const toggleMap: Record<string, object> = {
        toggle_outranked:   { notifyOutranked: !prefs.notifyOutranked },
        toggle_ending_soon: { notifyPoolEndingSoon: !prefs.notifyPoolEndingSoon },
        toggle_rewards:     { notifyRewardsDistributed: !prefs.notifyRewardsDistributed },
        toggle_new_pools:   { notifyNewPools: !prefs.notifyNewPools },
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
    const text: string = (message.text ?? '').trim();

    // ── LINK code handler ─────────────────────────────────────────────────
    if (/^LINK-[A-Z0-9]{6}$/i.test(text)) {
      const code = text.toUpperCase();
      const now = new Date();

      const user = await prisma.user.findFirst({
        where: {
          linkTelegramCode: code,
          linkTelegramCodeExpiry: { gt: now },
        },
      });

      if (!user) {
        await sendMessage(
          chatId,
          '❌ Invalid or expired code. Please generate a new one from the Gramketing dashboard.'
        );
        return NextResponse.json({ ok: true });
      }

      // Check if this Telegram account is already linked to a different wallet
      const existing = await prisma.user.findUnique({ where: { telegramChatId: chatId } });
      if (existing && existing.id !== user.id) {
        await sendMessage(
          chatId,
          '❌ This Telegram account is already linked to another wallet. It must be unlinked from that account first.'
        );
        return NextResponse.json({ ok: true });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: chatId,
          linkTelegramCode: null,
          linkTelegramCodeExpiry: null,
        },
      });

      await prisma.telegramNotificationPrefs.upsert({
        where: { userId: user.id },
        create: { userId: user.id, telegramChatId: chatId },
        update: { telegramChatId: chatId },
      });

      await sendMessage(
        chatId,
        '✅ Your Telegram account is now linked to Gramketing! Use /notifications to set your preferences.'
      );
      return NextResponse.json({ ok: true });
    }

    // ── /start ────────────────────────────────────────────────────────────
    if (text === '/start' || text.startsWith('/start ')) {
      await sendMessage(chatId, WELCOME_TEXT);
      return NextResponse.json({ ok: true });
    }

    // ── /notifications ────────────────────────────────────────────────────
    if (text === '/notifications') {
      const prefs = await prisma.telegramNotificationPrefs.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!prefs) {
        await sendMessage(
          chatId,
          "⚠️ Your Telegram account isn't linked yet. Get a link code from your Gramketing dashboard and send it here."
        );
        return NextResponse.json({ ok: true });
      }
      await sendMessage(chatId, 'Choose which notifications you want:', buildNotificationKeyboard(prefs));
      return NextResponse.json({ ok: true });
    }

    // ── /status ───────────────────────────────────────────────────────────
    if (text === '/status') {
      const prefs = await prisma.telegramNotificationPrefs.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!prefs) {
        await sendMessage(chatId, "⚠️ Your Telegram account isn't linked yet. Get a link code from your Gramketing dashboard and send it here.");
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
        (p) => `• <b>${p.pool.project.name}</b> - ${p.totalPoints.toFixed(0)} pts`
      );
      await sendMessage(chatId, `📊 Your active pools:\n\n${lines.join('\n')}`);
      return NextResponse.json({ ok: true });
    }

    // ── Default ───────────────────────────────────────────────────────────
    await sendMessage(chatId, WELCOME_TEXT);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: true }); // Always 200 to Telegram
  }
}
