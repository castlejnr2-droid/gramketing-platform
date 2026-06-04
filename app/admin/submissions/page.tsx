'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTonWallet } from '@tonconnect/ui-react';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
  Shield, ArrowLeft, Search, RefreshCw, ExternalLink,
  AlertCircle, CheckCircle, Loader2, FileText, ChevronLeft,
  ChevronRight, Copy, Check, X, Filter,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Submission {
  id: string;
  platform: 'X' | 'TELEGRAM';
  postUrl: string;
  views: number;
  likes: number;
  reposts: number;
  reactions: number;
  points: number;
  submittedAt: string;
  lastScrapedAt: string | null;
  pool: { id: string; name: string; tokenSymbol: string; status: string };
  participant: { walletAddress: string; username: string | null; xHandle: string | null; telegramHandle: string | null };
}

interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
interface Stats { total: number; x: number; telegram: number; avgPoints: number; totalPoints: number }

interface PoolOption { id: string; name: string; tokenSymbol: string }

type Platform = 'ALL' | 'X' | 'TELEGRAM';
type SortBy   = 'submittedAt' | 'points' | 'views' | 'lastScraped';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString(); }
function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="text-white/25 hover:text-white/60 transition-colors ml-1">
      {done ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

const PLATFORM_BADGE: Record<string, string> = {
  X:        'bg-white/10 text-white/70 border-white/15',
  TELEGRAM: 'bg-[#0088CC]/15 text-[#0088CC] border-[#0088CC]/25',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:      'bg-green-500/15 text-green-400',
  ENDED:       'bg-yellow-500/15 text-yellow-400',
  DISTRIBUTED: 'bg-white/8 text-white/30',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminSubmissionsPage() {
  const wallet = useTonWallet();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pagination, setPagination]   = useState<Pagination | null>(null);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [pools, setPools]             = useState<PoolOption[]>([]);
  const [loading, setLoading]         = useState(true);
  const [isAdmin, setIsAdmin]         = useState(false);

  // Filters
  const [platform, setPlatform]   = useState<Platform>('ALL');
  const [poolId, setPoolId]       = useState('');
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState<SortBy>('submittedAt');
  const [page, setPage]           = useState(1);

  // Per-row scrape state
  const [scraping, setScraping]   = useState<Record<string, boolean>>({});
  const [scraped, setScraped]     = useState<Record<string, Submission>>({});
  const [feedback, setFeedback]   = useState<{ msg: string; ok: boolean } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch submissions ────────────────────────────────────────────────────

  const fetchSubmissions = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, page: String(p) });
    if (platform !== 'ALL') params.set('platform', platform);
    if (poolId)   params.set('poolId', poolId);
    if (search)   params.set('search', search);

    try {
      const res = await fetch(`/api/admin/submissions?${params}`, { credentials: 'include' });
      const d = await res.json();
      if (d.error === 'Unauthorized') { setIsAdmin(false); return; }
      setIsAdmin(true);
      setSubmissions(d.submissions ?? []);
      setPagination(d.pagination ?? null);
      setStats(d.stats ?? null);
    } finally {
      setLoading(false);
    }
  }, [platform, poolId, search, sortBy, page]);

  // Fetch pool list for filter dropdown
  const fetchPools = useCallback(async () => {
    const res = await fetch('/api/admin/pools', { credentials: 'include' });
    const d = await res.json();
    setPools((d.pools ?? []).map((p: { id: string; project: { name: string }; tokenSymbol: string }) => ({
      id: p.id,
      name: p.project.name,
      tokenSymbol: p.tokenSymbol,
    })));
  }, []);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    fetchPools();
  }, [wallet, fetchPools]);

  // Debounce search; reset page on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchSubmissions(1); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [platform, poolId, search, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (wallet && isAdmin) fetchSubmissions(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-row rescrape ─────────────────────────────────────────────────────

  const rescrape = async (postId: string) => {
    setScraping((s) => ({ ...s, [postId]: true }));
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/submissions/rescrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ poolPostId: postId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      // Patch the row in-place
      setScraped((s) => ({ ...s, [postId]: d.post }));
      setFeedback({ msg: 'Re-scraped.', ok: true });
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Rescrape failed', ok: false });
    } finally {
      setScraping((s) => ({ ...s, [postId]: false }));
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────

  if (!wallet) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="glass-card p-10 text-center max-w-sm">
        <Shield className="w-10 h-10 mx-auto text-[#0088CC]/50 mb-4" />
        <p className="text-white/50 text-sm mb-6">Connect your admin wallet.</p>
        <TonConnectButton />
      </div>
    </div>
  );

  if (!loading && !isAdmin) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="glass-card p-10 text-center text-red-400 max-w-sm">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p className="font-semibold">Access Denied</p>
      </div>
    </div>
  );

  const hasFilters = platform !== 'ALL' || poolId || search;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-24 pb-24 px-4">
      <div className="max-w-screen-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0088CC]" />
            <h1 className="text-2xl font-bold text-white">Submissions</h1>
          </div>
          <button onClick={() => fetchSubmissions(page)} disabled={loading}
            className="ml-auto text-white/40 hover:text-white transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mb-5 p-3.5 rounded-xl flex items-center gap-2 text-sm border ${feedback.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {feedback.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-7">
            {[
              { label: 'Total',          value: fmt(stats.total),       color: 'text-white' },
              { label: 'X / Twitter',    value: fmt(stats.x),           color: 'text-white/70' },
              { label: 'Telegram',       value: fmt(stats.telegram),    color: 'text-[#0088CC]' },
              { label: 'Avg Points',     value: fmt(stats.avgPoints),   color: 'text-yellow-400' },
              { label: 'Total Points',   value: fmt(stats.totalPoints), color: 'text-purple-400' },
            ].map((s) => (
              <div key={s.label} className="glass-card p-4 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-white/30 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search post URL or wallet…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Platform tabs */}
          <div className="flex rounded-xl overflow-hidden border border-white/10 shrink-0">
            {(['ALL', 'X', 'TELEGRAM'] as Platform[]).map((p) => (
              <button key={p} onClick={() => { setPlatform(p); setPage(1); }}
                className={`px-4 py-2.5 text-xs font-semibold transition-all ${platform === p ? 'bg-[#0088CC] text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                {p === 'ALL' ? 'All' : p === 'X' ? 'X / Twitter' : 'Telegram'}
              </button>
            ))}
          </div>

          {/* Pool filter */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-4 h-4 text-white/30 shrink-0" />
            <select
              value={poolId}
              onChange={(e) => { setPoolId(e.target.value); setPage(1); }}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#0088CC]/50 max-w-[200px]"
            >
              <option value="">All pools</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (${p.tokenSymbol})</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortBy); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#0088CC]/50 shrink-0"
          >
            <option value="submittedAt">Newest first</option>
            <option value="points">Top points</option>
            <option value="views">Most views</option>
            <option value="lastScraped">Last scraped</option>
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <button onClick={() => { setSearch(''); setPlatform('ALL'); setPoolId(''); setPage(1); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white hover:border-white/25 text-xs transition-all shrink-0">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr>
                  {['Platform', 'Post', 'Author', 'Pool', 'Views', 'Engagement', 'Points', 'Submitted', 'Scraped', ''].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-medium text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-3 bg-white/8 rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-14 text-center text-white/30">
                      {hasFilters ? 'No submissions match your filters.' : 'No submissions yet.'}
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => {
                    const patched = scraped[sub.id];
                    const views     = patched?.views    ?? sub.views;
                    const likes     = patched?.likes    ?? sub.likes;
                    const reposts   = patched?.reposts  ?? sub.reposts;
                    const reactions = patched?.reactions ?? sub.reactions;
                    const points    = patched?.points   ?? sub.points;
                    const lastScraped = patched?.lastScrapedAt ?? sub.lastScrapedAt;

                    return (
                      <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">

                        {/* Platform */}
                        <td className="px-3 py-3">
                          <span className={`font-semibold text-xs px-2 py-0.5 rounded-full border ${PLATFORM_BADGE[sub.platform]}`}>
                            {sub.platform === 'X' ? 'X' : 'TG'}
                          </span>
                        </td>

                        {/* Post URL */}
                        <td className="px-3 py-3 max-w-[180px]">
                          <div className="flex items-center gap-1">
                            <a href={sub.postUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[#0088CC]/70 hover:text-[#0088CC] transition-colors font-mono truncate block max-w-[140px]">
                              {sub.postUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30)}…
                            </a>
                            <a href={sub.postUrl} target="_blank" rel="noopener noreferrer"
                              className="text-white/20 hover:text-white/60 shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>

                        {/* Author */}
                        <td className="px-3 py-3">
                          <div className="space-y-0.5">
                            {(sub.participant.username || sub.participant.xHandle || sub.participant.telegramHandle) && (
                              <p className="text-white/60">
                                {sub.participant.username
                                  ?? (sub.participant.xHandle ? `@${sub.participant.xHandle}` : null)
                                  ?? (sub.participant.telegramHandle ? `@${sub.participant.telegramHandle}` : null)}
                              </p>
                            )}
                            <div className="flex items-center">
                              <span className="font-mono text-white/35">{shortAddr(sub.participant.walletAddress)}</span>
                              <CopyBtn text={sub.participant.walletAddress} />
                            </div>
                          </div>
                        </td>

                        {/* Pool */}
                        <td className="px-3 py-3">
                          <Link href={`/admin/pools/${sub.pool.id}`}
                            className="hover:text-[#0088CC] transition-colors">
                            <p className="text-white/70 font-medium truncate max-w-[120px]">{sub.pool.name}</p>
                            <p className="text-white/30 font-mono">${sub.pool.tokenSymbol}</p>
                          </Link>
                        </td>

                        {/* Views */}
                        <td className="px-3 py-3 text-white/65 tabular-nums">{fmt(views)}</td>

                        {/* Engagement */}
                        <td className="px-3 py-3 text-white/45 tabular-nums whitespace-nowrap">
                          {sub.platform === 'X'
                            ? <span>♥ {fmt(likes)} · ↺ {fmt(reposts)}</span>
                            : <span>⚡ {fmt(reactions)}</span>}
                        </td>

                        {/* Points */}
                        <td className="px-3 py-3">
                          <span className={`font-semibold tabular-nums ${points >= 1000 ? 'text-yellow-400' : points >= 100 ? 'text-[#0088CC]' : 'text-white/55'}`}>
                            {Math.round(points).toLocaleString()}
                          </span>
                        </td>

                        {/* Submitted */}
                        <td className="px-3 py-3 text-white/30 whitespace-nowrap">
                          {new Date(sub.submittedAt).toLocaleDateString()}
                        </td>

                        {/* Last scraped */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {lastScraped
                            ? <span className="text-white/30">{new Date(lastScraped).toLocaleDateString()}</span>
                            : <span className="text-white/15">—</span>}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => rescrape(sub.id)}
                            disabled={scraping[sub.id]}
                            title="Re-scrape"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 text-white/40 hover:text-white hover:border-white/30 transition-all disabled:opacity-30 text-xs"
                          >
                            {scraping[sub.id]
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RefreshCw className="w-3 h-3" />}
                            <span className="hidden sm:inline">Scrape</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-white/25">
                {fmt((pagination.page - 1) * pagination.pageSize + 1)}–{fmt(Math.min(pagination.page * pagination.pageSize, pagination.total))} of {fmt(pagination.total)}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/25 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const start = Math.max(1, pagination.page - 2);
                  const p = start + i;
                  if (p > pagination.totalPages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`min-w-[32px] h-8 rounded-lg border text-xs font-medium transition-all ${p === pagination.page ? 'bg-[#0088CC] border-[#0088CC] text-white' : 'border-white/10 text-white/40 hover:text-white hover:border-white/25'}`}>
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/25 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Simple count when only one page */}
          {pagination && pagination.totalPages <= 1 && submissions.length > 0 && !loading && (
            <div className="px-4 py-3 border-t border-white/5 text-xs text-white/25 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              {fmt(pagination.total)} submission{pagination.total !== 1 ? 's' : ''}
              {hasFilters && ` · filtered`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
