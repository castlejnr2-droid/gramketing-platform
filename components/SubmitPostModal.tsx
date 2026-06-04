'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Send, CheckCircle, AlertCircle } from 'lucide-react';

interface SubmitPostModalProps {
  poolId: string;
  open: boolean;
  onClose: () => void;
  dailySubmissionsUsed: number; // number of submissions today
  maxDailySubmissions?: number;
}

type Platform = 'X' | 'TELEGRAM';

const X_REGEX = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/;
const TG_REGEX = /^https?:\/\/t\.me\/[^/]+\/\d+/;

function validateUrl(url: string, platform: Platform): string | null {
  if (!url.trim()) return 'Please enter a URL';
  if (platform === 'X' && !X_REGEX.test(url))
    return 'Must be a valid X post URL (e.g. https://x.com/user/status/123456789)';
  if (platform === 'TELEGRAM' && !TG_REGEX.test(url))
    return 'Must be a valid Telegram post URL (e.g. https://t.me/channel/123)';
  return null;
}

export function SubmitPostModal({
  poolId,
  open,
  onClose,
  dailySubmissionsUsed,
  maxDailySubmissions = 2,
}: SubmitPostModalProps) {
  const [platform, setPlatform] = useState<Platform>('X');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const remaining = maxDailySubmissions - dailySubmissionsUsed;

  const handleSubmit = async () => {
    const err = validateUrl(url, platform);
    if (err) {
      setUrlError(err);
      return;
    }
    setUrlError(null);
    setServerError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolId, platform, postUrl: url }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Submission failed');
      }

      setSuccess(true);
      setUrl('');
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setUrlError(null);
    setServerError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
          <div className="glass-modal p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-lg font-semibold text-white">
                Submit a Post
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {success ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <CheckCircle className="w-14 h-14 text-green-400" />
                <p className="text-lg font-semibold text-white">
                  Submitted!
                </p>
                <p className="text-sm text-white/50 text-center">
                  Your post has been verified and accepted. Points will update within 30 minutes.
                </p>
                <button className="btn-primary mt-2" onClick={handleClose}>
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Daily limit */}
                <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                  <span className="text-sm text-white/60">
                    Daily submissions remaining
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      remaining === 0 ? 'text-red-400' : 'text-[#0088CC]'
                    }`}
                  >
                    {remaining} / {maxDailySubmissions}
                  </span>
                </div>

                {remaining === 0 && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    You've used all submissions for today. Come back tomorrow!
                  </div>
                )}

                {/* Platform selector */}
                <div className="flex mb-5 rounded-xl overflow-hidden border border-white/10">
                  {(['X', 'TELEGRAM'] as Platform[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setPlatform(p);
                        setUrlError(null);
                        setUrl('');
                      }}
                      className={`flex-1 py-2.5 text-sm font-medium transition-all duration-200 ${
                        platform === p
                          ? 'bg-[#0088CC] text-white'
                          : 'bg-transparent text-white/50 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {p === 'X' ? '𝕏  X (Twitter)' : ' Telegram'}
                    </button>
                  ))}
                </div>

                {/* URL input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    {platform === 'X'
                      ? 'X Post URL'
                      : 'Telegram Post URL'}
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setUrlError(null);
                    }}
                    placeholder={
                      platform === 'X'
                        ? 'https://x.com/username/status/123456789'
                        : 'https://t.me/channelname/123'
                    }
                    disabled={remaining === 0}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50 focus:bg-white/[0.07] transition-all disabled:opacity-40"
                  />
                  {urlError && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {urlError}
                    </p>
                  )}
                </div>

                {serverError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {serverError}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={submitting || remaining === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {submitting ? 'Submitting...' : 'Submit Post'}
                </button>

                <p className="mt-3 text-xs text-white/30 text-center">
                  Posts need at least 100 views to qualify. View counts update every 30 minutes.
                </p>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
