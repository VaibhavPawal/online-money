import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  MapPin,
  ShieldCheck,
  MessageSquareLock,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Users,
  X,
  Send,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { apiRequest } from '../lib/api';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

const FAQ_ITEMS = [
  {
    q: 'Does CashBridge hold my money or process UPI transactions?',
    a: 'No. CashBridge is strictly a nearby discovery and communication platform. We never hold funds, execute transfers, or ask for your UPI PIN, OTP, or banking password. Always verify every digital transfer directly inside your official bank or UPI app before handing over cash.',
  },
  {
    q: 'Are my exact home address and mobile number visible to strangers?',
    a: 'Never. Your mobile number is never displayed publicly to other users, and your coordinates are automatically rounded into an approximate ~200m neighborhood zone. Exact meetup details are shared only if you mutually accept a connection and choose to coordinate in private chat.',
  },
  {
    q: 'How does the 1 KM smart matching engine rank neighbors?',
    a: 'Matches require opposite exchange needs (Need Cash paired with Need Online Money), compatible amounts, active unexpired requests, verified accounts, and no mutual blocks. Results are ranked by best amount compatibility first, shortest approximate distance second, and community trust score third.',
  },
  {
    q: 'What if I deny GPS permission or disable location sharing?',
    a: 'You remain in complete control. If GPS is denied or paused in your privacy settings, all live location updates stop immediately and you can manually choose your locality from the neighborhood picker. Browser PWAs never track your GPS in the background once the app is closed.',
  },
  {
    q: 'Can I install CashBridge on Android, iPhone, and desktop?',
    a: 'Yes. CashBridge is built as a unified Progressive Web App (PWA). On Android Chrome and desktop browsers you can install directly from the Install App button; on iPhone Safari, tap Share followed by Add to Home Screen. Static UI files cache for fast loading while sensitive auth and exchange data are never cached offline.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', email: '', topic: 'General Inquiry', message: '' });
  const [contactStatus, setContactStatus] = useState<{ type: 'idle' | 'submitting' | 'success' | 'error'; msg?: string }>({
    type: 'idle',
  });
  const [heroImgError, setHeroImgError] = useState(false);
  const [safeImgError, setSafeImgError] = useState(false);
  const [proxImgError, setProxImgError] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus({ type: 'submitting' });
    try {
      const res = await apiRequest<{ message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactStatus({ type: 'success', msg: res.message });
      setContactForm({ name: '', email: '', topic: 'General Inquiry', message: '' });
    } catch (err: any) {
      setContactStatus({ type: 'error', msg: err.message || 'Unable to send message right now.' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Top Bar: Strict 3-zone contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="shrink-0">
            <BrandLogo variant="dark" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#how-it-works" className="hover:text-[#0B192C] transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#safety" className="hover:text-[#0B192C] transition-colors whitespace-nowrap shrink-0">
              Safety
            </a>
            <a href="#features" className="hover:text-[#0B192C] transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#faq" className="hover:text-[#0B192C] transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold text-emerald-700 tracking-wide">
                Nearby Peer Discovery · Default 1 KM Radius · Zero Fund Custody
              </p>
              <h1
                className="mt-4 font-display font-bold tracking-tight text-[#0B192C] leading-[1.1]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)' }}
              >
                Exchange cash and digital money with verified neighbors nearby.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Need physical cash while holding UPI balance—or carrying cash when you need money in your bank account? CashBridge matches opposite needs within your neighborhood so you can connect, chat privately, and coordinate safely in person.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="inline-flex items-center justify-center px-5 py-3 min-h-[48px] rounded-xl border border-slate-300 bg-white text-[#0B192C] text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Login
                </button>
                <PWAInstallButton variant="header" showFallbackTrigger />
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>18+ Verified Community</span>
                <span aria-hidden="true">·</span>
                <span>Approximate ~200m Map Privacy</span>
                <span aria-hidden="true">·</span>
                <span>No UPI PINs or Banking Credentials</span>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-[#0B192C] min-h-[300px] lg:h-full">
                {!heroImgError ? (
                  <img
                    src="/src/assets/images/hero_cashbridge_exchange_1795189306418.jpg"
                    alt="Two neighbors coordinating a cash and UPI exchange safely at a sunlit public cafe"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white bg-gradient-to-br from-[#0B192C] to-[#1B365D]">
                    <MapPin className="w-10 h-10 text-emerald-400" />
                    <p className="mt-3 text-lg font-display font-semibold">Neighborhood Cash &amp; UPI Discovery</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B192C]/90 via-[#0B192C]/45 to-transparent p-5 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium">Discovery &amp; Communication Only</span>
                    <span className="font-mono text-emerald-300">Default Radius: 1.0 KM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width 4-column principle strip below hero */}
          <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4 pt-8 border-t border-slate-200">
            <div>
              <div className="font-mono text-xl font-bold text-[#0B192C] tabular-nums">500 m – 5 KM</div>
              <div className="mt-1 text-xs text-slate-600">Adjustable neighborhood search radius</div>
            </div>
            <div>
              <div className="font-mono text-xl font-bold text-[#0B192C] tabular-nums">₹500 – ₹25,000</div>
              <div className="mt-1 text-xs text-slate-600">Default admin-configurable exchange range</div>
            </div>
            <div>
              <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums">Zero Custody</div>
              <div className="mt-1 text-xs text-slate-600">Verify transfers in your own official UPI app</div>
            </div>
            <div>
              <div className="font-mono text-xl font-bold text-[#0B192C] tabular-nums">Dual Confirm</div>
              <div className="mt-1 text-xs text-slate-600">Both neighbors independently close &amp; rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* How CashBridge Works */}
      <section id="how-it-works" className="py-16 lg:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B192C] tracking-tight">
            How CashBridge works in four clear steps
          </h2>
          <p className="mt-3 text-slate-600 text-base">
            Designed to turn opposite cash and digital payment needs into safe, transparent neighborhood meetups.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              num: '01.',
              title: 'Post Your Requirement',
              body: 'Choose I Need Cash or I Need Online Money, specify your amount, preferred UPI app, expiry window, and search radius.',
            },
            {
              num: '02.',
              title: 'Discover Ranked Matches',
              body: 'Our matching engine filters verified nearby users with opposite requests and ranks them by amount compatibility, proximity, and trust.',
            },
            {
              num: '03.',
              title: 'Accept & Chat Privately',
              body: 'Send a connection request. Private real-time chat unlocks only after mutual acceptance—your mobile number stays hidden.',
            },
            {
              num: '04.',
              title: 'Meet Publicly & Confirm',
              body: 'Meet at a well-lit public venue, verify bank settlement in your official UPI app, independently confirm completion, and leave a rating.',
            },
          ].map((step) => (
            <div key={step.num} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="font-mono text-sm font-semibold text-emerald-700">{step.num}</div>
              <h3 className="mt-3 text-base font-bold text-[#0B192C]">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Find Nearby Users & Secure Connections */}
      <section id="safety" className="py-16 lg:py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Block 1: Find Nearby Users */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#0B192C] tracking-tight">
                Find nearby users without revealing where you live
              </h2>
              <p className="mt-4 text-slate-600 leading-relaxed">
                CashBridge uses browser Geolocation strictly while you are active and consented. Coordinates are automatically fuzzed into approximate ~200m neighborhood zones with geohash indexing—showing neighbors distances like <span className="font-mono text-[#0B192C]">200 m</span> or <span className="font-mono text-[#0B192C]">450 m</span> without ever exposing your street address.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Interactive Google Maps view with approximate privacy-rounded pins and live radius overlay.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>One-tap Location Privacy toggle immediately halts GPS updates whenever you step offline.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Full manual neighborhood picker available whenever browser GPS permission is declined.</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100">
                {!proxImgError ? (
                  <img
                    src="/src/assets/images/feature_proximity_network_1795189300517.jpg"
                    alt="Minimalist smartphone and cardholder representing private digital and cash coordination"
                    referrerPolicy="no-referrer"
                    onError={() => setProxImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
                    Privacy-Preserving Proximity Discovery
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Block 2: Secure Connections */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="rounded-2xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100">
                {!safeImgError ? (
                  <img
                    src="/src/assets/images/feature_safe_meetup_1795189302512.jpg"
                    alt="Bright sunlit public neighborhood cafe plaza for safe daytime meetups"
                    referrerPolicy="no-referrer"
                    onError={() => setSafeImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
                    Safe Public Meetups
                  </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#0B192C] tracking-tight">
                Built around safety, verification, and non-custodial clarity
              </h2>
              <p className="mt-4 text-slate-600 leading-relaxed">
                Every design choice protects your financial independence and personal privacy. CashBridge connects people—it never touches your bank account or payment credentials.
              </p>
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Non-Custodial Safety Notice</div>
                  <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                    Never share UPI PINs, OTPs, bank passwords, or card security codes with anyone. Always verify incoming credits directly inside your official banking/UPI app and meet in well-lit public places during daylight hours.
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>18+ mandatory age check, duplicate prevention, spam &amp; chat rate limits, and admin moderation.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MessageSquareLock className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Instant Block &amp; Report buttons inside every connection and real-time chat window.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Asymmetric Bento Grid */}
      <section id="features" className="py-16 lg:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B192C] tracking-tight">
            Engineered for real neighborhood coordination
          </h2>
          <p className="mt-3 text-slate-600">
            One unified responsive PWA spanning Android phones, iPhones, tablets, and desktop workstations.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-[#0B192C] text-white p-7 flex flex-col justify-between">
            <div>
              <div className="text-xs font-medium text-emerald-300">Smart Discovery Engine</div>
              <h3 className="mt-2 text-xl font-bold">Automatic opposite-need compatibility ranking</h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-xl">
                When you post a request for ₹2,000 cash via UPI, CashBridge automatically prioritizes nearby verified neighbors carrying cash who want ₹2,000 online—ordered by exact amount overlap, shortest distance, and verified trust rating.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300 font-mono">
              <span>1. Amount Fit</span>
              <span>2. Shortest Distance</span>
              <span>3. Trust &amp; Rating</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7">
            <Smartphone className="w-6 h-6 text-emerald-600" />
            <h3 className="mt-4 text-lg font-bold text-[#0B192C]">Installable Cross-Platform PWA</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Install directly onto Android, iPhone, Windows, or macOS home screens for standalone app speed—without caching sensitive auth tokens or exchange logs offline.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7">
            <Users className="w-6 h-6 text-emerald-600" />
            <h3 className="mt-4 text-lg font-bold text-[#0B192C]">Dual-Confirmed Connection Log</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Every exchange tracks independent completion confirmation from both neighbors and unlocks post-meetup 1–5 star trust reviews.
            </p>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-[#0B192C]">Real-time 1:1 chat with read receipts &amp; safety controls</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-lg">
                Messaging unlocks strictly after mutual acceptance. See live online presence, delivery &amp; read receipts, unread counts, and one-tap block or report moderation tools.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-5 py-3 min-h-[44px] rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#10243E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Join CashBridge
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 lg:py-20 bg-white border-y border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B192C] tracking-tight">
            Frequently asked questions
          </h2>
          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full py-5 flex items-center justify-between gap-4 text-left min-h-[56px] cursor-pointer"
                  >
                    <span className="font-semibold text-base text-[#0B192C]">{item.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="pb-5 text-sm text-slate-600 leading-relaxed pr-8">{item.a}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* About Us & Contact Us */}
      <section id="contact" className="py-16 lg:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0B192C] tracking-tight">About CashBridge</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              CashBridge was built to solve an everyday friction across Indian neighborhoods: ATMs running dry or charging withdrawal fees while someone just two streets away has surplus cash and wants digital UPI balance.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Our platform focuses exclusively on hyperlocal discovery, privacy-preserving location matching, transparent trust ratings, and active safety moderation—never acting as a payment intermediary or money custodian.
            </p>
            <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
              <div>Platform Safety &amp; Support Hours: Mon–Sat, 9:00 AM – 8:00 PM IST</div>
              <div>Compliance &amp; Moderation Inquiries: safety@cashbridge.in</div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <form
              onSubmit={handleContactSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-4"
            >
              <div>
                <h3 className="text-lg font-bold text-[#0B192C]">Contact Us</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Have questions about community safety, verification, or partnerships? Send us a note.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ananya Sharma"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="ananya@example.com"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-topic" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Topic
                </label>
                <select
                  id="contact-topic"
                  value={contactForm.topic}
                  onChange={(e) => setContactForm((p) => ({ ...p, topic: e.target.value }))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                >
                  <option>General Inquiry</option>
                  <option>Trust &amp; Safety Report</option>
                  <option>Account Verification</option>
                  <option>Technical / PWA Support</option>
                </select>
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  rows={3}
                  required
                  value={contactForm.message}
                  onChange={(e) => setContactForm((p) => ({ ...p, message: e.target.value }))}
                  placeholder="How can our team assist you?"
                  className="w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              {contactStatus.type === 'success' && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
                  {contactStatus.msg}
                </div>
              )}
              {contactStatus.type === 'error' && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {contactStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={contactStatus.type === 'submitting'}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#10243E] disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{contactStatus.type === 'submitting' ? 'Sending...' : 'Send Message'}</span>
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-[#0B192C] text-slate-300 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <BrandLogo variant="light" size="sm" />
            <p className="mt-2 text-xs text-slate-400 max-w-md">
              CashBridge facilitates nearby peer discovery and communication only. It does not hold funds, execute payments, or verify bank settlements.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Login
            </button>
            <span className="text-slate-500">© {new Date().getFullYear()} CashBridge</span>
          </div>
        </div>
      </footer>

      {/* Privacy Policy / Terms Modal */}
      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-[#0B192C]">
                {legalModal === 'privacy' ? 'CashBridge Privacy Policy' : 'CashBridge Terms & Conditions'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {legalModal === 'privacy' ? (
              <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
                <p>
                  <strong>1. Privacy-First Location Handling:</strong> Browser GPS is accessed only after explicit user consent and only while CashBridge is open. Public exchange listings store only rounded approximate coordinates (~200m grid) and geohashes—never your exact residential address. Disabling location sharing halts GPS updates immediately.
                </p>
                <p>
                  <strong>2. Contact &amp; Credential Isolation:</strong> Your mobile number, email address, and date of birth are never displayed to other users. CashBridge never collects or stores OTPs, UPI PINs, bank passwords, or card CVVs.
                </p>
                <p>
                  <strong>3. Google Maps Platform Integration:</strong> Interactive map views incorporate Google Maps Platform features and are subject to the{' '}
                  <a
                    href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 underline"
                  >
                    Google Maps End User Additional Terms of Service
                  </a>{' '}
                  and the{' '}
                  <a
                    href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 underline"
                  >
                    Google Privacy Policy
                  </a>
                  .
                </p>
                <p>
                  <strong>4. PWA Offline Cache Security:</strong> Our service worker caches only static interface files and fonts. Authentication sessions, private chats, and exchange records are never stored in browser offline caches.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
                <p>
                  <strong>1. Eligibility (18+ Mandatory):</strong> You must be at least 18 years old and legally able to enter into agreements in India to register and use CashBridge.
                </p>
                <p>
                  <strong>2. Non-Custodial Discovery Platform:</strong> CashBridge solely facilitates discovery and communication between nearby users. CashBridge is not a bank, payment aggregator, wallet, or escrow provider. Completion confirmations logged on CashBridge do not constitute proof of actual bank or UPI settlement.
                </p>
                <p>
                  <strong>3. User Safety Responsibilities:</strong> Always verify incoming bank or UPI credits directly inside your official banking application before handing over cash. Meet only in well-lit public places. Never share UPI PINs, banking credentials, or OTPs.
                </p>
                <p>
                  <strong>4. Moderation &amp; Enforcement:</strong> Spam requests, harassment, fraudulent behavior, or abuse of rate limits may result in immediate account suspension by platform administrators.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setLegalModal(null)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#10243E]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
