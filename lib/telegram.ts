import axios from 'axios';

export interface TelegramMetrics {
  views: number;
  reactions: number;
}

/**
 * Parse Telegram's short-number format ("1.5K", "2M", "123") into an integer.
 */
function parseShortNumber(s: string): number {
  const clean = s.replace(/,/g, '').trim();
  if (/k$/i.test(clean)) return Math.round(parseFloat(clean) * 1_000);
  if (/m$/i.test(clean)) return Math.round(parseFloat(clean) * 1_000_000);
  return parseInt(clean, 10) || 0;
}

/**
 * Scrape the public t.me embed page for a channel post.
 * Works for any public channel with no bot membership required.
 */
async function scrapePublicPost(channel: string, messageId: number): Promise<TelegramMetrics> {
  try {
    const res = await axios.get(
      `https://t.me/${channel}/${messageId}?embed=1&single=1`,
      {
        timeout: 10_000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      }
    );
    const html: string = res.data;

    // Views: <span class="tgme_widget_message_views">1.5K</span>
    const viewsMatch = html.match(/class="tgme_widget_message_views"[^>]*>\s*([\d.,KkMm]+)/);
    const views = viewsMatch ? parseShortNumber(viewsMatch[1]) : 0;

    // Reactions: one span per reaction type
    let reactions = 0;
    const reactionRe = /class="tgme_widget_message_reaction_count"[^>]*>\s*([\d.,KkMm]+)/g;
    let reactionMatch: RegExpExecArray | null;
    while ((reactionMatch = reactionRe.exec(html)) !== null) {
      reactions += parseShortNumber(reactionMatch[1]);
    }

    return { views, reactions };
  } catch {
    return { views: 0, reactions: 0 };
  }
}

/**
 * Fetch view count and reaction count for a public Telegram channel post.
 *
 * Strategy:
 *   1. Try the Bot API `getMessages` endpoint — works if the bot happens to
 *      be in the channel (returns non-zero values).
 *   2. Fall back to scraping the public t.me embed page — no bot membership
 *      required, works for any public channel.
 *
 * Returns { views: 0, reactions: 0 } on any error so callers fail open.
 */
export async function fetchTelegramPostMetrics(postUrl: string): Promise<TelegramMetrics> {
  const match = postUrl.match(/t\.me\/([^/]+)\/(\d+)/);
  if (!match) return { views: 0, reactions: 0 };

  const [, channel, msgIdStr] = match;
  const messageId = parseInt(msgIdStr, 10);
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // ── 1. Bot API attempt ────────────────────────────────────────────────
  if (token) {
    try {
      const res = await axios.get(
        `https://api.telegram.org/bot${token}/getMessages`,
        {
          params: { chat_id: `@${channel}`, message_ids: messageId },
          timeout: 10_000,
        }
      );

      const messages: Array<{
        views?: number;
        reactions?: { reactions: Array<{ count: number }> };
      }> = res.data?.result ?? [];

      if (messages.length > 0) {
        const msg = messages[0];
        const views = msg.views ?? 0;
        const reactions = (msg.reactions?.reactions ?? []).reduce(
          (sum: number, r: { count: number }) => sum + (r.count ?? 0),
          0
        );
        if (views > 0 || reactions > 0) return { views, reactions };
      }
    } catch {
      // fall through to scraping
    }
  }

  // ── 2. Public embed scrape fallback ───────────────────────────────────
  return scrapePublicPost(channel, messageId);
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
