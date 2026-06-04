import axios from 'axios';

export interface TelegramMetrics {
  views: number;
  reactions: number;
}

/**
 * Fetch view count and reaction count for a Telegram channel post.
 * Uses Bot API 7.0+ getMessages endpoint.
 * The bot must be a member (or admin) of the channel, or the channel must be public.
 * Returns { views: 0, reactions: 0 } on any error so callers fail open.
 */
export async function fetchTelegramPostMetrics(postUrl: string): Promise<TelegramMetrics> {
  const match = postUrl.match(/t\.me\/([^/]+)\/(\d+)/);
  if (!match) return { views: 0, reactions: 0 };

  const [, channel, msgIdStr] = match;
  const messageId = parseInt(msgIdStr, 10);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { views: 0, reactions: 0 };

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${token}/getMessages`,
      { chat_id: `@${channel}`, message_ids: [messageId] },
      { timeout: 10_000 }
    );

    const messages: Array<{
      views?: number;
      reactions?: { reactions: Array<{ count: number }> };
    }> = res.data?.result ?? [];

    if (messages.length === 0) return { views: 0, reactions: 0 };

    const msg = messages[0];
    const views = msg.views ?? 0;
    const reactions = (msg.reactions?.reactions ?? []).reduce(
      (sum: number, r: { count: number }) => sum + (r.count ?? 0),
      0
    );

    return { views, reactions };
  } catch {
    return { views: 0, reactions: 0 };
  }
}

/**
 * Extract the lowercase channel username from a t.me URL.
 * e.g. "https://t.me/MyChannel/123" → "mychannel"
 *      "https://t.me/MyChannel"     → "mychannel"
 */
export function extractTelegramChannel(url: string): string | null {
  const match = url.trim().match(/t\.me\/([a-zA-Z][a-zA-Z0-9_]*)/);
  return match ? match[1].toLowerCase() : null;
}
