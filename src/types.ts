export type UserRole = 'user' | 'admin';
export type RequestType = 'need_cash' | 'need_online';
export type RequestStatus = 'active' | 'matched' | 'completed' | 'cancelled' | 'expired';
export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed' | 'expired';
export type KycStatus = 'none' | 'pending' | 'verified';
export type PaymentMethod = 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer (IMPS)';

export interface NotificationPrefs {
  matches: boolean;
  connections: boolean;
  messages: boolean;
  expiry: boolean;
  verification: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  profileImage: string | null;
  dateOfBirth: string;
  isVerified: boolean;
  mobileVerified: boolean;
  kycStatus: KycStatus;
  role: UserRole;
  isSuspended: boolean;
  isOnline: boolean;
  locationSharingEnabled: boolean;
  approximateArea: string | null;
  approxLat: number | null;
  approxLng: number | null;
  ratingAvg: number;
  ratingCount: number;
  totalConnections: number;
  completedConnections: number;
  notificationPrefs: NotificationPrefs;
  blockedUserIds: string[];
  createdAt: string;
  lastActiveAt: string;
}

export interface PlatformConfig {
  minAmount: number;
  maxAmount: number;
  supportedRadii: number[];
  defaultRadius: number;
  maxActiveRequests: number;
  updatedAt: string;
}

export interface PublicConfigResponse {
  mapsApiKey: string;
  firebaseConfigured: boolean;
  platformConfig: PlatformConfig;
}

export interface ExchangeRequest {
  requestId: string;
  userId: string;
  userName: string;
  userPhoto: string | null;
  userVerified: boolean;
  userKycStatus: KycStatus;
  userRating: number;
  userRatingCount: number;
  userOnline: boolean;
  requestType: RequestType;
  amount: number;
  availableCashAmount: number | null;
  paymentMethod: PaymentMethod;
  description: string;
  radiusMeters: number;
  approxLat: number;
  approxLng: number;
  areaLabel: string;
  geohash: string;
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
  distanceMeters?: number;
  approxDistanceLabel?: string;
  compatibilityScore?: number;
  isExactOpposite?: boolean;
}

export interface ConnectionRecord {
  connectionId: string;
  requesterId: string;
  receiverId: string;
  requestId: string;
  requestType: RequestType;
  agreedAmount: number;
  paymentMethod: PaymentMethod;
  status: ConnectionStatus;
  requesterConfirmed: boolean;
  receiverConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  otherUser: {
    uid: string;
    name: string;
    profileImage: string | null;
    isVerified: boolean;
    kycStatus: KycStatus;
    isOnline: boolean;
    ratingAvg: number;
    ratingCount: number;
    approximateArea: string | null;
  };
  unreadCount: number;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  hasRated: boolean;
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: string;
  readStatus: boolean;
}

export interface AppNotification {
  notificationId: string;
  userId: string;
  type: 'match' | 'connection_request' | 'request_accepted' | 'request_rejected' | 'chat_message' | 'request_expiry' | 'verification';
  title: string;
  message: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface UserReview {
  ratingId: string;
  connectionId: string;
  reviewerId: string;
  reviewerName: string;
  reviewedUserId: string;
  rating: number;
  review: string;
  createdAt: string;
}

export interface ReportRecord {
  reportId: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  reason: string;
  details: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  adminNote: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: number;
  userId: string | null;
  userName: string | null;
  eventType: string;
  detail: string;
  createdAt: string;
}

export interface AdminOverview {
  metrics: {
    totalUsers: number;
    verifiedUsers: number;
    activeUsers: number;
    activeRequests: number;
    totalConnections: number;
    completedConnections: number;
    openReports: number;
    suspendedAccounts: number;
  };
  dailyActivity: Array<{
    date: string;
    requests: number;
    connections: number;
    completed: number;
  }>;
  auditEvents: AuditEvent[];
}

export interface LocationState {
  lat: number;
  lng: number;
  accuracy: number | null;
  areaLabel: string;
  source: 'gps' | 'manual';
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported';
  updatedAt: string;
}
