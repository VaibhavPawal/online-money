import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldAlert,
  Users,
  FileText,
  Sliders,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  AdminOverview,
  ExchangeRequest,
  PlatformConfig,
  ReportRecord,
  UserProfile,
} from '../types';
import { apiRequest } from '../lib/api';
import { formatINR, formatRelativeTime } from '../utils/geo';

interface AdminDashboardViewProps {
  platformConfig: PlatformConfig;
  onConfigUpdated: (cfg: PlatformConfig) => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

type AdminTab = 'overview' | 'users' | 'requests' | 'reports' | 'settings';

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  platformConfig,
  onConfigUpdated,
  onToast,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Platform settings form
  const [minAmount, setMinAmount] = useState(String(platformConfig.minAmount));
  const [maxAmount, setMaxAmount] = useState(String(platformConfig.maxAmount));
  const [radiiCsv, setRadiiCsv] = useState(platformConfig.supportedRadii.join(', '));
  const [defaultRadius, setDefaultRadius] = useState(String(platformConfig.defaultRadius));
  const [maxActiveRequests, setMaxActiveRequests] = useState(String(platformConfig.maxActiveRequests));
  const [savingConfig, setSavingConfig] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, us, rq, rp] = await Promise.all([
        apiRequest<AdminOverview>('/api/admin/overview'),
        apiRequest<{ users: UserProfile[] }>('/api/admin/users'),
        apiRequest<{ requests: ExchangeRequest[] }>('/api/admin/requests'),
        apiRequest<{ reports: ReportRecord[] }>('/api/admin/reports'),
      ]);
      setOverview(ov);
      setUsers(us.users);
      setRequests(rq.requests);
      setReports(rp.reports);
    } catch (err: any) {
      onToast(err.message || 'Failed to load admin telemetry.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const mutateUser = async (uid: string, patch: { isSuspended?: boolean; isVerified?: boolean; kycStatus?: string }) => {
    try {
      await apiRequest(`/api/admin/users/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onToast('User account updated.');
      loadAll();
    } catch (err: any) {
      onToast(err.message || 'Unable to update user.', 'error');
    }
  };

  const mutateRequest = async (requestId: string, status: string) => {
    try {
      await apiRequest(`/api/admin/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onToast(`Request status changed to ${status}.`);
      loadAll();
    } catch (err: any) {
      onToast(err.message || 'Unable to update request.', 'error');
    }
  };

  const mutateReport = async (reportId: string, status: string) => {
    try {
      await apiRequest(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNote: `Reviewed by admin (${status})` }),
      });
      onToast(`Report marked ${status}.`);
      loadAll();
    } catch (err: any) {
      onToast(err.message || 'Unable to update report.', 'error');
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const parsedRadii = radiiCsv
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 250);
      const res = await apiRequest<{ platformConfig: PlatformConfig }>('/api/admin/config', {
        method: 'PATCH',
        body: JSON.stringify({
          minAmount: Number(minAmount),
          maxAmount: Number(maxAmount),
          supportedRadii: parsedRadii,
          defaultRadius: Number(defaultRadius),
          maxActiveRequests: Number(maxActiveRequests),
        }),
      });
      onConfigUpdated(res.platformConfig);
      onToast('Platform limits and radius settings updated live.');
    } catch (err: any) {
      onToast(err.message || 'Could not update configuration.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.phoneNumber.includes(userSearch) ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-[#0B192C] text-white p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold">CashBridge Admin Console</h1>
          <p className="mt-1 text-xs text-slate-300">
            Role-based moderation, platform limits, user verification, and suspicious activity audit log.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white self-start md:self-center cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 w-fit">
        {(
          [
            { id: 'overview', label: 'Analytics & Audit', icon: BarChart3 },
            { id: 'users', label: `Users (${users.length})`, icon: Users },
            { id: 'requests', label: `Requests (${requests.length})`, icon: FileText },
            { id: 'reports', label: `Reports (${overview?.metrics.openReports ?? 0})`, icon: ShieldAlert },
            { id: 'settings', label: 'Platform Limits', icon: Sliders },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === item.id ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600 hover:text-[#0B192C]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', val: overview.metrics.totalUsers },
              { label: 'Verified Users', val: overview.metrics.verifiedUsers },
              { label: 'Online Active', val: overview.metrics.activeUsers },
              { label: 'Active Requests', val: overview.metrics.activeRequests },
              { label: 'Total Connections', val: overview.metrics.totalConnections },
              { label: 'Completed Exchanges', val: overview.metrics.completedConnections },
              { label: 'Open Safety Reports', val: overview.metrics.openReports, alert: overview.metrics.openReports > 0 },
              { label: 'Suspended Accounts', val: overview.metrics.suspendedAccounts },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">{stat.label}</div>
                <div
                  className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
                    stat.alert ? 'text-red-700' : 'text-[#0B192C]'
                  }`}
                >
                  {stat.val}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-display font-bold text-[#0B192C]">7-Day Platform Activity</h2>
              <p className="text-xs text-slate-500 mt-0.5">Requests posted vs connections initiated and completed</p>
              <div className="mt-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.dailyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar dataKey="requests" name="Requests" fill="#0B192C" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="connections" name="Connections" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="#64748B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-display font-bold text-[#0B192C]">Suspicious Activity &amp; Audit Log</h2>
              <p className="text-xs text-slate-500 mt-0.5">Rate limits, duplicate blocks, reports, and admin actions</p>
              <div className="mt-4 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {overview.auditEvents.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">No security or moderation events logged yet.</p>
                ) : (
                  overview.auditEvents.map((ev) => (
                    <div key={ev.id} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-[#0B192C]">{ev.eventType}</span>
                        <span className="font-mono text-[11px] text-slate-400">{formatRelativeTime(ev.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-slate-600">
                        {ev.userName ? `${ev.userName}: ` : ''}
                        {ev.detail}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Management Tab */}
      {tab === 'users' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-display font-bold text-[#0B192C]">User Directory</h2>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search name, phone, email..."
              className="w-full sm:w-64 min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Mobile / Email</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Exchanges</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0B192C] flex items-center gap-1.5">
                        <span>{u.name}</span>
                        {u.role === 'admin' && <span className="font-mono text-[10px] text-emerald-700">ADMIN</span>}
                      </div>
                      <div className="text-[11px] text-slate-500">{u.approximateArea || 'No area set'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      <div>{u.phoneNumber}</div>
                      {u.email && <div className="text-[11px] text-slate-500 font-sans">{u.email}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className={u.isSuspended ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                        {u.isSuspended ? 'Suspended' : u.isVerified ? 'Verified' : 'Unverified'}
                      </div>
                      <div className="text-[11px] text-slate-500">KYC: {u.kycStatus}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {u.completedConnections}/{u.totalConnections}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {u.kycStatus === 'pending' && (
                          <button
                            type="button"
                            onClick={() => mutateUser(u.uid, { kycStatus: 'verified' })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Approve KYC
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => mutateUser(u.uid, { isSuspended: !u.isSuspended })}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                            u.isSuspended
                              ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                              : 'border-red-200 text-red-700 hover:bg-red-50'
                          }`}
                        >
                          {u.isSuspended ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                            </>
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5" /> Suspend
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Requests Moderation Tab */}
      {tab === 'requests' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-base font-display font-bold text-[#0B192C]">Exchange Requests Moderation</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Type &amp; Method</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold">Area</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Moderate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.requestId}>
                    <td className="py-3 px-4 font-semibold text-[#0B192C]">{r.userName}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {r.requestType === 'need_cash' ? 'Need Cash' : 'Need Online'} · {r.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">{formatINR(r.amount)}</td>
                    <td className="py-3 px-4 text-slate-600">{r.areaLabel}</td>
                    <td className="py-3 px-4 capitalize font-semibold">{r.status}</td>
                    <td className="py-3 px-4 text-right">
                      {r.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => mutateRequest(r.requestId, 'cancelled')}
                          className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 font-semibold hover:bg-red-50 cursor-pointer"
                        >
                          Remove Listing
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Safety Reports Tab */}
      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
              No user safety reports filed yet.
            </div>
          ) : (
            reports.map((rep) => (
              <div key={rep.reportId} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-[#0B192C]">
                      Reported: {rep.reportedUserName}
                    </span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="text-xs text-slate-500">By {rep.reporterName}</span>
                  </div>
                  <span className="font-mono text-xs uppercase font-semibold text-amber-700">{rep.status}</span>
                </div>
                <div className="text-xs font-semibold text-red-700">{rep.reason}</div>
                {rep.details && <p className="text-xs text-slate-600">{rep.details}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => mutateReport(rep.reportId, 'resolved')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                  >
                    Mark Resolved
                  </button>
                  <button
                    type="button"
                    onClick={() => mutateReport(rep.reportId, 'dismissed')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => mutateUser(rep.reportedUserId, { isSuspended: true })}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    Suspend Reported User
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Platform Config Tab */}
      {tab === 'settings' && (
        <form onSubmit={saveConfig} className="rounded-2xl border border-slate-200 bg-white p-6 max-w-2xl space-y-4">
          <h2 className="text-base font-display font-bold text-[#0B192C]">
            Configure Request Amount Limits &amp; Search Radius
          </h2>
          <p className="text-xs text-slate-600">
            Changes apply immediately to all users creating new exchange requests.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Minimum Amount (₹)</label>
              <input
                type="number"
                required
                min={50}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Maximum Amount (₹)</label>
              <input
                type="number"
                required
                min={500}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Supported Radii in Metres (comma separated)
              </label>
              <input
                type="text"
                required
                value={radiiCsv}
                onChange={(e) => setRadiiCsv(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Default Radius (m)</label>
              <input
                type="number"
                required
                value={defaultRadius}
                onChange={(e) => setDefaultRadius(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Max Simultaneous Active Requests per User (Anti-Spam)
            </label>
            <input
              type="number"
              required
              min={1}
              max={10}
              value={maxActiveRequests}
              onChange={(e) => setMaxActiveRequests(e.target.value)}
              className="w-32 min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={savingConfig}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
          >
            {savingConfig ? 'Saving Settings...' : 'Save Platform Configuration'}
          </button>
        </form>
      )}
    </div>
  );
};
