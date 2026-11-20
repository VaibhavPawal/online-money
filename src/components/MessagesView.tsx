import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  ShieldCheck,
  Check,
  CheckCheck,
  Ban,
  Flag,
  ArrowLeft,
  MessageSquareLock,
  AlertTriangle,
  X,
} from 'lucide-react';
import { ChatMessage, ConnectionRecord, UserProfile } from '../types';
import { apiRequest } from '../lib/api';
import { formatINR, formatRelativeTime } from '../utils/geo';

interface MessagesViewProps {
  user: UserProfile;
  connections: ConnectionRecord[];
  selectedConnectionId: string | null;
  onSelectConnection: (id: string | null) => void;
  incomingWsMessage: ChatMessage | null;
  readReceiptEvent: { conversationId: string; readerId: string } | null;
  onRefreshConnections: () => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  user,
  connections,
  selectedConnectionId,
  onSelectConnection,
  incomingWsMessage,
  readReceiptEvent,
  onRefreshConnections,
  onToast,
}) => {
  const chatable = connections.filter((c) => c.status === 'accepted' || c.status === 'completed');
  const activeConn = chatable.find((c) => c.connectionId === selectedConnectionId) || null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Asked for OTP, UPI PIN, or banking password');
  const [reportDetails, setReportDetails] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeConn) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMsgs(true);
    apiRequest<{ messages: ChatMessage[] }>(`/api/connections/${activeConn.connectionId}/messages`)
      .then((res) => {
        if (!cancelled) {
          setMessages(res.messages);
          onRefreshConnections();
        }
      })
      .catch((err) => {
        if (!cancelled) onToast(err.message || 'Unable to load conversation.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingMsgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConn?.connectionId]);

  // Append incoming WebSocket message live (idempotent)
  useEffect(() => {
    if (!incomingWsMessage || !activeConn) return;
    if (incomingWsMessage.conversationId !== activeConn.connectionId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.messageId === incomingWsMessage.messageId)) return prev;
      return [...prev, incomingWsMessage];
    });
    if (incomingWsMessage.recipientId === user.uid) {
      // Trigger read mark
      apiRequest(`/api/connections/${activeConn.connectionId}/messages`).catch(() => {});
    }
  }, [incomingWsMessage, activeConn?.connectionId, user.uid]);

  // Update read receipts live
  useEffect(() => {
    if (!readReceiptEvent || !activeConn) return;
    if (readReceiptEvent.conversationId !== activeConn.connectionId) return;
    setMessages((prev) =>
      prev.map((m) => (m.senderId === user.uid ? { ...m, readStatus: true } : m))
    );
  }, [readReceiptEvent, activeConn?.connectionId, user.uid]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConn || !draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await apiRequest<{ message: ChatMessage }>(
        `/api/connections/${activeConn.connectionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text: draft.trim() }),
        }
      );
      setMessages((prev) =>
        prev.some((m) => m.messageId === res.message.messageId) ? prev : [...prev, res.message]
      );
      setDraft('');
      onRefreshConnections();
    } catch (err: any) {
      onToast(err.message || 'Message failed to send.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleBlock = async () => {
    if (!activeConn) return;
    try {
      await apiRequest('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedUserId: activeConn.otherUser.uid }),
      });
      onToast(`${activeConn.otherUser.name} blocked.`);
      onSelectConnection(null);
      onRefreshConnections();
    } catch (err: any) {
      onToast(err.message || 'Unable to block user.', 'error');
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConn) return;
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          reportedUserId: activeConn.otherUser.uid,
          reason: reportReason,
          details: reportDetails,
        }),
      });
      onToast('Safety report submitted.');
      setReportOpen(false);
      setReportDetails('');
    } catch (err: any) {
      onToast(err.message || 'Could not submit report.', 'error');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[560px] max-h-[75vh]">
      {/* Conversations List */}
      <aside
        className={`lg:col-span-4 border-r border-slate-200 flex flex-col ${
          activeConn ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-base font-display font-bold text-[#0B192C]">Private Exchange Chats</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Only mutually accepted connections can message here.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {chatable.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquareLock className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm font-semibold text-[#0B192C]">No active chats yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Accept an incoming connection request or wait for your neighbor to accept yours to start chatting.
              </p>
            </div>
          ) : (
            chatable.map((c) => {
              const isSelected = c.connectionId === activeConn?.connectionId;
              return (
                <button
                  key={c.connectionId}
                  type="button"
                  onClick={() => onSelectConnection(c.connectionId)}
                  className={`w-full p-4 text-left flex items-start gap-3 transition-colors cursor-pointer ${
                    isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-[#0B192C] text-white flex items-center justify-center font-display font-bold text-sm overflow-hidden">
                      {c.otherUser.profileImage ? (
                        <img src={c.otherUser.profileImage} alt={c.otherUser.name} className="w-full h-full object-cover" />
                      ) : (
                        c.otherUser.name[0]?.toUpperCase()
                      )}
                    </div>
                    {c.otherUser.isOnline && (
                      <span
                        title="Online now"
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#0B192C] truncate">{c.otherUser.name}</span>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {formatINR(c.agreedAmount)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500 truncate">
                        {c.lastMessageText || 'Connection accepted — say hello to coordinate meetup'}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 font-mono text-[11px] font-bold text-emerald-700">
                          {c.unreadCount} new
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Active Chat Thread */}
      <section
        className={`lg:col-span-8 flex flex-col bg-slate-50/40 ${
          activeConn ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {!activeConn ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <MessageSquareLock className="w-9 h-9 text-slate-300" />
            <h2 className="mt-3 text-base font-bold text-[#0B192C]">Select a conversation</h2>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Phone numbers are hidden for privacy. Coordinate a safe public meeting point directly in this real-time chat.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectConnection(null)}
                  className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[#0B192C] truncate">{activeConn.otherUser.name}</span>
                    {activeConn.otherUser.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {activeConn.otherUser.isOnline ? 'Online' : 'Offline'} · {formatINR(activeConn.agreedAmount)} · {activeConn.paymentMethod}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-lg text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Report</span>
                </button>
                <button
                  type="button"
                  onClick={handleBlock}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-lg text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Block</span>
                </button>
              </div>
            </div>

            {/* Persistent Chat Safety Reminder */}
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[11px] text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Meet in safe public locations · Never share UPI PINs or OTPs · Verify payment in your official bank/UPI app.
              </span>
            </div>

            {/* Messages Scroll Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="text-center text-xs text-slate-400 py-8">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-8">
                  Start coordinating your {formatINR(activeConn.agreedAmount)} meetup here.
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === user.uid;
                  return (
                    <div key={m.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                          mine
                            ? 'bg-[#0B192C] text-white rounded-br-sm'
                            : 'bg-white border border-slate-200 text-[#0F172A] rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] font-mono ${
                            mine ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          <span>{formatRelativeTime(m.timestamp)}</span>
                          {mine &&
                            (m.readStatus ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-slate-400" />
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Composer */}
            <form onSubmit={handleSend} className="bg-white border-t border-slate-200 p-3 flex items-center gap-2.5">
              <input
                type="text"
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message (suggest a public cafe or landmark)..."
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send message"
                className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </section>

      {/* Report Modal inside Chat */}
      {reportOpen && activeConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleReportSubmit} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0B192C]">Report {activeConn.otherUser.name}</h3>
              <button type="button" onClick={() => setReportOpen(false)} className="p-2 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option>Asked for OTP, UPI PIN, or banking password</option>
                <option>Harassment or unsafe behavior</option>
                <option>Suspected fraud or scam attempt</option>
                <option>Spam messages</option>
              </select>
              <textarea
                rows={3}
                required
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Provide details for our moderation team..."
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
