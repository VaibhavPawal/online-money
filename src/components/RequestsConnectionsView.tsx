import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  ShieldCheck,
  Clock,
  Star,
  Flag,
  Ban,
  AlertTriangle,
  X,
} from 'lucide-react';
import { ConnectionRecord, ExchangeRequest, UserProfile } from '../types';
import { formatINR, formatRelativeTime, formatTimeRemaining } from '../utils/geo';
import { apiRequest } from '../lib/api';

interface RequestsConnectionsViewProps {
  user: UserProfile;
  myRequests: ExchangeRequest[];
  connections: ConnectionRecord[];
  onRefreshAll: () => void;
  onOpenChat: (connectionId: string) => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'text-emerald-700',
  pending: 'text-amber-700',
  accepted: 'text-emerald-700',
  matched: 'text-emerald-700',
  completed: 'text-[#0B192C]',
  rejected: 'text-red-700',
  cancelled: 'text-slate-500',
  expired: 'text-slate-500',
};

export const RequestsConnectionsView: React.FC<RequestsConnectionsViewProps> = ({
  user,
  myRequests,
  connections,
  onRefreshAll,
  onOpenChat,
  onToast,
}) => {
  const [subTab, setSubTab] = useState<'connections' | 'my_requests'>('connections');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Rating modal
  const [rateTarget, setRateTarget] = useState<ConnectionRecord | null>(null);
  const [stars, setStars] = useState(5);
  const [reviewText, setReviewText] = useState('');

  // Report modal
  const [reportTarget, setReportTarget] = useState<{ uid: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState('Suspicious financial request / asked for OTP or PIN');
  const [reportDetails, setReportDetails] = useState('');

  const handleCloseRequest = async (requestId: string, status: 'cancelled' | 'completed') => {
    setBusyId(requestId);
    try {
      await apiRequest(`/api/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onToast(`Request marked ${status}.`);
      onRefreshAll();
    } catch (err: any) {
      onToast(err.message || 'Unable to update request.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRespondConnection = async (connectionId: string, action: 'accept' | 'reject' | 'cancel') => {
    setBusyId(connectionId);
    try {
      await apiRequest(`/api/connections/${connectionId}/respond`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      onToast(
        action === 'accept'
          ? 'Connection accepted! Private 1:1 chat is now unlocked.'
          : action === 'reject'
          ? 'Connection declined.'
          : 'Pending request cancelled.'
      );
      onRefreshAll();
    } catch (err: any) {
      onToast(err.message || 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmComplete = async (connectionId: string) => {
    setBusyId(connectionId);
    try {
      const res = await apiRequest<{ status: string }>(`/api/connections/${connectionId}/confirm-complete`, {
        method: 'POST',
      });
      onToast(
        res.status === 'completed'
          ? 'Both users confirmed! Exchange record is now marked Completed.'
          : 'Your completion confirmation is recorded. Waiting for the other user to confirm independently.'
      );
      onRefreshAll();
    } catch (err: any) {
      onToast(err.message || 'Unable to confirm completion.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const submitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateTarget) return;
    setBusyId(rateTarget.connectionId);
    try {
      await apiRequest('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: rateTarget.connectionId,
          rating: stars,
          review: reviewText,
        }),
      });
      onToast('Thank you — your trust rating has been recorded.');
      setRateTarget(null);
      setReviewText('');
      onRefreshAll();
    } catch (err: any) {
      onToast(err.message || 'Could not submit rating.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          reportedUserId: reportTarget.uid,
          reason: reportReason,
          details: reportDetails,
        }),
      });
      onToast('Safety report submitted to CashBridge administrators.');
      setReportTarget(null);
      setReportDetails('');
    } catch (err: any) {
      onToast(err.message || 'Unable to submit report.', 'error');
    }
  };

  const handleBlockUser = async (uid: string, name: string) => {
    try {
      await apiRequest('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedUserId: uid }),
      });
      onToast(`${name} has been blocked. They can no longer view your requests or message you.`);
      onRefreshAll();
    } catch (err: any) {
      onToast(err.message || 'Unable to block user.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-[#0B192C]">Requests &amp; Connection Records</h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Manage incoming requests, independent dual-confirmed exchange records, and your active postings.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 self-start">
          <button
            type="button"
            onClick={() => setSubTab('connections')}
            className={`px-3.5 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'connections' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
            }`}
          >
            Connections ({connections.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('my_requests')}
            className={`px-3.5 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'my_requests' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
            }`}
          >
            My Requests ({myRequests.length})
          </button>
        </div>
      </div>

      {/* Explicit non-settlement record notice */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <span>
          <strong>Record Disclaimer:</strong> Connection history logs coordination status only. Dual completion confirmation is <strong>not</strong> proof of actual bank or UPI settlement—always verify funds independently inside your official banking app.
        </span>
      </div>

      {subTab === 'connections' ? (
        connections.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-[#0B192C]">No connections yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Send a connection request from the Nearby tab or wait for a neighbor to connect with your active posting.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {connections.map((conn) => {
              const isIncoming = conn.receiverId === user.uid;
              const myConfirmed = conn.requesterId === user.uid ? conn.requesterConfirmed : conn.receiverConfirmed;
              const otherConfirmed = conn.requesterId === user.uid ? conn.receiverConfirmed : conn.requesterConfirmed;

              return (
                <article
                  key={conn.connectionId}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#0B192C] text-white flex items-center justify-center font-display font-bold text-sm shrink-0 overflow-hidden">
                        {conn.otherUser.profileImage ? (
                          <img src={conn.otherUser.profileImage} alt={conn.otherUser.name} className="w-full h-full object-cover" />
                        ) : (
                          conn.otherUser.name[0]?.toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-sm font-bold text-[#0B192C]">{conn.otherUser.name}</h3>
                          {conn.otherUser.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                          <span className="text-xs text-slate-400">·</span>
                          <span className={`text-xs font-semibold capitalize ${STATUS_STYLE[conn.status] || 'text-slate-600'}`}>
                            {conn.status}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-mono">
                          <span>ID: {conn.connectionId}</span>
                          <span>·</span>
                          <span>{isIncoming ? 'Incoming Request' : 'Sent by You'}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(conn.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <div className="font-mono text-lg font-bold text-[#0B192C] tabular-nums">
                        {formatINR(conn.agreedAmount)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {conn.paymentMethod} · {conn.requestType === 'need_cash' ? 'Cash Needed' : 'Online Needed'}
                      </div>
                    </div>
                  </div>

                  {/* Dual Confirmation Status Bar for Accepted / Completed */}
                  {(conn.status === 'accepted' || conn.status === 'completed') && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${myConfirmed ? 'text-emerald-700' : 'text-slate-500'}`}>
                          <CheckCircle2 className="w-4 h-4" />
                          Your confirmation: {myConfirmed ? 'Confirmed' : 'Pending'}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 font-medium ${otherConfirmed ? 'text-emerald-700' : 'text-slate-500'}`}>
                          <CheckCircle2 className="w-4 h-4" />
                          {conn.otherUser.name.split(' ')[0]}: {otherConfirmed ? 'Confirmed' : 'Pending'}
                        </span>
                      </div>
                      {conn.status === 'accepted' && !myConfirmed && (
                        <button
                          type="button"
                          disabled={busyId === conn.connectionId}
                          onClick={() => handleConfirmComplete(conn.connectionId)}
                          className="px-3.5 py-2 min-h-[38px] rounded-lg bg-[#0B192C] text-white text-xs font-semibold hover:bg-[#10243E] disabled:opacity-50 cursor-pointer"
                        >
                          Confirm Exchange Completed
                        </button>
                      )}
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      {conn.status === 'pending' && isIncoming && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === conn.connectionId}
                            onClick={() => handleRespondConnection(conn.connectionId, 'accept')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Accept &amp; Unlock Chat</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyId === conn.connectionId}
                            onClick={() => handleRespondConnection(conn.connectionId, 'reject')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {conn.status === 'pending' && !isIncoming && (
                        <button
                          type="button"
                          disabled={busyId === conn.connectionId}
                          onClick={() => handleRespondConnection(conn.connectionId, 'cancel')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel Pending Request
                        </button>
                      )}

                      {(conn.status === 'accepted' || conn.status === 'completed') && (
                        <button
                          type="button"
                          onClick={() => onOpenChat(conn.connectionId)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Open Chat{conn.unreadCount > 0 ? ` (${conn.unreadCount})` : ''}</span>
                        </button>
                      )}

                      {conn.status === 'completed' && !conn.hasRated && (
                        <button
                          type="button"
                          onClick={() => {
                            setRateTarget(conn);
                            setStars(5);
                            setReviewText('');
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold hover:bg-amber-100 cursor-pointer"
                        >
                          <Star className="w-4 h-4 text-amber-500" />
                          <span>Rate {conn.otherUser.name.split(' ')[0]}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReportTarget({ uid: conn.otherUser.uid, name: conn.otherUser.name })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>Report</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBlockUser(conn.otherUser.uid, conn.otherUser.name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Block</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : myRequests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-semibold text-[#0B192C]">You haven&apos;t posted any requests yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Head to the Home dashboard to post an &ldquo;I Need Cash&rdquo; or &ldquo;I Need Online Money&rdquo; listing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {myRequests.map((req) => (
            <div
              key={req.requestId}
              className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold text-[#0B192C] tabular-nums">
                    {formatINR(req.amount)}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {req.requestType === 'need_cash' ? 'I Need Cash' : 'I Need Online Money'}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className={`text-xs font-semibold capitalize ${STATUS_STYLE[req.status] || 'text-slate-600'}`}>
                    {req.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  <span>{req.paymentMethod}</span>
                  <span>·</span>
                  <span>{req.areaLabel}</span>
                  <span>·</span>
                  <span className="font-mono">Radius {req.radiusMeters < 1000 ? `${req.radiusMeters}m` : `${req.radiusMeters / 1000}KM`}</span>
                  {req.status === 'active' && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatTimeRemaining(req.expiresAt)}
                      </span>
                    </>
                  )}
                </div>
                {req.description && <p className="mt-1.5 text-xs text-slate-600">{req.description}</p>}
              </div>

              {req.status === 'active' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === req.requestId}
                    onClick={() => handleCloseRequest(req.requestId, 'completed')}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl bg-[#0B192C] text-white text-xs font-semibold hover:bg-[#10243E] cursor-pointer"
                  >
                    Close Completed
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.requestId}
                    onClick={() => handleCloseRequest(req.requestId, 'cancelled')}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Rating Modal */}
      {rateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitRating} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-[#0B192C]">
                Rate {rateTarget.otherUser.name}
              </h3>
              <button type="button" onClick={() => setRateTarget(null)} className="p-2 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Help keep CashBridge trustworthy by sharing your experience for this {formatINR(rateTarget.agreedAmount)} exchange.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-amber-50 cursor-pointer"
                >
                  <Star className={`w-6 h-6 ${n <= stars ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />
                </button>
              ))}
            </div>
            <div className="mt-4">
              <label htmlFor="rating-review" className="block text-xs font-medium text-slate-700 mb-1.5">
                Review (Optional)
              </label>
              <textarea
                id="rating-review"
                rows={3}
                maxLength={400}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Punctual, verified UPI smoothly in a public cafe."
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setRateTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
              >
                Submit Rating
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Report User Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitReport} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-[#0B192C]">Report {reportTarget.name}</h3>
              <button type="button" onClick={() => setReportTarget(null)} className="p-2 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
                >
                  <option>Suspicious financial request / asked for OTP or PIN</option>
                  <option>Counterfeit or damaged currency concern</option>
                  <option>Harassment or abusive language</option>
                  <option>Spam or repeated fake requests</option>
                  <option>No-show or dishonest behavior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Details</label>
                <textarea
                  rows={3}
                  required
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Describe what happened so our moderation team can investigate..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                Submit Safety Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
