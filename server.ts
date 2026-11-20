import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { WebSocketServer, WebSocket } from 'ws';
import {
  encodeGeohash,
  formatApproximateDistance,
  fuzzCoordinatesForPrivacy,
  haversineDistanceMeters,
} from './src/utils/geo.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_BOOTSTRAP_EMAIL = 'pawalvaibhav13@gmail.com';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// Initialize SQLite database with WAL mode
const DB_PATH = path.resolve(process.cwd(), 'cashbridge.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    profile_image TEXT,
    date_of_birth TEXT NOT NULL,
    age_confirmed_18 INTEGER NOT NULL DEFAULT 1,
    terms_accepted_at TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    mobile_verified INTEGER NOT NULL DEFAULT 1,
    kyc_status TEXT NOT NULL DEFAULT 'none',
    role TEXT NOT NULL DEFAULT 'user',
    is_suspended INTEGER NOT NULL DEFAULT 0,
    is_online INTEGER NOT NULL DEFAULT 0,
    location_sharing_enabled INTEGER NOT NULL DEFAULT 1,
    approximate_area TEXT,
    approx_lat REAL,
    approx_lng REAL,
    rating_avg REAL NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    total_connections INTEGER NOT NULL DEFAULT 0,
    completed_connections INTEGER NOT NULL DEFAULT 0,
    notification_prefs TEXT NOT NULL DEFAULT '{"matches":true,"connections":true,"messages":true,"expiry":true,"verification":true}',
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS requests (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('need_cash', 'need_online')),
    amount INTEGER NOT NULL,
    available_cash_amount INTEGER,
    payment_method TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    radius_meters INTEGER NOT NULL DEFAULT 1000,
    approx_lat REAL NOT NULL,
    approx_lng REAL NOT NULL,
    area_label TEXT NOT NULL,
    geohash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'matched', 'completed', 'cancelled', 'expired')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS connections (
    connection_id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    agreed_amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'expired')),
    requester_confirmed INTEGER NOT NULL DEFAULT 0,
    receiver_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (requester_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    read_status INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES connections(connection_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    reported_user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    admin_note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (reporter_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    rating_id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    reviewer_id TEXT NOT NULL,
    reviewed_user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (connection_id, reviewer_id),
    FOREIGN KEY (connection_id) REFERENCES connections(connection_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_user_id) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS platform_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    min_amount INTEGER NOT NULL DEFAULT 500,
    max_amount INTEGER NOT NULL DEFAULT 25000,
    supported_radii TEXT NOT NULL DEFAULT '[500,1000,2000,5000]',
    default_radius INTEGER NOT NULL DEFAULT 1000,
    max_active_requests INTEGER NOT NULL DEFAULT 3,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    topic TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_requests_status_expires ON requests(status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_connections_users ON connections(requester_id, receiver_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
`);

// Seed default platform config (INR 500 to INR 25,000 per confirmed user choice)
const existingConfig = db.prepare('SELECT id FROM platform_config WHERE id = 1').get();
if (!existingConfig) {
  db.prepare(`
    INSERT INTO platform_config (id, min_amount, max_amount, supported_radii, default_radius, max_active_requests, updated_at)
    VALUES (1, 500, 25000, '[500,1000,2000,5000]', 1000, 3, ?)
  `).run(new Date().toISOString());
}

// Crypto helpers
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}

function isAtLeast18(dobIso: string): boolean {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 18 && age <= 110;
}

function getPlatformConfig() {
  const row = db.prepare('SELECT * FROM platform_config WHERE id = 1').get() as any;
  return {
    minAmount: row.min_amount,
    maxAmount: row.max_amount,
    supportedRadii: JSON.parse(row.supported_radii) as number[],
    defaultRadius: row.default_radius,
    maxActiveRequests: row.max_active_requests,
    updatedAt: row.updated_at,
  };
}

function logAudit(userId: string | null, eventType: string, detail: string) {
  db.prepare(
    'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)'
  ).run(userId, eventType, detail, new Date().toISOString());
}

function expireStaleRequests() {
  const now = new Date().toISOString();
  const stale = db
    .prepare("SELECT request_id, user_id, amount, request_type FROM requests WHERE status = 'active' AND expires_at <= ?")
    .all(now) as any[];
  if (stale.length > 0) {
    db.prepare("UPDATE requests SET status = 'expired' WHERE status = 'active' AND expires_at <= ?").run(now);
    for (const r of stale) {
      createNotification(
        r.user_id,
        'request_expiry',
        'Exchange request expired',
        `Your ₹${r.amount.toLocaleString('en-IN')} ${r.request_type === 'need_cash' ? 'Need Cash' : 'Need Online Money'} request has expired.`,
        r.request_id
      );
    }
  }
}

// Real-time WebSocket registry
const userSockets = new Map<string, Set<WebSocket>>();

function pushToUser(userId: string, event: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const frame = JSON.stringify({ event, payload });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(frame);
    }
  }
}

function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  relatedId: string | null = null
) {
  const id = newId('ntf');
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO notifications (notification_id, user_id, type, title, message, related_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(id, userId, type, title, message, relatedId, now);
  pushToUser(userId, 'notification:new', {
    notificationId: id,
    userId,
    type,
    title,
    message,
    relatedId,
    isRead: false,
    createdAt: now,
  });
}

function serializePrivateUser(row: any) {
  const blocks = db
    .prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ?')
    .all(row.uid) as Array<{ blocked_id: string }>;
  return {
    uid: row.uid,
    name: row.name,
    phoneNumber: row.phone_number,
    email: row.email,
    profileImage: row.profile_image,
    dateOfBirth: row.date_of_birth,
    isVerified: Boolean(row.is_verified),
    mobileVerified: Boolean(row.mobile_verified),
    kycStatus: row.kyc_status,
    role: row.role,
    isSuspended: Boolean(row.is_suspended),
    isOnline: Boolean(row.is_online),
    locationSharingEnabled: Boolean(row.location_sharing_enabled),
    approximateArea: row.approximate_area,
    approxLat: row.approx_lat,
    approxLng: row.approx_lng,
    ratingAvg: Number(row.rating_avg || 0),
    ratingCount: Number(row.rating_count || 0),
    totalConnections: Number(row.total_connections || 0),
    completedConnections: Number(row.completed_connections || 0),
    notificationPrefs: JSON.parse(row.notification_prefs || '{}'),
    blockedUserIds: blocks.map((b) => b.blocked_id),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

function isMutuallyBlocked(uidA: string, uidB: string): boolean {
  const row = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1'
    )
    .get(uidA, uidB, uidB, uidA);
  return Boolean(row);
}

// Per-user message rate limiter (max 20 messages / 60s)
const messageRateWindow = new Map<string, number[]>();
function checkMessageRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (messageRateWindow.get(userId) || []).filter((t) => now - t < 60000);
  if (timestamps.length >= 20) {
    logAudit(userId, 'rate_limit_chat', 'User exceeded 20 messages/minute limit');
    return false;
  }
  timestamps.push(now);
  messageRateWindow.set(userId, timestamps);
  return true;
}

// Cookie parser helper
function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

interface AuthedRequest extends Request {
  user?: any;
  sessionToken?: string;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies.cb_session || null;
}

function getUserBySession(token: string | null) {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.uid = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now) as any;
  return row || null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const user = getUserBySession(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (user.is_suspended) {
    res.status(403).json({
      error: 'Your CashBridge account has been suspended by an administrator. Contact support for review.',
      code: 'ACCOUNT_SUSPENDED',
    });
    return;
  }
  req.user = user;
  req.sessionToken = token!;
  db.prepare('UPDATE users SET last_active_at = ? WHERE uid = ?').run(new Date().toISOString(), user.uid);
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      logAudit(req.user.uid, 'unauthorized_admin_access', `Attempted access to ${req.path}`);
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  });
}

function setSessionCookie(res: Response, token: string) {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `cb_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${maxAgeSec}`
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', 'cb_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1.5mb' }));

  // Public runtime configuration (Google Maps key + Firebase env status + Admin limits)
  app.get('/api/config/public', (_req, res) => {
    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const firebaseConfigured = Boolean(
      process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_PROJECT_ID
    );
    res.json({
      mapsApiKey,
      firebaseConfigured,
      platformConfig: getPlatformConfig(),
    });
  });

  // Contact form from Landing Page
  app.post('/api/contact', (req, res) => {
    const { name, email, topic, message } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Please enter your name.' });
      return;
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      res.status(400).json({ error: 'Please include a message of at least 10 characters.' });
      return;
    }
    db.prepare(
      'INSERT INTO contact_messages (name, email, topic, message, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      name.trim().slice(0, 120),
      email.trim().toLowerCase().slice(0, 160),
      String(topic || 'General Inquiry').slice(0, 80),
      message.trim().slice(0, 1500),
      new Date().toISOString()
    );
    res.status(201).json({ ok: true, message: 'Your inquiry has been received by the CashBridge team.' });
  });

  // Registration
  app.post('/api/auth/register', (req, res) => {
    const {
      name,
      phoneNumber,
      email,
      password,
      dateOfBirth,
      profileImage,
      termsAccepted,
      ageConfirmed18,
    } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }
    const normalizedPhone = normalizeIndianPhone(String(phoneNumber || ''));
    if (!normalizedPhone) {
      res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number (+91).' });
      return;
    }
    const cleanEmail = email && String(email).trim() ? String(email).trim().toLowerCase() : null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Enter a valid email address or leave it blank.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (!dateOfBirth || !isAtLeast18(String(dateOfBirth))) {
      res.status(400).json({ error: 'You must be at least 18 years old to register on CashBridge.' });
      return;
    }
    if (!termsAccepted || !ageConfirmed18) {
      res.status(400).json({ error: 'You must confirm you are 18+ and accept the Terms & Privacy Policy.' });
      return;
    }
    if (profileImage && (typeof profileImage !== 'string' || profileImage.length > 500000)) {
      res.status(400).json({ error: 'Profile photo must be smaller than 350 KB.' });
      return;
    }

    // Prevent duplicate registrations
    const dupPhone = db.prepare('SELECT uid FROM users WHERE phone_number = ?').get(normalizedPhone);
    if (dupPhone) {
      res.status(409).json({ error: 'An account with this +91 mobile number already exists. Please sign in.' });
      return;
    }
    if (cleanEmail) {
      const dupEmail = db.prepare('SELECT uid FROM users WHERE email = ?').get(cleanEmail);
      if (dupEmail) {
        res.status(409).json({ error: 'An account with this email address already exists.' });
        return;
      }
    }

    const uid = newId('usr');
    const now = new Date().toISOString();
    const isBootstrapAdmin = cleanEmail === ADMIN_BOOTSTRAP_EMAIL;
    const role = isBootstrapAdmin ? 'admin' : 'user';
    const isVerified = isBootstrapAdmin ? 1 : 1; // Mobile verified at onboarding; KYC remains optional

    db.prepare(`
      INSERT INTO users (
        uid, name, phone_number, email, password_hash, profile_image, date_of_birth,
        age_confirmed_18, terms_accepted_at, is_verified, mobile_verified, kyc_status,
        role, is_suspended, is_online, location_sharing_enabled, created_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, 'none', ?, 0, 1, 1, ?, ?)
    `).run(
      uid,
      name.trim(),
      normalizedPhone,
      cleanEmail,
      hashPassword(password),
      profileImage || null,
      String(dateOfBirth),
      now,
      isVerified,
      role,
      now,
      now
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      uid,
      expiresAt,
      now
    );

    createNotification(
      uid,
      'verification',
      'Welcome to CashBridge',
      isBootstrapAdmin
        ? 'Your account is active with Administrator privileges. Remember to verify payments independently in your official UPI/bank app.'
        : 'Your account is active. Enable GPS location to discover nearby cash and digital money exchange requests within 1 KM.',
      null
    );

    setSessionCookie(res, token);
    const created = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid);
    res.status(201).json({
      token,
      user: serializePrivateUser(created),
    });
  });

  // Login (Mobile +91 or Email + Password)
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      res.status(400).json({ error: 'Enter your mobile number (or email) and password.' });
      return;
    }
    const raw = String(identifier).trim();
    const normalizedPhone = normalizeIndianPhone(raw);
    const user = normalizedPhone
      ? (db.prepare('SELECT * FROM users WHERE phone_number = ?').get(normalizedPhone) as any)
      : (db.prepare('SELECT * FROM users WHERE email = ?').get(raw.toLowerCase()) as any);

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      res.status(401).json({ error: 'Invalid mobile number/email or password.' });
      return;
    }
    if (user.is_suspended) {
      res.status(403).json({
        error: 'This account is currently suspended. Contact an administrator for reinstatement.',
        code: 'ACCOUNT_SUSPENDED',
      });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      user.uid,
      expiresAt,
      now
    );
    db.prepare('UPDATE users SET is_online = 1, last_active_at = ? WHERE uid = ?').run(now, user.uid);

    setSessionCookie(res, token);
    const fresh = db.prepare('SELECT * FROM users WHERE uid = ?').get(user.uid);
    res.json({
      token,
      user: serializePrivateUser(fresh),
    });
  });

  // Forgot password check (does NOT fake SMS OTPs; verifies DOB + mobile for password reset only when verified)
  app.post('/api/auth/reset-password', (req, res) => {
    const { phoneNumber, dateOfBirth, newPassword } = req.body || {};
    const normalizedPhone = normalizeIndianPhone(String(phoneNumber || ''));
    if (!normalizedPhone || !dateOfBirth || !newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: 'Provide your registered +91 mobile number, date of birth, and a new password (8+ chars).' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE phone_number = ?').get(normalizedPhone) as any;
    if (!user || user.date_of_birth !== String(dateOfBirth)) {
      res.status(400).json({ error: 'Account details could not be verified. Check your mobile number and date of birth.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE uid = ?').run(hashPassword(String(newPassword)), user.uid);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.uid);
    logAudit(user.uid, 'password_reset', 'User reset password via DOB verification');
    res.json({ ok: true, message: 'Password updated successfully. Please sign in with your new password.' });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    const token = extractToken(req);
    if (token) {
      const user = getUserBySession(token);
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      if (user) {
        db.prepare('UPDATE users SET is_online = 0 WHERE uid = ?').run(user.uid);
      }
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    expireStaleRequests();
    res.json({
      user: serializePrivateUser(req.user),
      platformConfig: getPlatformConfig(),
    });
  });

  // Profile management
  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    const {
      name,
      email,
      profileImage,
      locationSharingEnabled,
      notificationPrefs,
      requestKyc,
    } = req.body || {};
    const uid = req.user.uid;
    const updates: string[] = [];
    const params: any[] = [];

    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 80) {
        res.status(400).json({ error: 'Name must be 2–80 characters.' });
        return;
      }
      updates.push('name = ?');
      params.push(trimmed);
    }
    if (email !== undefined) {
      const cleanEmail = email && String(email).trim() ? String(email).trim().toLowerCase() : null;
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Invalid email address.' });
        return;
      }
      if (cleanEmail) {
        const dup = db.prepare('SELECT uid FROM users WHERE email = ? AND uid != ?').get(cleanEmail, uid);
        if (dup) {
          res.status(409).json({ error: 'Email address is already in use.' });
          return;
        }
      }
      updates.push('email = ?');
      params.push(cleanEmail);
    }
    if (profileImage !== undefined) {
      if (profileImage !== null && (typeof profileImage !== 'string' || profileImage.length > 500000)) {
        res.status(400).json({ error: 'Profile image must be under 350 KB.' });
        return;
      }
      updates.push('profile_image = ?');
      params.push(profileImage);
    }
    if (typeof locationSharingEnabled === 'boolean') {
      updates.push('location_sharing_enabled = ?');
      params.push(locationSharingEnabled ? 1 : 0);
      if (!locationSharingEnabled) {
        updates.push('approx_lat = NULL', 'approx_lng = NULL');
      }
    }
    if (notificationPrefs && typeof notificationPrefs === 'object') {
      const safePrefs = {
        matches: Boolean(notificationPrefs.matches),
        connections: Boolean(notificationPrefs.connections),
        messages: Boolean(notificationPrefs.messages),
        expiry: Boolean(notificationPrefs.expiry),
        verification: Boolean(notificationPrefs.verification),
      };
      updates.push('notification_prefs = ?');
      params.push(JSON.stringify(safePrefs));
    }
    if (requestKyc === true && req.user.kyc_status === 'none') {
      updates.push("kyc_status = 'pending'");
      createNotification(
        uid,
        'verification',
        'Identity verification requested',
        'Your optional KYC verification request is queued for administrator review. Identity documents are never displayed publicly.',
        null
      );
    }

    if (updates.length > 0) {
      params.push(uid);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE uid = ?`).run(...params);
    }
    const updated = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid);
    res.json({ user: serializePrivateUser(updated) });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: 'Current password and a new password (8+ characters) are required.' });
      return;
    }
    if (!verifyPassword(String(currentPassword), req.user.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE uid = ?').run(
      hashPassword(String(newPassword)),
      req.user.uid
    );
    res.json({ ok: true, message: 'Password changed successfully.' });
  });

  app.delete('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM users WHERE uid = ?').run(req.user.uid);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Live location update (stores ONLY privacy-fuzzed coordinates)
  app.post('/api/location/update', requireAuth, (req: AuthedRequest, res) => {
    const { lat, lng, areaLabel } = req.body || {};
    if (!req.user.location_sharing_enabled) {
      res.json({ ok: true, shared: false });
      return;
    }
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      res.status(400).json({ error: 'Valid geographic coordinates are required.' });
      return;
    }
    const fuzzed = fuzzCoordinatesForPrivacy(lat, lng);
    const cleanArea = String(areaLabel || 'Nearby Area').trim().slice(0, 100);
    db.prepare(
      'UPDATE users SET approx_lat = ?, approx_lng = ?, approximate_area = ?, last_active_at = ? WHERE uid = ?'
    ).run(fuzzed.lat, fuzzed.lng, cleanArea, new Date().toISOString(), req.user.uid);
    res.json({ ok: true, shared: true, approxLat: fuzzed.lat, approxLng: fuzzed.lng, areaLabel: cleanArea });
  });

  // Create exchange request
  app.post('/api/requests', requireAuth, (req: AuthedRequest, res) => {
    expireStaleRequests();
    const cfg = getPlatformConfig();
    const {
      requestType,
      amount,
      availableCashAmount,
      paymentMethod,
      description,
      radiusMeters,
      expiryMinutes,
      lat,
      lng,
      areaLabel,
    } = req.body || {};

    if (requestType !== 'need_cash' && requestType !== 'need_online') {
      res.status(400).json({ error: 'Invalid request type.' });
      return;
    }
    const numAmount = Math.round(Number(amount));
    if (!Number.isFinite(numAmount) || numAmount < cfg.minAmount || numAmount > cfg.maxAmount) {
      res.status(400).json({
        error: `Amount must be between ₹${cfg.minAmount.toLocaleString('en-IN')} and ₹${cfg.maxAmount.toLocaleString('en-IN')}.`,
      });
      return;
    }
    let availCash: number | null = null;
    if (requestType === 'need_online') {
      const parsedCash = Math.round(Number(availableCashAmount ?? numAmount));
      if (!Number.isFinite(parsedCash) || parsedCash < numAmount) {
        res.status(400).json({ error: 'Available cash amount must be at least equal to the required online amount.' });
        return;
      }
      availCash = parsedCash;
    }
    const allowedMethods = ['UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer (IMPS)'];
    if (!allowedMethods.includes(String(paymentMethod))) {
      res.status(400).json({ error: 'Select a supported digital payment method.' });
      return;
    }
    const radius = cfg.supportedRadii.includes(Number(radiusMeters)) ? Number(radiusMeters) : cfg.defaultRadius;
    const expMins = Math.min(Math.max(Number(expiryMinutes) || 60, 15), 1440);
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Set your current GPS or manual neighborhood location before posting.' });
      return;
    }

    // Rate limit & duplicate request detection
    const activeCountRow = db
      .prepare("SELECT COUNT(*) as cnt FROM requests WHERE user_id = ? AND status = 'active'")
      .get(req.user.uid) as { cnt: number };
    if (activeCountRow.cnt >= cfg.maxActiveRequests) {
      logAudit(req.user.uid, 'rate_limit_request', `Exceeded max active requests (${cfg.maxActiveRequests})`);
      res.status(429).json({
        error: `You can have at most ${cfg.maxActiveRequests} active requests at once. Close or cancel an existing request first.`,
      });
      return;
    }
    const dup = db
      .prepare(
        "SELECT request_id FROM requests WHERE user_id = ? AND status = 'active' AND request_type = ? AND amount = ?"
      )
      .get(req.user.uid, requestType, numAmount);
    if (dup) {
      logAudit(req.user.uid, 'duplicate_request_blocked', `Duplicate ${requestType} for ₹${numAmount}`);
      res.status(409).json({
        error: 'You already have an active request for this exact type and amount.',
      });
      return;
    }

    const fuzzed = fuzzCoordinatesForPrivacy(lat, lng);
    const geohash = encodeGeohash(fuzzed.lat, fuzzed.lng, 6);
    const requestId = newId('req');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expMins * 60000).toISOString();
    const safeArea = String(areaLabel || req.user.approximate_area || 'Nearby Locality').trim().slice(0, 100);
    const safeDesc = String(description || '').trim().slice(0, 220);

    db.prepare(`
      INSERT INTO requests (
        request_id, user_id, request_type, amount, available_cash_amount,
        payment_method, description, radius_meters, approx_lat, approx_lng,
        area_label, geohash, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      requestId,
      req.user.uid,
      requestType,
      numAmount,
      availCash,
      String(paymentMethod),
      safeDesc,
      radius,
      fuzzed.lat,
      fuzzed.lng,
      safeArea,
      geohash,
      now.toISOString(),
      expiresAt
    );

    // Smart matching notification: notify compatible opposite-type neighbors within radius
    const oppositeType = requestType === 'need_cash' ? 'need_online' : 'need_cash';
    const oppositeActive = db
      .prepare(
        `SELECT r.*, u.uid FROM requests r
         JOIN users u ON u.uid = r.user_id
         WHERE r.status = 'active' AND r.expires_at > ? AND r.request_type = ? AND r.user_id != ? AND u.is_suspended = 0`
      )
      .all(now.toISOString(), oppositeType, req.user.uid) as any[];

    for (const candidate of oppositeActive) {
      if (isMutuallyBlocked(req.user.uid, candidate.user_id)) continue;
      const dist = haversineDistanceMeters(fuzzed.lat, fuzzed.lng, candidate.approx_lat, candidate.approx_lng);
      const effectiveRadius = Math.max(radius, candidate.radius_meters);
      const amountRatio = Math.min(numAmount, candidate.amount) / Math.max(numAmount, candidate.amount);
      if (dist <= effectiveRadius && amountRatio >= 0.5) {
        createNotification(
          candidate.user_id,
          'match',
          'New nearby match discovered',
          `${req.user.name} (${formatApproximateDistance(dist)} away) posted a compatible ₹${numAmount.toLocaleString('en-IN')} ${
            requestType === 'need_cash' ? 'Need Cash' : 'Need Online Money'
          } request.`,
          requestId
        );
      }
    }

    res.status(201).json({ requestId, status: 'active' });
  });

  // Nearby Smart Matching Engine
  app.get('/api/requests/nearby', requireAuth, (req: AuthedRequest, res) => {
    expireStaleRequests();
    const now = new Date().toISOString();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius) || getPlatformConfig().defaultRadius;
    const filterType = req.query.type ? String(req.query.type) : 'all';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
      return;
    }

    // Fetch current user's active request(s) to compute compatibility ranking
    const myActive = db
      .prepare("SELECT * FROM requests WHERE user_id = ? AND status = 'active' AND expires_at > ? ORDER BY created_at DESC")
      .all(req.user.uid, now) as any[];

    const primaryMyReq = myActive[0] || null;
    const targetOppositeType = primaryMyReq
      ? primaryMyReq.request_type === 'need_cash'
        ? 'need_online'
        : 'need_cash'
      : null;

    const rows = db
      .prepare(`
        SELECT r.*,
               u.name as user_name,
               u.profile_image as user_photo,
               u.is_verified as user_verified,
               u.mobile_verified as user_mobile_verified,
               u.kyc_status as user_kyc_status,
               u.rating_avg as user_rating,
               u.rating_count as user_rating_count,
               u.is_online as user_online
        FROM requests r
        JOIN users u ON u.uid = r.user_id
        WHERE r.status = 'active'
          AND r.expires_at > ?
          AND r.user_id != ?
          AND u.is_suspended = 0
          AND u.mobile_verified = 1
      `)
      .all(now, req.user.uid) as any[];

    const nearbyRequests: any[] = [];
    for (const row of rows) {
      if (isMutuallyBlocked(req.user.uid, row.user_id)) continue;
      if (filterType !== 'all' && row.request_type !== filterType) continue;

      const distanceMeters = Math.round(haversineDistanceMeters(lat, lng, row.approx_lat, row.approx_lng));
      if (distanceMeters > radius) continue;

      const isExactOpposite = targetOppositeType ? row.request_type === targetOppositeType : true;

      // Amount compatibility score (0..100)
      let amountScore = 70;
      if (primaryMyReq) {
        if (isExactOpposite) {
          const minA = Math.min(primaryMyReq.amount, row.amount);
          const maxA = Math.max(primaryMyReq.amount, row.amount);
          amountScore = Math.round((minA / maxA) * 100);
          // Bonus if candidate offers enough cash for online need
          if (row.request_type === 'need_online' && row.available_cash_amount && row.available_cash_amount >= primaryMyReq.amount) {
            amountScore = Math.min(100, amountScore + 10);
          }
        } else {
          amountScore = 10;
        }
      }

      const trustScore =
        (row.user_verified ? 25 : 0) +
        (row.user_kyc_status === 'verified' ? 20 : 0) +
        Number(row.user_rating || 0) * 10;

      nearbyRequests.push({
        requestId: row.request_id,
        userId: row.user_id,
        userName: row.user_name,
        userPhoto: row.user_photo,
        userVerified: Boolean(row.user_verified),
        userKycStatus: row.user_kyc_status,
        userRating: Number(row.user_rating || 0),
        userRatingCount: Number(row.user_rating_count || 0),
        userOnline: Boolean(row.user_online),
        requestType: row.request_type,
        amount: row.amount,
        availableCashAmount: row.available_cash_amount,
        paymentMethod: row.payment_method,
        description: row.description,
        radiusMeters: row.radius_meters,
        approxLat: row.approx_lat,
        approxLng: row.approx_lng,
        areaLabel: row.area_label,
        geohash: row.geohash,
        status: row.status,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        distanceMeters,
        approxDistanceLabel: formatApproximateDistance(distanceMeters),
        compatibilityScore: amountScore,
        isExactOpposite,
        _trustScore: trustScore,
      });
    }

    // Sort matches strictly by:
    // 1. Best amount compatibility (and opposite type first)
    // 2. Shortest distance
    // 3. Account trust status
    nearbyRequests.sort((a, b) => {
      if (a.isExactOpposite !== b.isExactOpposite) return a.isExactOpposite ? -1 : 1;
      if (Math.abs(b.compatibilityScore - a.compatibilityScore) >= 5) {
        return b.compatibilityScore - a.compatibilityScore;
      }
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }
      return b._trustScore - a._trustScore;
    });

    // Count active nearby users who have location sharing enabled
    const nearbyUsersRows = db
      .prepare(
        `SELECT uid, approx_lat, approx_lng FROM users
         WHERE uid != ? AND is_suspended = 0 AND location_sharing_enabled = 1
           AND approx_lat IS NOT NULL AND approx_lng IS NOT NULL`
      )
      .all(req.user.uid) as any[];

    let activeNearbyUsers = 0;
    for (const u of nearbyUsersRows) {
      if (isMutuallyBlocked(req.user.uid, u.uid)) continue;
      if (haversineDistanceMeters(lat, lng, u.approx_lat, u.approx_lng) <= radius) {
        activeNearbyUsers++;
      }
    }

    const cleaned = nearbyRequests.map(({ _trustScore, ...rest }) => rest);
    const matchingCount = cleaned.filter((r) => r.isExactOpposite && r.compatibilityScore >= 50).length;

    res.json({
      requests: cleaned,
      summary: {
        activeNearbyUsers: Math.max(activeNearbyUsers, new Set(cleaned.map((r) => r.userId)).size),
        nearbyRequestsCount: cleaned.length,
        matchingCount,
      },
    });
  });

  // Own requests
  app.get('/api/requests/mine', requireAuth, (req: AuthedRequest, res) => {
    expireStaleRequests();
    const rows = db
      .prepare('SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(req.user.uid) as any[];
    res.json({
      requests: rows.map((r) => ({
        requestId: r.request_id,
        userId: r.user_id,
        userName: req.user.name,
        userPhoto: req.user.profile_image,
        userVerified: Boolean(req.user.is_verified),
        userKycStatus: req.user.kyc_status,
        userRating: Number(req.user.rating_avg || 0),
        userRatingCount: Number(req.user.rating_count || 0),
        userOnline: true,
        requestType: r.request_type,
        amount: r.amount,
        availableCashAmount: r.available_cash_amount,
        paymentMethod: r.payment_method,
        description: r.description,
        radiusMeters: r.radius_meters,
        approxLat: r.approx_lat,
        approxLng: r.approx_lng,
        areaLabel: r.area_label,
        geohash: r.geohash,
        status: r.status,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    });
  });

  app.patch('/api/requests/:id', requireAuth, (req: AuthedRequest, res) => {
    const { status } = req.body || {};
    if (status !== 'cancelled' && status !== 'completed') {
      res.status(400).json({ error: 'Allowed status updates are cancelled or completed.' });
      return;
    }
    const row = db.prepare('SELECT * FROM requests WHERE request_id = ?').get(req.params.id) as any;
    if (!row || row.user_id !== req.user.uid) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    db.prepare('UPDATE requests SET status = ? WHERE request_id = ?').run(status, row.request_id);
    res.json({ ok: true, status });
  });

  // Connections & Transaction History
  app.get('/api/connections', requireAuth, (req: AuthedRequest, res) => {
    const uid = req.user.uid;
    const rows = db
      .prepare(
        `SELECT * FROM connections
         WHERE requester_id = ? OR receiver_id = ?
         ORDER BY updated_at DESC`
      )
      .all(uid, uid) as any[];

    const formatted = rows
      .filter((c) => {
        const otherId = c.requester_id === uid ? c.receiver_id : c.requester_id;
        return !isMutuallyBlocked(uid, otherId);
      })
      .map((c) => {
        const otherId = c.requester_id === uid ? c.receiver_id : c.requester_id;
        const other = db.prepare('SELECT * FROM users WHERE uid = ?').get(otherId) as any;
        const unread = db
          .prepare('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND recipient_id = ? AND read_status = 0')
          .get(c.connection_id, uid) as { cnt: number };
        const lastMsg = db
          .prepare('SELECT text, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1')
          .get(c.connection_id) as { text: string; timestamp: string } | undefined;
        const rated = db
          .prepare('SELECT 1 FROM ratings WHERE connection_id = ? AND reviewer_id = ?')
          .get(c.connection_id, uid);

        return {
          connectionId: c.connection_id,
          requesterId: c.requester_id,
          receiverId: c.receiver_id,
          requestId: c.request_id,
          requestType: c.request_type,
          agreedAmount: c.agreed_amount,
          paymentMethod: c.payment_method,
          status: c.status,
          requesterConfirmed: Boolean(c.requester_confirmed),
          receiverConfirmed: Boolean(c.receiver_confirmed),
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          otherUser: other
            ? {
                uid: other.uid,
                name: other.name,
                profileImage: other.profile_image,
                isVerified: Boolean(other.is_verified),
                kycStatus: other.kyc_status,
                isOnline: Boolean(other.is_online),
                ratingAvg: Number(other.rating_avg || 0),
                ratingCount: Number(other.rating_count || 0),
                approximateArea: other.approximate_area,
              }
            : {
                uid: otherId,
                name: 'Former User',
                profileImage: null,
                isVerified: false,
                kycStatus: 'none',
                isOnline: false,
                ratingAvg: 0,
                ratingCount: 0,
                approximateArea: null,
              },
          unreadCount: unread?.cnt || 0,
          lastMessageText: lastMsg?.text || null,
          lastMessageAt: lastMsg?.timestamp || null,
          hasRated: Boolean(rated),
        };
      });

    res.json({ connections: formatted });
  });

  app.post('/api/connections', requireAuth, (req: AuthedRequest, res) => {
    expireStaleRequests();
    const { requestId, agreedAmount } = req.body || {};
    const targetReq = db.prepare('SELECT * FROM requests WHERE request_id = ?').get(requestId) as any;
    if (!targetReq || targetReq.status !== 'active') {
      res.status(404).json({ error: 'This exchange request is no longer active.' });
      return;
    }
    if (targetReq.user_id === req.user.uid) {
      res.status(400).json({ error: 'You cannot connect with your own request.' });
      return;
    }
    if (isMutuallyBlocked(req.user.uid, targetReq.user_id)) {
      res.status(403).json({ error: 'Unable to connect with this user.' });
      return;
    }

    const existing = db
      .prepare(
        `SELECT connection_id FROM connections
         WHERE request_id = ? AND requester_id = ? AND status IN ('pending', 'accepted')`
      )
      .get(requestId, req.user.uid);
    if (existing) {
      res.status(409).json({ error: 'You already have an active connection request for this listing.' });
      return;
    }

    const cfg = getPlatformConfig();
    const finalAmount = Math.round(Number(agreedAmount || targetReq.amount));
    if (finalAmount < cfg.minAmount || finalAmount > cfg.maxAmount) {
      res.status(400).json({ error: 'Agreed amount is outside allowed platform limits.' });
      return;
    }

    const connectionId = newId('con');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO connections (
        connection_id, requester_id, receiver_id, request_id, request_type,
        agreed_amount, payment_method, status, requester_confirmed, receiver_confirmed,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
    `).run(
      connectionId,
      req.user.uid,
      targetReq.user_id,
      targetReq.request_id,
      targetReq.request_type,
      finalAmount,
      targetReq.payment_method,
      now,
      now
    );

    db.prepare('UPDATE users SET total_connections = total_connections + 1 WHERE uid IN (?, ?)').run(
      req.user.uid,
      targetReq.user_id
    );

    createNotification(
      targetReq.user_id,
      'connection_request',
      'New connection request',
      `${req.user.name} wants to connect for ₹${finalAmount.toLocaleString('en-IN')} (${targetReq.payment_method}). Accept to open private chat.`,
      connectionId
    );
    pushToUser(targetReq.user_id, 'connection:updated', { connectionId });

    res.status(201).json({ connectionId, status: 'pending' });
  });

  app.patch('/api/connections/:id/respond', requireAuth, (req: AuthedRequest, res) => {
    const { action } = req.body || {};
    const conn = db.prepare('SELECT * FROM connections WHERE connection_id = ?').get(req.params.id) as any;
    if (!conn) {
      res.status(404).json({ error: 'Connection not found.' });
      return;
    }
    const uid = req.user.uid;
    const now = new Date().toISOString();

    if (action === 'accept' || action === 'reject') {
      if (conn.receiver_id !== uid || conn.status !== 'pending') {
        res.status(403).json({ error: 'Only the recipient can accept or reject a pending request.' });
        return;
      }
      const nextStatus = action === 'accept' ? 'accepted' : 'rejected';
      db.prepare('UPDATE connections SET status = ?, updated_at = ? WHERE connection_id = ?').run(
        nextStatus,
        now,
        conn.connection_id
      );
      if (nextStatus === 'accepted') {
        db.prepare("UPDATE requests SET status = 'matched' WHERE request_id = ? AND status = 'active'").run(
          conn.request_id
        );
      }
      createNotification(
        conn.requester_id,
        nextStatus === 'accepted' ? 'request_accepted' : 'request_rejected',
        nextStatus === 'accepted' ? 'Connection request accepted' : 'Connection request declined',
        nextStatus === 'accepted'
          ? `${req.user.name} accepted your ₹${conn.agreed_amount.toLocaleString('en-IN')} request. You can now chat to coordinate a safe public meetup.`
          : `${req.user.name} declined your ₹${conn.agreed_amount.toLocaleString('en-IN')} connection request.`,
        conn.connection_id
      );
      pushToUser(conn.requester_id, 'connection:updated', { connectionId: conn.connection_id, status: nextStatus });
      res.json({ ok: true, status: nextStatus });
      return;
    }

    if (action === 'cancel') {
      if (conn.requester_id !== uid || conn.status !== 'pending') {
        res.status(403).json({ error: 'Only the sender can cancel a pending request.' });
        return;
      }
      db.prepare("UPDATE connections SET status = 'cancelled', updated_at = ? WHERE connection_id = ?").run(
        now,
        conn.connection_id
      );
      pushToUser(conn.receiver_id, 'connection:updated', { connectionId: conn.connection_id, status: 'cancelled' });
      res.json({ ok: true, status: 'cancelled' });
      return;
    }

    res.status(400).json({ error: 'Invalid action.' });
  });

  // Independent dual-user completion confirmation
  app.post('/api/connections/:id/confirm-complete', requireAuth, (req: AuthedRequest, res) => {
    const conn = db.prepare('SELECT * FROM connections WHERE connection_id = ?').get(req.params.id) as any;
    if (!conn || (conn.requester_id !== req.user.uid && conn.receiver_id !== req.user.uid)) {
      res.status(404).json({ error: 'Connection not found.' });
      return;
    }
    if (conn.status !== 'accepted') {
      res.status(400).json({ error: 'Only accepted connections can be marked completed.' });
      return;
    }

    const isRequester = conn.requester_id === req.user.uid;
    const reqConf = isRequester ? 1 : conn.requester_confirmed;
    const recConf = !isRequester ? 1 : conn.receiver_confirmed;
    const bothConfirmed = Boolean(reqConf && recConf);
    const nextStatus = bothConfirmed ? 'completed' : 'accepted';
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE connections
       SET requester_confirmed = ?, receiver_confirmed = ?, status = ?, updated_at = ?
       WHERE connection_id = ?`
    ).run(reqConf, recConf, nextStatus, now, conn.connection_id);

    const otherId = isRequester ? conn.receiver_id : conn.requester_id;
    if (bothConfirmed) {
      db.prepare("UPDATE requests SET status = 'completed' WHERE request_id = ?").run(conn.request_id);
      db.prepare('UPDATE users SET completed_connections = completed_connections + 1 WHERE uid IN (?, ?)').run(
        conn.requester_id,
        conn.receiver_id
      );
      createNotification(
        otherId,
        'request_accepted',
        'Exchange confirmed by both users',
        `Your ₹${conn.agreed_amount.toLocaleString('en-IN')} connection with ${req.user.name} is now marked completed. Leave a community rating!`,
        conn.connection_id
      );
    } else {
      createNotification(
        otherId,
        'request_accepted',
        'Completion confirmation pending',
        `${req.user.name} confirmed completion for ₹${conn.agreed_amount.toLocaleString('en-IN')}. Please confirm independently after verifying settlement in your official banking app.`,
        conn.connection_id
      );
    }

    pushToUser(otherId, 'connection:updated', { connectionId: conn.connection_id, status: nextStatus });
    res.json({ ok: true, status: nextStatus, requesterConfirmed: Boolean(reqConf), receiverConfirmed: Boolean(recConf) });
  });

  // Real-time 1:1 Chat (strictly gated to mutually accepted connections)
  app.get('/api/connections/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const conn = db.prepare('SELECT * FROM connections WHERE connection_id = ?').get(req.params.id) as any;
    if (!conn || (conn.requester_id !== req.user.uid && conn.receiver_id !== req.user.uid)) {
      res.status(403).json({ error: 'Access denied to this conversation.' });
      return;
    }
    if (conn.status !== 'accepted' && conn.status !== 'completed') {
      res.status(403).json({ error: 'Chat is only available after both users mutually accept the connection.' });
      return;
    }
    const otherId = conn.requester_id === req.user.uid ? conn.receiver_id : conn.requester_id;
    if (isMutuallyBlocked(req.user.uid, otherId)) {
      res.status(403).json({ error: 'Conversation is unavailable because one user blocked the other.' });
      return;
    }

    // Mark unread messages for current user as read
    const updated = db
      .prepare('UPDATE messages SET read_status = 1 WHERE conversation_id = ? AND recipient_id = ? AND read_status = 0')
      .run(conn.connection_id, req.user.uid);
    if (updated.changes > 0) {
      pushToUser(otherId, 'messages:read', { conversationId: conn.connection_id, readerId: req.user.uid });
    }

    const rows = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 250')
      .all(conn.connection_id) as any[];

    res.json({
      messages: rows.map((m) => ({
        messageId: m.message_id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        recipientId: m.recipient_id,
        text: m.text,
        timestamp: m.timestamp,
        readStatus: Boolean(m.read_status),
      })),
    });
  });

  app.post('/api/connections/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const conn = db.prepare('SELECT * FROM connections WHERE connection_id = ?').get(req.params.id) as any;
    if (!conn || (conn.requester_id !== req.user.uid && conn.receiver_id !== req.user.uid)) {
      res.status(403).json({ error: 'Access denied to this conversation.' });
      return;
    }
    if (conn.status !== 'accepted' && conn.status !== 'completed') {
      res.status(403).json({ error: 'Both users must mutually accept before chatting.' });
      return;
    }
    const otherId = conn.requester_id === req.user.uid ? conn.receiver_id : conn.requester_id;
    if (isMutuallyBlocked(req.user.uid, otherId)) {
      res.status(403).json({ error: 'Cannot message a blocked user.' });
      return;
    }
    if (!checkMessageRateLimit(req.user.uid)) {
      res.status(429).json({ error: 'Slow down — you are sending messages too quickly.' });
      return;
    }
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 1000) {
      res.status(400).json({ error: 'Message must be between 1 and 1,000 characters.' });
      return;
    }

    const messageId = newId('msg');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO messages (message_id, conversation_id, sender_id, recipient_id, text, timestamp, read_status) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(messageId, conn.connection_id, req.user.uid, otherId, text, now);
    db.prepare('UPDATE connections SET updated_at = ? WHERE connection_id = ?').run(now, conn.connection_id);

    const payload = {
      messageId,
      conversationId: conn.connection_id,
      senderId: req.user.uid,
      recipientId: otherId,
      text,
      timestamp: now,
      readStatus: false,
    };

    pushToUser(otherId, 'message:new', payload);
    pushToUser(req.user.uid, 'message:new', payload);

    createNotification(
      otherId,
      'chat_message',
      `New message from ${req.user.name}`,
      text.slice(0, 90),
      conn.connection_id
    );

    res.status(201).json({ message: payload });
  });

  // Notifications
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60')
      .all(req.user.uid) as any[];
    res.json({
      notifications: rows.map((n) => ({
        notificationId: n.notification_id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedId: n.related_id,
        isRead: Boolean(n.is_read),
        createdAt: n.created_at,
      })),
    });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?').run(
      req.params.id,
      req.user.uid
    );
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.uid);
    res.json({ ok: true });
  });

  // Ratings & Reviews (only after completed connections)
  app.post('/api/ratings', requireAuth, (req: AuthedRequest, res) => {
    const { connectionId, rating, review } = req.body || {};
    const score = Math.round(Number(rating));
    if (!connectionId || score < 1 || score > 5) {
      res.status(400).json({ error: 'Provide a valid rating between 1 and 5 stars.' });
      return;
    }
    const conn = db.prepare('SELECT * FROM connections WHERE connection_id = ?').get(connectionId) as any;
    if (!conn || (conn.requester_id !== req.user.uid && conn.receiver_id !== req.user.uid)) {
      res.status(404).json({ error: 'Connection not found.' });
      return;
    }
    if (conn.status !== 'completed') {
      res.status(400).json({ error: 'Ratings can only be submitted after both users confirm completion.' });
      return;
    }
    const reviewedUserId = conn.requester_id === req.user.uid ? conn.receiver_id : conn.requester_id;
    const exists = db
      .prepare('SELECT 1 FROM ratings WHERE connection_id = ? AND reviewer_id = ?')
      .get(connectionId, req.user.uid);
    if (exists) {
      res.status(409).json({ error: 'You have already rated this exchange.' });
      return;
    }

    const ratingId = newId('rat');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO ratings (rating_id, connection_id, reviewer_id, reviewed_user_id, rating, review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(ratingId, connectionId, req.user.uid, reviewedUserId, score, String(review || '').trim().slice(0, 400), now);

    const stats = db
      .prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM ratings WHERE reviewed_user_id = ?')
      .get(reviewedUserId) as { avg_rating: number; cnt: number };
    db.prepare('UPDATE users SET rating_avg = ?, rating_count = ? WHERE uid = ?').run(
      Number((stats.avg_rating || 0).toFixed(2)),
      stats.cnt,
      reviewedUserId
    );

    res.status(201).json({ ok: true, ratingId });
  });

  app.get('/api/users/:uid/reviews', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT r.*, u.name as reviewer_name
         FROM ratings r
         JOIN users u ON u.uid = r.reviewer_id
         WHERE r.reviewed_user_id = ?
         ORDER BY r.created_at DESC LIMIT 30`
      )
      .all(req.params.uid) as any[];
    res.json({
      reviews: rows.map((r) => ({
        ratingId: r.rating_id,
        connectionId: r.connection_id,
        reviewerId: r.reviewer_id,
        reviewerName: r.reviewer_name,
        reviewedUserId: r.reviewed_user_id,
        rating: r.rating,
        review: r.review,
        createdAt: r.created_at,
      })),
    });
  });

  // Block & Report
  app.post('/api/blocks', requireAuth, (req: AuthedRequest, res) => {
    const { blockedUserId } = req.body || {};
    if (!blockedUserId || blockedUserId === req.user.uid) {
      res.status(400).json({ error: 'Invalid user to block.' });
      return;
    }
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(
      req.user.uid,
      blockedUserId,
      new Date().toISOString()
    );
    db.prepare(
      `UPDATE connections SET status = 'cancelled', updated_at = ?
       WHERE status = 'pending' AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))`
    ).run(new Date().toISOString(), req.user.uid, blockedUserId, blockedUserId, req.user.uid);
    res.json({ ok: true });
  });

  app.delete('/api/blocks/:uid', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.uid, req.params.uid);
    res.json({ ok: true });
  });

  app.post('/api/reports', requireAuth, (req: AuthedRequest, res) => {
    const { reportedUserId, reason, details } = req.body || {};
    if (!reportedUserId || reportedUserId === req.user.uid || !reason) {
      res.status(400).json({ error: 'Provide the user and reason for your safety report.' });
      return;
    }
    const reportId = newId('rep');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO reports (report_id, reporter_id, reported_user_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, \'open\', ?)'
    ).run(reportId, req.user.uid, reportedUserId, String(reason).slice(0, 120), String(details || '').slice(0, 600), now);
    logAudit(req.user.uid, 'user_reported', `Reported user ${reportedUserId} for: ${String(reason).slice(0, 80)}`);
    res.status(201).json({ ok: true, reportId });
  });

  // =========================================================================
  // PROTECTED ADMIN ROUTES (Server-side RBAC verified from database)
  // =========================================================================
  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    expireStaleRequests();
    const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
    const verifiedUsers = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_verified = 1').get() as any).c;
    const activeUsers = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_online = 1 AND is_suspended = 0').get() as any).c;
    const activeRequests = (db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'active'").get() as any).c;
    const totalConnections = (db.prepare('SELECT COUNT(*) as c FROM connections').get() as any).c;
    const completedConnections = (db.prepare("SELECT COUNT(*) as c FROM connections WHERE status = 'completed'").get() as any).c;
    const openReports = (db.prepare("SELECT COUNT(*) as c FROM reports WHERE status IN ('open', 'reviewing')").get() as any).c;
    const suspendedAccounts = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_suspended = 1').get() as any).c;

    // 7-day analytics breakdown
    const dailyActivity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayPrefix = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const reqCount = (db.prepare('SELECT COUNT(*) as c FROM requests WHERE created_at LIKE ?').get(`${dayPrefix}%`) as any).c;
      const conCount = (db.prepare('SELECT COUNT(*) as c FROM connections WHERE created_at LIKE ?').get(`${dayPrefix}%`) as any).c;
      const cmpCount = (db.prepare("SELECT COUNT(*) as c FROM connections WHERE status = 'completed' AND updated_at LIKE ?").get(`${dayPrefix}%`) as any).c;
      dailyActivity.push({ date: label, requests: reqCount, connections: conCount, completed: cmpCount });
    }

    const audits = db
      .prepare(
        `SELECT a.*, u.name as user_name
         FROM audit_events a
         LEFT JOIN users u ON u.uid = a.user_id
         ORDER BY a.id DESC LIMIT 40`
      )
      .all() as any[];

    res.json({
      metrics: {
        totalUsers,
        verifiedUsers,
        activeUsers,
        activeRequests,
        totalConnections,
        completedConnections,
        openReports,
        suspendedAccounts,
      },
      dailyActivity,
      auditEvents: audits.map((a) => ({
        id: a.id,
        userId: a.user_id,
        userName: a.user_name,
        eventType: a.event_type,
        detail: a.detail,
        createdAt: a.created_at,
      })),
    });
  });

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 200').all() as any[];
    res.json({ users: rows.map(serializePrivateUser) });
  });

  app.patch('/api/admin/users/:uid', requireAdmin, (req: AuthedRequest, res) => {
    const { isSuspended, isVerified, kycStatus } = req.body || {};
    const target = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid) as any;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.uid === req.user.uid && isSuspended === true) {
      res.status(400).json({ error: 'Administrators cannot suspend their own account.' });
      return;
    }
    if (typeof isSuspended === 'boolean') {
      db.prepare('UPDATE users SET is_suspended = ?, is_online = CASE WHEN ? = 1 THEN 0 ELSE is_online END WHERE uid = ?').run(
        isSuspended ? 1 : 0,
        isSuspended ? 1 : 0,
        target.uid
      );
      if (isSuspended) {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.uid);
        db.prepare("UPDATE requests SET status = 'cancelled' WHERE user_id = ? AND status = 'active'").run(target.uid);
      }
      logAudit(req.user.uid, isSuspended ? 'admin_suspend_user' : 'admin_reactivate_user', `Target user: ${target.name} (${target.uid})`);
    }
    if (typeof isVerified === 'boolean') {
      db.prepare('UPDATE users SET is_verified = ? WHERE uid = ?').run(isVerified ? 1 : 0, target.uid);
      createNotification(
        target.uid,
        'verification',
        isVerified ? 'Account verified' : 'Verification status updated',
        isVerified
          ? 'Your CashBridge account verification badge is active.'
          : 'Your account verification badge was updated by an administrator.',
        null
      );
    }
    if (kycStatus && ['none', 'pending', 'verified'].includes(kycStatus)) {
      db.prepare('UPDATE users SET kyc_status = ?, is_verified = CASE WHEN ? = \'verified\' THEN 1 ELSE is_verified END WHERE uid = ?').run(
        kycStatus,
        kycStatus,
        target.uid
      );
      if (kycStatus === 'verified') {
        createNotification(
          target.uid,
          'verification',
          'Identity verification approved',
          'Your optional KYC verification has been approved. Your trust badge is now visible on nearby matches.',
          null
        );
      }
    }
    const updated = db.prepare('SELECT * FROM users WHERE uid = ?').get(target.uid);
    res.json({ user: serializePrivateUser(updated) });
  });

  app.get('/api/admin/requests', requireAdmin, (_req, res) => {
    expireStaleRequests();
    const rows = db
      .prepare(
        `SELECT r.*, u.name as user_name, u.is_verified as user_verified, u.kyc_status as user_kyc_status,
                u.rating_avg as user_rating, u.rating_count as user_rating_count, u.is_online as user_online,
                u.profile_image as user_photo
         FROM requests r
         JOIN users u ON u.uid = r.user_id
         ORDER BY r.created_at DESC LIMIT 200`
      )
      .all() as any[];
    res.json({
      requests: rows.map((r) => ({
        requestId: r.request_id,
        userId: r.user_id,
        userName: r.user_name,
        userPhoto: r.user_photo,
        userVerified: Boolean(r.user_verified),
        userKycStatus: r.user_kyc_status,
        userRating: Number(r.user_rating || 0),
        userRatingCount: Number(r.user_rating_count || 0),
        userOnline: Boolean(r.user_online),
        requestType: r.request_type,
        amount: r.amount,
        availableCashAmount: r.available_cash_amount,
        paymentMethod: r.payment_method,
        description: r.description,
        radiusMeters: r.radius_meters,
        approxLat: r.approx_lat,
        approxLng: r.approx_lng,
        areaLabel: r.area_label,
        geohash: r.geohash,
        status: r.status,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    });
  });

  app.patch('/api/admin/requests/:id', requireAdmin, (req: AuthedRequest, res) => {
    const { status } = req.body || {};
    if (!['active', 'cancelled', 'expired', 'completed'].includes(status)) {
      res.status(400).json({ error: 'Invalid request status.' });
      return;
    }
    db.prepare('UPDATE requests SET status = ? WHERE request_id = ?').run(status, req.params.id);
    logAudit(req.user.uid, 'admin_moderate_request', `Set request ${req.params.id} to ${status}`);
    res.json({ ok: true });
  });

  app.get('/api/admin/reports', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT rep.*, u1.name as reporter_name, u2.name as reported_user_name
         FROM reports rep
         JOIN users u1 ON u1.uid = rep.reporter_id
         JOIN users u2 ON u2.uid = rep.reported_user_id
         ORDER BY rep.created_at DESC LIMIT 150`
      )
      .all() as any[];
    res.json({
      reports: rows.map((r) => ({
        reportId: r.report_id,
        reporterId: r.reporter_id,
        reporterName: r.reporter_name,
        reportedUserId: r.reported_user_id,
        reportedUserName: r.reported_user_name,
        reason: r.reason,
        details: r.details,
        status: r.status,
        adminNote: r.admin_note,
        createdAt: r.created_at,
      })),
    });
  });

  app.patch('/api/admin/reports/:id', requireAdmin, (req: AuthedRequest, res) => {
    const { status, adminNote } = req.body || {};
    if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
      res.status(400).json({ error: 'Invalid report status.' });
      return;
    }
    db.prepare('UPDATE reports SET status = ?, admin_note = ? WHERE report_id = ?').run(
      status,
      adminNote ? String(adminNote).slice(0, 400) : null,
      req.params.id
    );
    logAudit(req.user.uid, 'admin_review_report', `Updated report ${req.params.id} to ${status}`);
    res.json({ ok: true });
  });

  app.patch('/api/admin/config', requireAdmin, (req: AuthedRequest, res) => {
    const { minAmount, maxAmount, supportedRadii, defaultRadius, maxActiveRequests } = req.body || {};
    const minA = Math.round(Number(minAmount));
    const maxA = Math.round(Number(maxAmount));
    if (!Number.isFinite(minA) || !Number.isFinite(maxA) || minA < 50 || maxA <= minA || maxA > 200000) {
      res.status(400).json({ error: 'Provide valid min (≥ ₹50) and max (≤ ₹2,00,000) request limits.' });
      return;
    }
    const radii = Array.isArray(supportedRadii)
      ? supportedRadii.map(Number).filter((r) => r >= 250 && r <= 25000)
      : [500, 1000, 2000, 5000];
    const cleanRadii = radii.length > 0 ? Array.from(new Set(radii)).sort((a, b) => a - b) : [500, 1000, 2000, 5000];
    const defRadius = cleanRadii.includes(Number(defaultRadius)) ? Number(defaultRadius) : cleanRadii[0];
    const maxActive = Math.min(Math.max(Math.round(Number(maxActiveRequests) || 3), 1), 10);

    db.prepare(
      `UPDATE platform_config
       SET min_amount = ?, max_amount = ?, supported_radii = ?, default_radius = ?, max_active_requests = ?, updated_at = ?, updated_by = ?
       WHERE id = 1`
    ).run(minA, maxA, JSON.stringify(cleanRadii), defRadius, maxActive, new Date().toISOString(), req.user.uid);
    logAudit(req.user.uid, 'admin_update_config', `Updated limits ₹${minA}–₹${maxA}, radii ${cleanRadii.join(',')}`);
    res.json({ platformConfig: getPlatformConfig() });
  });

  // Mount Vite middleware in dev, or serve dist/ in production
  const server = http.createServer(app);

  // Real-time WebSocket Server attached to HTTP server on same port 3000
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${PORT}`);
      const token = url.searchParams.get('token') || parseCookies(req.headers.cookie).cb_session || null;
      const user = getUserBySession(token);
      if (!user || user.is_suspended) {
        ws.close(4001, 'Unauthorized');
        return;
      }
      const uid = user.uid as string;
      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid)!.add(ws);
      db.prepare('UPDATE users SET is_online = 1, last_active_at = ? WHERE uid = ?').run(new Date().toISOString(), uid);

      ws.on('close', () => {
        const set = userSockets.get(uid);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            userSockets.delete(uid);
            db.prepare('UPDATE users SET is_online = 0, last_active_at = ? WHERE uid = ?').run(
              new Date().toISOString(),
              uid
            );
          }
        }
      });
    } catch {
      ws.close(4000, 'Invalid handshake');
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CashBridge server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CashBridge server:', err);
  process.exit(1);
});
