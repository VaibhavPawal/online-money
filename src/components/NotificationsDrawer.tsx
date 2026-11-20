import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { AppNotification } from '../types';
import { formatRelativeTime } from '../utils/geo';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onSelectNotification: (n: AppNotification) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onSelectNotification,
}) => {
  if (!open) return null;

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0B192C]/50 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0B192C]" />
            <h2 className="text-base font-display font-bold text-[#0B192C]">Notifications</h2>
            {unread > 0 && <span className="font-mono text-xs text-emerald-700 font-semibold">({unread} unread)</span>}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              You&apos;re all caught up. Alerts for nearby matches, connection requests, and chats will appear here.
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.notificationId}
                type="button"
                onClick={() => {
                  if (!n.isRead) onMarkRead(n.notificationId);
                  onSelectNotification(n);
                  onClose();
                }}
                className={`w-full text-left px-5 py-4 transition-colors cursor-pointer ${
                  n.isRead ? 'bg-white hover:bg-slate-50' : 'bg-emerald-50/50 hover:bg-emerald-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold ${n.isRead ? 'text-slate-700' : 'text-[#0B192C]'}`}>
                    {n.title}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
