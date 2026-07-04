'use client';

import { useState, useRef, useEffect, KeyboardEvent, CSSProperties, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import KaprukaAdminUI from './KaprukaAdminUI';

// Renders Ruki's replies as markdown (bold, bullet/numbered lists, links) so longer
// policy/FAQ answers read cleanly. Default block margins are stripped so it sits tight
// inside the chat bubble; only this minimal element set is allowed.
function RukiMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#5C3FB0', textDecoration: 'underline' }}>{children}</a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ─────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return isMobile;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type AvatarKey = 'idle' | 'greeting' | 'thinking' | 'search' | 'show' | 'detail' | 'cart' | 'delivery' | 'done';

interface RealProduct {
  id: string;
  name: string;
  price: { amount: number | null; currency: string };
  comparePrice?: number | null;
  image_url: string | null;
  in_stock: boolean;
  url: string;
  summary: string;
  tone: string;
  glyph: string;
}

interface ProductTab {
  label: string;
  ids: string[];
}

interface Message {
  id: string;
  role: 'user' | 'bot';
  kind: string;
  text?: string;
  productId?: string;      // for detail, cartconfirm
  items?: string[];        // flat products (unlabelled / curated)
  tabs?: ProductTab[];     // labelled multi-tab products (2+ searches)
  done?: boolean;
  streaming?: boolean;
  city?: string;
  date?: string;
  rate?: number;
  order?: string;
  payUrl?: string;
  payAmount?: number;
  itemsTotal?: number;
  deliveryFee?: number;
  itemsCount?: number;
  payItems?: { name: string; qty: number; price: number; imageUrl: string | null }[];
  orderRef?: string;
  expiresAt?: string;
  trackData?: import('@/lib/chat/types').TrackResult;
  savedAddrs?: SavedAddress[];
  [key: string]: unknown;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  imageUrl: string | null;
  tone: string;
  glyph: string;
}

interface SavedAddress {
  id: string;
  label: string;
  recipientName: string;
  city: string;
  phone: string;
  address?: string;
  isDefault: boolean;
}

interface ToastInfo {
  id: number;
  text: string;
  icon: string;
}

interface AppState {
  input: string;
  started: boolean;
  streaming: boolean;
  status: string | null;
  headerState: AvatarKey;
  messages: Message[];
  forms: Record<string, Record<string, unknown>>;
  cart: CartItem[];
  wishlist: string[];
  drawer: string | null;
  toast: ToastInfo | null;
  avSeq: number;
  products: Record<string, RealProduct>;
  selectedTabs: Record<string, number>;
  productDetails: Record<string, { bullets: string[]; images: string[]; description?: string } | 'error'>;
  detailImageIdx: Record<string, number>;
  conversationId: string | null;
  savedAddrs: SavedAddress[];
  conversations: ConversationRow[];
  loadingDrawers: Record<string, boolean>;
}

interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const AV: Record<AvatarKey, string> = {
  idle:     '/avatar/video/optimized/idle.mp4',
  greeting: '/avatar/video/optimized/greeting.mp4',
  thinking: '/avatar/video/optimized/thinking.mp4',
  search:   '/avatar/video/optimized/searching-products.mp4',
  show:     '/avatar/video/optimized/show-products.mp4',
  detail:   '/avatar/video/optimized/details-on-product.mp4',
  cart:     '/avatar/video/optimized/add-to-cart.mp4',
  delivery: '/avatar/video/optimized/delivery.mp4',
  done:     '/avatar/video/optimized/purchase-complete.mp4',
};

const AVP: Record<AvatarKey, string> = {
  idle:     '/avatar/images/idle.png',
  greeting: '/avatar/images/greeting.png',
  thinking: '/avatar/images/thinking.png',
  search:   '/avatar/images/searching-products.png',
  show:     '/avatar/images/show-products.png',
  detail:   '/avatar/images/details-on-product.png',
  cart:     '/avatar/images/add-to-cart.png',
  delivery: '/avatar/images/delivery.png',
  done:     '/avatar/images/purchase-complete.png',
};

const IDLE_VARIANTS = [
  '/avatar/video/optimized/idle.mp4',
  '/avatar/video/optimized/idle-v2.mp4',
  '/avatar/video/optimized/idle-v3.mp4',
];

const TONES = ['rose', 'cocoa', 'mint', 'peach', 'violet'];

function sentenceCase(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const TONE_COLORS: Record<string, string[]> = {
  rose:   ['#FBD7E3', '#F4A8C4', '#D86A95'],
  cocoa:  ['#EAD9C4', '#D2A878', '#9E6B3C'],
  mint:   ['#D5EFE2', '#A7DEC6', '#5FB893'],
  peach:  ['#FCE2CF', '#F7C39A', '#E89A5E'],
  violet: ['#E4D8FA', '#C3A9F2', '#8B6FE8'],
};

// Dummy data shown to every user for now — replaced by real records once the
// backend has them (see the /api/addresses load effect).
const DUMMY_ADDRESSES: SavedAddress[] = [
  { id: 'demo-home',    label: 'Home',           recipientName: 'Sahan Perera', city: 'Colombo 05', phone: '077 123 4567', address: '42 Flower Road, Colombo 05', isDefault: true },
  { id: 'demo-office',  label: 'Office',          recipientName: 'Sahan Perera', city: 'Colombo 03', phone: '071 987 6543', address: '8 Galle Face Terrace, Colombo 03', isDefault: false },
  { id: 'demo-parents', label: "Parents' Home",  recipientName: 'Nimal Perera', city: 'Kandy',      phone: '081 222 3344', address: '15 Temple Lane, Kandy', isDefault: false },
];

interface DemoOrder {
  id: string;
  date: string;
  status: string;
  statusLabel: string;
  total: number;
  items: string[];
}

const DUMMY_ORDERS: DemoOrder[] = [
  { id: 'KPR-2026-11035', date: 'Jun 27, 2026', status: 'confirmed',        statusLabel: 'Confirmed',        total: 5600,  items: ['Ceylon Tea Gift Box'] },
  { id: 'KPR-2026-10921', date: 'Jun 24, 2026', status: 'out_for_delivery', statusLabel: 'Out for delivery', total: 12900, items: ['Red Roses Bouquet (12)', 'Birthday Greeting Card'] },
  { id: 'KPR-2026-10482', date: 'Jun 18, 2026', status: 'delivered',        statusLabel: 'Delivered',        total: 8450,  items: ['Premium Chocolate Hamper'] },
];

// ─────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────

const ICON_PATHS: Record<string, string | string[]> = {
  plus:   'M12 4v16m8-8H4',
  edit:   'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  gear:   ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  clock:  'M12 7v5l3 2',
  box:    'M21 8l-9-5-9 5 9 5 9-5ZM3 8v8l9 5 9-5V8M12 13v8',
  heart:  'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  cart:   'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  send:   'M22 2 11 13M22 2l-7 20-4-9-9-4 22-7Z',
  spark:  'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z',
  check:  'M20 6 9 17l-5-5',
  pin:    'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  cal:    'M7 3v3M17 3v3M3.5 9h17M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  user:   'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c0-3.3 3.6-5 8-5s8 1.7 8 5',
  star:   'M12 3l2.6 5.6L21 9.3l-4.5 4.3 1.1 6.4L12 17l-5.6 3 1.1-6.4L3 9.3l6.4-.7L12 3Z',
  close:  'M18 6 6 18M6 6l12 12',
  menu:   'M4 6h16M4 12h16M4 18h16',
  chev:   'M9 6l6 6-6 6',
  back:   'M15 6l-6 6 6 6',
  flower: 'M12 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 8c0-3 2-4 2-4M12 8c0-3-2-4-2-4M12 14c0 3 2 4 2 4M12 14c0 3-2 4-2 4M9 11c-3 0-4-2-4-2M15 11c3 0 4-2 4-2M9 11c-3 0-4 2-4 2M15 11c3 0 4 2 4 2',
  gift:   'M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M2 7h20v5H2zM12 22V7M12 7S11 3 8.5 3 6 6 12 7M12 7s1-4 3.5-4S18 6 12 7',
  mug:    'M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 10h2a2 2 0 0 1 0 4h-2',
  truck:  'M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  msg:    'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z',
  ship:   'M2 13h20l-2 6H4l-2-6ZM6 13V7a2 2 0 0 1 2-2h4l4 4v4',
  chart:  'M3 21V5M3 21h18M8 21v-6M13 21v-10M18 21v-4',
  link:   'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  google: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z',
};

function Icon({ name, size = 18, color = 'currentColor', fill }: { name: string; size?: number; color?: string; fill?: string }) {
  const d = ICON_PATHS[name];
  const ds = Array.isArray(d) ? d : [d || ''];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={fill ? 'none' : color} strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
      {ds.map((path, i) => <path key={i} d={path} />)}
    </svg>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function tileGrad(tone: string) {
  const G = TONE_COLORS[tone] || TONE_COLORS.violet;
  return `linear-gradient(140deg, ${G[0]} 0%, ${G[1]} 60%, ${G[2]} 100%)`;
}

function money(n: number) {
  return 'Rs ' + Number(n).toLocaleString('en-US');
}

// ─────────────────────────────────────────────
// Avatar Video Component
// ─────────────────────────────────────────────

function AvatarVideo({ src, poster, loop = true, style }: { src: string; poster?: string; loop?: boolean; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
    v.play().catch(() => {});
    if (!loop) {
      const holdLastFrame = () => { if (v.duration) v.currentTime = v.duration - 0.001; };
      v.addEventListener('ended', holdLastFrame);
      return () => v.removeEventListener('ended', holdLastFrame);
    }
  }, [src, loop]);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      autoPlay
      loop={loop}
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }}
    />
  );
}

// ─────────────────────────────────────────────
// Stable sub-components (defined outside main component to prevent remounts)
// ─────────────────────────────────────────────

function Card({ children, accent, lush }: { children: React.ReactNode; accent?: string; lush?: boolean }) {
  let bg = '#fff', border = '1px solid rgba(64,41,112,.09)', shadow = '0 10px 30px rgba(64,41,112,.1)';
  if (accent && lush) { bg = `linear-gradient(180deg, ${accent}16 0%, ${accent}05 90px, #fff 200px)`; border = `1px solid ${accent}2e`; shadow = `0 10px 30px ${accent}1f`; }
  else if (accent) { bg = `linear-gradient(180deg, ${accent}0d 0%, #fff 130px)`; border = `1px solid ${accent}26`; shadow = `0 8px 28px ${accent}33, 0 2px 8px ${accent}1a`; }
  return <div style={{ background: bg, border, borderRadius: 20, boxShadow: shadow, overflow: 'hidden', animation: 'widgetIn .5s cubic-bezier(.2,.9,.3,1) both' }}>{children}</div>;
}

// Labelled text input. Module-scope so its identity is stable across parent
// renders — defining it inside the component remounts the <input> on every
// keystroke (setForm → re-render), which drops focus mid-typing.
function Field({ label, value, onChange, type = 'text', ph, half }: { label: string; value: string; onChange: (v: string) => void; type?: string; ph?: string; half?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: half ? '1 1 45%' : '1 1 100%' }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#9389AE', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</label>
      <input type={type} value={value} placeholder={ph} onChange={e => onChange(e.target.value)}
        style={{ border: '1.5px solid ' + (value ? '#C9B8ED' : '#E6DEF5'), borderRadius: 11, padding: '11px 13px', fontSize: 14, outline: 'none', color: '#241C3D', background: value ? '#FAF8FE' : '#fff' }} />
    </div>
  );
}

// City lookups hit the Kapruka MCP tool, whose first call per serverless instance
// pays a cold connection handshake (~seconds). These module-level singletons warm
// that connection before the user types and cache results client-side, so lookups
// feel instant from the very first keystroke. Cache survives for the tab's lifetime.
const cityQueryCache = new Map<string, string[]>();
let cityWarmStarted = false;

function warmCityLookup() {
  if (cityWarmStarted) return;
  cityWarmStarted = true;
  // Fire-and-forget: establishes the MCP connection and primes a common prefix.
  fetch('/api/cities?q=co')
    .then(r => r.json())
    .then((d: { cities?: { name: string }[] }) => {
      const names = (d.cities || []).map((c) => c.name);
      if (names.length) cityQueryCache.set('co', names);
    })
    .catch(() => { cityWarmStarted = false; }); // allow a retry if warming failed
}

// City autocomplete — owns its own local fetch state. Module-scope so it keeps a
// stable identity (no remount on every parent render) and its hooks stay isolated.
function CityAutocomplete({ value, hasCity, onChange, onPick }: {
  value: string; hasCity: boolean; onChange: (q: string) => void; onPick: (city: string) => void;
}) {
  const [apiCities, setApiCities] = useState<string[]>([]);

  // Warm the MCP connection as soon as the delivery card mounts — before the user
  // has finished reading it and started typing — so the first lookup isn't cold.
  useEffect(() => { warmCityLookup(); }, []);

  useEffect(() => {
    if (value.length < 2 || hasCity) { setApiCities([]); return; }
    const q = value.trim().toLowerCase();
    const cached = cityQueryCache.get(q);
    if (cached) { setApiCities(cached); return; }
    const timeout = setTimeout(() => {
      fetch(`/api/cities?q=${encodeURIComponent(value)}`)
        .then(r => r.json())
        .then((d: { cities?: { name: string }[] }) => {
          const names = (d.cities || []).map((c: { name: string }) => c.name);
          if (names.length) cityQueryCache.set(q, names);
          setApiCities(names);
        })
        .catch(() => setApiCities([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [value, hasCity]);

  return (
    <div style={{ marginBottom: 14, position: 'relative' }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#9389AE', textTransform: 'uppercase', letterSpacing: '.4px' }}>Deliver to city</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, border: '1.5px solid ' + (hasCity ? '#C9B8ED' : '#E6DEF5'), borderRadius: 12, padding: '10px 13px', background: hasCity ? '#F7F3FE' : '#fff' }}>
        <Icon name="pin" size={16} color="#7B5BD6" />
        <input value={value} placeholder="Start typing… e.g. Colombo" onChange={e => onChange(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: '#241C3D' }} />
        {hasCity && <Icon name="check" size={16} color="#1F9D6B" />}
      </div>
      {apiCities.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid rgba(64,41,112,.12)', borderRadius: 12, boxShadow: '0 10px 26px rgba(64,41,112,.16)', overflow: 'hidden', zIndex: 5 }}>
          {apiCities.map(c => (
            <div key={c} onClick={() => onPick(c)} style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', color: '#3A2E5C', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#F3EEFC')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#fff')}>
              <Icon name="pin" size={14} color="#B7AECB" /> {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function KaprukaChatUI() {
  const { data: session, status: sessionStatus } = useSession();
  const isMobile = useIsMobile();
  const [railOpen, setRailOpen] = useState(false);
  const userName = session?.user?.name?.split(' ')[0] || 'there';
  const userInitial = (session?.user?.name || 'R')[0].toUpperCase();
  const isAnon = (session?.user as { isAnonymous?: boolean })?.isAnonymous ?? true;

  const [state, setState] = useState<AppState>({
    input: '',
    started: false,
    streaming: false,
    status: null,
    headerState: 'greeting',
    messages: [],
    forms: {},
    cart: [],
    wishlist: [],
    drawer: null,
    toast: null,
    avSeq: 0,
    products: {},
    selectedTabs: {},
    productDetails: {},
    detailImageIdx: {},
    conversationId: null,
    savedAddrs: DUMMY_ADDRESSES,
    conversations: [],
    loadingDrawers: {},
  });

  // Mirror the latest state into a stable ref. sendMessage is a useCallback that
  // doesn't depend on state, so the buildHistory/buildCartPayload closures it
  // captures would otherwise read stale (post-login, empty) cart/messages —
  // making the model think the cart is empty and lose conversation memory.
  const stateRef = useRef(state);
  stateRef.current = state;

  const scrollRef = useRef<HTMLDivElement>(null);
  const uidRef = useRef(1);
  const ttRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef<string>('');
  const streamingProductsMsgIdRef = useRef<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const productsShownRef = useRef(false);
  // Gift-message helper: typewriter reveal interval for the "Help me write" draft.
  const giftRevealRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Empty-turn auto-retry: did this turn render anything (text/products/widget/
  // track card)? If not, replay the user's message automatically up to 3× —
  // the same action as the manual retry button — before giving up.
  const turnProducedOutputRef = useRef(false);
  const autoRetryRef = useRef(0);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.messages, state.streaming, state.status]);

  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [adminView, setAdminView] = useState(false);
  useEffect(() => {
    if (!isAnon) { setShowSignInPrompt(false); return; }
    const show = setTimeout(() => setShowSignInPrompt(true), 2500);
    const hide = setTimeout(() => setShowSignInPrompt(false), 9000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [isAnon]);

  // Auto-sign-in as guest if unauthenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      signIn('guest', { redirect: false }).then((res) => {
        if (res?.ok) {
          document.cookie = `_ruki_anon=${(session as { user?: { id?: string } } | null)?.user?.id ?? ''}; path=/; max-age=2592000`;
        }
      }).catch(() => {});
    }
  }, [sessionStatus, session]);

  // Load cart, addresses, and wishlist from API on auth
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    setState(prev => ({ ...prev, loadingDrawers: { ...prev.loadingDrawers, cart: true, wishlist: true, saved: true } }));

    fetch('/api/wishlist').then(r => r.json()).then(d => {
      if (!Array.isArray(d.items)) return;
      const ids: string[] = d.items.map((i: { productId: string }) => i.productId);
      const synthetic: Record<string, RealProduct> = {};
      d.items.forEach((item: { productId: string; name: string; imageUrl: string | null; priceAmount: number }, idx: number) => {
        synthetic[item.productId] = {
          id: item.productId,
          name: item.name,
          price: { amount: item.priceAmount, currency: 'LKR' },
          comparePrice: null,
          image_url: item.imageUrl,
          in_stock: true,
          url: '',
          summary: '',
          tone: TONES[idx % TONES.length],
          glyph: 'gift',
        };
      });
      setState(prev => ({
        ...prev,
        wishlist: ids,
        products: { ...synthetic, ...prev.products },
        loadingDrawers: { ...prev.loadingDrawers, wishlist: false },
      }));
    }).catch(() => setState(prev => ({ ...prev, loadingDrawers: { ...prev.loadingDrawers, wishlist: false } })));

    fetch('/api/cart').then(r => r.json()).then(d => {
      if (!Array.isArray(d.items)) return;
      const loaded = (d.items as { product_id: string; name: string; price: { amount: number }; quantity: number }[]).map(i => ({
        id: i.product_id,
        name: i.name,
        price: i.price.amount,
        qty: i.quantity,
        imageUrl: null as string | null,
        tone: 'violet',
        glyph: 'gift',
      }));
      setState(prev => ({ ...prev, cart: loaded, loadingDrawers: { ...prev.loadingDrawers, cart: false } }));

      // Cart items persisted from a previous session don't carry their product image,
      // so the cart drawer and the final payment card (which snapshots the cart's
      // imageUrls at checkout) would show blank tiles. Hydrate each item's image from
      // the product endpoint (cached server-side) and mirror it into `products` so
      // both surfaces render it.
      loaded.forEach(it => {
        fetch(`/api/product/${encodeURIComponent(it.id)}`)
          .then(r => (r.ok ? r.json() : null))
          .then((p: { image_url?: string | null; images?: string[] } | null) => {
            const img = p?.image_url ?? p?.images?.[0] ?? null;
            if (!img) return;
            setState(prev => ({
              ...prev,
              cart: prev.cart.map(c => (c.id === it.id ? { ...c, imageUrl: img } : c)),
              products: prev.products[it.id]
                ? { ...prev.products, [it.id]: { ...prev.products[it.id], image_url: img } }
                : { ...prev.products, [it.id]: { id: it.id, name: it.name, price: { amount: it.price, currency: 'LKR' }, comparePrice: null, image_url: img, in_stock: true, url: '', summary: '', tone: 'violet', glyph: 'gift' } },
            }));
          })
          .catch(() => {});
      });
    }).catch(() => setState(prev => ({ ...prev, loadingDrawers: { ...prev.loadingDrawers, cart: false } })));

    fetch('/api/addresses').then(r => r.json()).then(d => {
      if (!Array.isArray(d.addresses)) return;
      // Keep the demo addresses visible until the backend actually has records.
      setState(prev => ({
        ...prev,
        savedAddrs: d.addresses.length ? d.addresses : prev.savedAddrs,
        loadingDrawers: { ...prev.loadingDrawers, saved: false },
      }));
    }).catch(() => setState(prev => ({ ...prev, loadingDrawers: { ...prev.loadingDrawers, saved: false } })));
  }, [sessionStatus]);

  // ── helpers ──
  const cartCount = (cart = state.cart) => cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = (cart = state.cart) => cart.reduce((s, i) => s + i.price * i.qty, 0);
  const getProduct = useCallback((id: string) => state.products[id], [state.products]);

  const showToast = (text: string, icon: string) => {
    const id = ++uidRef.current;
    setState(prev => ({ ...prev, toast: { id, text, icon } }));
    clearTimeout(ttRef.current);
    ttRef.current = setTimeout(() => setState(prev => prev.toast?.id === id ? { ...prev, toast: null } : prev), 2600);
  };

  const setAvatar = useCallback((s: AvatarKey) => {
    // Skip redundant re-sets so the searching animation isn't restarted between
    // consecutive searches (each search emits its own "Searching" status).
    setState(prev => (prev.headerState === s ? prev : { ...prev, headerState: s, avSeq: prev.avSeq + 1 }));
  }, []);

  const setForm = (key: string, val: Record<string, unknown>) => {
    setState(prev => ({ ...prev, forms: { ...prev.forms, [key]: { ...(prev.forms[key] || {}), ...val } } }));
  };

  const pushUser = (text: string) => {
    const id = String(++uidRef.current);
    setState(prev => ({ ...prev, started: true, messages: [...prev.messages, { id, role: 'user', kind: 'text', text }] }));
  };

  const pushBot = (msg: Record<string, unknown>) => {
    const id = String(++uidRef.current);
    setState(prev => ({ ...prev, messages: [...prev.messages, { id, role: 'bot', kind: 'text', ...msg } as Message] }));
  };

  const completeMsg = (id: string) => {
    setState(prev => ({ ...prev, messages: prev.messages.map(m => m.id === id ? { ...m, done: true } : m) }));
  };

  // ── streaming message helpers ──
  const createStreamingMsg = () => {
    const id = String(++uidRef.current);
    streamingMsgIdRef.current = id;
    // Start each turn fresh — otherwise this turn's products merge into a previous
    // turn's (now off-screen / removed) card and nothing appears.
    streamingProductsMsgIdRef.current = null;
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { id, role: 'bot', kind: 'text', text: '', streaming: true }],
    }));
  };

  const appendStreamingText = (text: string) => {
    // Buffer in ref — no setState means no re-render during streaming
    streamingTextRef.current += text;
  };

  const clearStreamingMsg = () => {
    // Used only on error — remove the typing indicator bubble
    const msgId = streamingMsgIdRef.current;
    if (!msgId) return;
    streamingMsgIdRef.current = null;
    streamingTextRef.current = '';
    streamingProductsMsgIdRef.current = null;
    setState(prev => ({ ...prev, messages: prev.messages.filter(m => m.id !== msgId) }));
  };

  const resetStreamingText = () => {
    // Used on clear_text event — reset buffer but keep the typing indicator bubble visible
    streamingTextRef.current = '';
  };

  const finalizeStreamingMsg = () => {
    const msgId = streamingMsgIdRef.current;
    if (!msgId) return;
    streamingMsgIdRef.current = null;
    streamingProductsMsgIdRef.current = null;
    // Strip any stray PRODUCTS tag the model may emit — object or array form,
    // anywhere in the text (not just trailing). Products render from tool
    // results, so this tag is never meant to reach the user.
    const text = streamingTextRef.current
      .replace(/PRODUCTS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    streamingTextRef.current = '';
    if (text) turnProducedOutputRef.current = true;
    setState(prev => ({
      ...prev,
      messages: text
        ? prev.messages.map(m => m.id === msgId ? { ...m, text, streaming: false } : m)
        : prev.messages.filter(m => m.id !== msgId),
    }));
  };

  // ── build history for API ──
  // Carries not just chat text but a compact reference of the products & detail
  // cards already shown, so the model can resolve follow-ups like "the first one",
  // "can I send my own photo?", or "tell me more about this frame".
  const buildHistory = (msgs: Message[] = stateRef.current.messages) => {
    const { products, productDetails } = stateRef.current;
    const fmtPrice = (p?: { amount: number | null; currency: string }) =>
      p && p.amount != null ? `Rs ${p.amount.toLocaleString('en-LK')}` : 'price n/a';
    const out: { role: 'user' | 'ruki'; text: string }[] = [];
    for (const m of msgs) {
      if (m.streaming) continue;
      if (m.role === 'user') {
        if (m.text) out.push({ role: 'user', text: m.text });
        continue;
      }
      if (m.kind === 'text' && m.text) {
        out.push({ role: 'ruki', text: m.text });
      } else if (m.kind === 'products') {
        const ids = m.tabs ? m.tabs.flatMap(t => t.ids) : (m.items ?? []);
        const lines = ids.slice(0, 12)
          .map(id => products[id])
          .filter((p): p is RealProduct => Boolean(p))
          .map(p => `• ${p.name} (id: ${p.id}, ${fmtPrice(p.price)})${p.summary ? ` — ${p.summary}` : ''}`);
        if (lines.length) {
          out.push({ role: 'ruki', text: `[Products shown to the user just now — reference for follow-ups; do not paste this list back verbatim]\n${lines.join('\n')}` });
        }
      } else if (m.kind === 'detail' && m.productId) {
        const p = products[m.productId];
        const det = productDetails[m.productId];
        const loaded = det && det !== 'error' ? det : undefined;
        // Prefer the exact full MCP description; fall back to the card summary.
        const fullDesc = loaded?.description?.trim() || p?.summary || '';
        const bullets = loaded?.bullets ?? [];
        const facts = [
          fullDesc ? `Description: ${fullDesc.slice(0, 2000)}` : '',
          bullets.length ? `Highlights: ${bullets.join('; ')}` : '',
        ].filter(Boolean).join('\n');
        out.push({ role: 'ruki', text: `[Product detail card shown to the user — id: ${m.productId}, ${p?.name ?? 'product'}, ${fmtPrice(p?.price)}]${facts ? `\n${facts}` : ''}` });
      }
    }
    return out;
  };

  const buildCartPayload = () => stateRef.current.cart.map(i => ({
    product_id: i.id,
    name: i.name,
    image_url: i.imageUrl ?? null,
    price: { amount: i.price, currency: 'LKR' },
    quantity: i.qty,
  }));

  // ── handle stream events ──
  const handleStreamEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case 'text_delta': {
        appendStreamingText(event.text as string);
        break;
      }
      case 'clear_text': {
        resetStreamingText();
        break;
      }
      case 'status': {
        const label = event.label as string;
        setState(prev => ({ ...prev, status: label }));
        if (/search/i.test(label)) setAvatar('search');
        else if (/product|loading/i.test(label)) setAvatar('detail');
        else if (/delivery|checking/i.test(label)) setAvatar('delivery');
        else if (/order|placing/i.test(label)) setAvatar('done');
        break;
      }
      case 'products': {
        const incoming = event.products as Array<{
          id: string; name: string;
          price: { amount: number | null; currency: string };
          compare_at_price?: { amount: number | null; currency: string } | null;
          image_url: string | null;
          in_stock: boolean; url: string; summary: string;
        }>;
        const eventLabel = event.label as string | undefined;
        const newIds = incoming.map(p => p.id);

        const newProducts: Record<string, RealProduct> = {};
        incoming.forEach((p, i) => {
          newProducts[p.id] = {
            ...p,
            comparePrice: p.compare_at_price?.amount ?? null,
            tone: TONES[i % TONES.length],
            glyph: 'gift',
          };
        });

        const existingId = streamingProductsMsgIdRef.current;
        if (existingId) {
          setState(prev => ({
            ...prev,
            products: { ...prev.products, ...newProducts },
            status: null,
            messages: prev.messages.map(m => {
              if (m.id !== existingId) return m;
              if (eventLabel && m.tabs) {
                // labelled → add new tab (merge into existing tab if same label)
                const lastTab = m.tabs[m.tabs.length - 1];
                if (lastTab.label === eventLabel) {
                  const tabs = [...m.tabs];
                  tabs[tabs.length - 1] = { ...lastTab, ids: [...new Set([...lastTab.ids, ...newIds])] };
                  return { ...m, tabs };
                }
                return { ...m, tabs: [...m.tabs, { label: eventLabel, ids: newIds }] };
              }
              // unlabelled (curated) → flat merge
              return { ...m, items: [...new Set([...(m.items ?? []), ...newIds])] };
            }),
          }));
        } else {
          const msgId = String(++uidRef.current);
          streamingProductsMsgIdRef.current = msgId;
          const newMsg: Message = eventLabel
            ? { id: msgId, role: 'bot', kind: 'products', tabs: [{ label: eventLabel, ids: newIds }] }
            : { id: msgId, role: 'bot', kind: 'products', items: newIds };
          setState(prev => ({
            ...prev,
            products: { ...prev.products, ...newProducts },
            status: null,
            messages: [...prev.messages, newMsg],
          }));
        }
        // Don't reveal yet — keep the searching animation until the whole
        // operation finishes (see the 'done' handler). Just record that we have products.
        productsShownRef.current = true;
        turnProducedOutputRef.current = true;
        break;
      }
      case 'widget': {
        const widgetType = event.widget as string;
        const data = (event.data || {}) as Record<string, unknown>;
        setState(prev => ({ ...prev, status: null }));

        let kind = 'text';
        const extra: Record<string, unknown> = {};

        switch (widgetType) {
          case 'city_date':     kind = 'citydate'; setAvatar('delivery'); break;
          case 'recipient':     kind = 'recipient'; break;
          case 'sender':        kind = 'sender'; break;
          case 'gift_message':  kind = 'gift'; break;
          case 'saved_address':
            kind = 'saved';
            extra.savedAddrs = Array.isArray(data.addresses) ? data.addresses : [];
            break;
          case 'pay_url':
            kind = 'pay_url';
            extra.payUrl = data.url;
            extra.payAmount = data.amount;
            extra.itemsTotal = data.items_total;
            extra.deliveryFee = data.delivery_fee;
            extra.itemsCount = data.items_count;
            extra.orderRef = data.order_ref;
            extra.expiresAt = data.expires_at;
            // Snapshot the cart into the card so it itemises the order with photos,
            // independent of later cart changes. (Live session only — see WPayUrl.)
            extra.payItems = stateRef.current.cart.map(i => ({ name: i.name, qty: i.qty, price: i.price, imageUrl: i.imageUrl }));
            setAvatar('done');
            break;
          case 'track_order':
            kind = 'track_input';
            break;
          default:
            kind = 'text';
            extra.text = `[${widgetType}]`;
        }
        pushBot({ kind, ...extra });
        turnProducedOutputRef.current = true;
        // Purchase complete — invite the customer to rate the experience.
        if (kind === 'pay_url') {
          const ref = extra.orderRef as string | undefined;
          setTimeout(() => pushBot({ kind: 'feedback', orderRef: ref }), 1400);
        }
        break;
      }
      case 'track_result': {
        const msgId = String(++uidRef.current);
        setState(prev => ({
          ...prev,
          status: null,
          messages: [...prev.messages, { id: msgId, role: 'bot', kind: 'track_result', trackData: event.data as import('@/lib/chat/types').TrackResult }],
        }));
        turnProducedOutputRef.current = true;
        setAvatar('delivery');
        break;
      }
      case 'done': {
        finalizeStreamingMsg();
        const revealed = productsShownRef.current;
        productsShownRef.current = false;
        clearTimeout(revealTimeoutRef.current);
        if (revealed) {
          // Whole search operation finished — play the reveal once, then ease back to idle.
          setState(prev => ({ ...prev, status: null, streaming: false, headerState: 'show', avSeq: prev.avSeq + 1 }));
          revealTimeoutRef.current = setTimeout(() => setAvatar('idle'), 10000);
        } else {
          // Nothing to reveal — don't leave the avatar stuck mid-search or mid-thinking.
          setState(prev => ({
            ...prev, status: null, streaming: false,
            ...(prev.headerState === 'search' || prev.headerState === 'thinking' ? { headerState: 'idle', avSeq: prev.avSeq + 1 } : {}),
          }));
        }
        break;
      }
    }
  }, [setAvatar]);

  // ── core send message to API ──
  const sendMessage = useCallback(async (text: string, historyOverride?: import('@/lib/chat/types').ChatMessage[]) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    createStreamingMsg();
    clearTimeout(revealTimeoutRef.current);
    productsShownRef.current = false;
    turnProducedOutputRef.current = false;
    // A fresh user message (no historyOverride) starts a new retry budget;
    // manual/auto retries pass historyOverride and keep the running count.
    if (!historyOverride) autoRetryRef.current = 0;
    setState(prev => ({ ...prev, streaming: true, status: 'Thinking' }));
    setAvatar('thinking');

    try {
      // Auto-create conversation
      if (!convIdRef.current && sessionStatus === 'authenticated') {
        try {
          const r = await fetch('/api/conversations', { method: 'POST' });
          if (r.ok) {
            const { id } = await r.json() as { id: string };
            convIdRef.current = id;
            setState(prev => ({ ...prev, conversationId: id }));
          }
        } catch {}
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyOverride ?? buildHistory(),
          cart: buildCartPayload(),
          conversationId: convIdRef.current,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { handleStreamEvent(JSON.parse(line)); }
          catch (e) { console.error('[sendMessage] failed to handle stream line:', line, e); }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      clearStreamingMsg();
      pushBot({ kind: 'text', text: 'Something went wrong. Please try again.' });
      setAvatar('idle');
      autoRetryRef.current = 0;
      return;
    } finally {
      finalizeStreamingMsg();
      setState(prev => ({ ...prev, streaming: false, status: null }));
    }

    // ── empty-turn auto-retry ──
    // The agent finished but rendered nothing (no text/products/widget/track).
    // Replay the last user message automatically — same as the retry button —
    // up to 3× before giving up, so the user isn't left with a lone retry button.
    if (!turnProducedOutputRef.current) {
      if (autoRetryRef.current < 3) {
        autoRetryRef.current++;
        console.warn(`[sendMessage] empty agent turn — auto-retry ${autoRetryRef.current}/3`);
        const msgs = stateRef.current.messages;
        let userIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'user') { userIdx = i; break; }
        }
        const userText = userIdx === -1 ? '' : (msgs[userIdx].text ?? '');
        if (userText) {
          const historyOverride = buildHistory(msgs.slice(0, userIdx));
          // Drop any stray bot turns after the user message before replaying.
          setState(prev => ({ ...prev, messages: prev.messages.slice(0, userIdx + 1) }));
          sendMessage(userText, historyOverride);
          return;
        }
      }
      // Out of retries (or nothing to replay) — leave a message so the turn
      // isn't a silent dead-end; the manual retry button remains available.
      console.warn('[sendMessage] empty agent turn — auto-retry exhausted');
      pushBot({ kind: 'text', text: "I'm having trouble responding right now — please try again." });
      setAvatar('idle');
    }
    autoRetryRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, handleStreamEvent, setAvatar]);

  // ── retry — replays the last user message, wiping subsequent bot turn ──
  const retryLastUser = () => {
    if (state.streaming) return;
    const msgs = state.messages;
    let userMsgIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { userMsgIdx = i; break; }
    }
    if (userMsgIdx === -1) return;
    const userText = msgs[userMsgIdx].text ?? '';
    if (!userText) return;
    const historyOverride = buildHistory(msgs.slice(0, userMsgIdx));
    setState(prev => ({ ...prev, messages: prev.messages.slice(0, userMsgIdx + 1) }));
    sendMessage(userText, historyOverride);
  };

  // ── user input ──
  const send = () => {
    const t = (state.input || '').trim();
    if (!t || state.streaming) return;
    setState(prev => ({ ...prev, input: '' }));
    pushUser(t);
    sendMessage(t);
  };

  // ── product actions ──
  type ProductDetailData = { bullets: string[]; images: string[]; description: string };
  // Fetch the AI summary bullets + full image list for a product's detail card.
  const loadProductDetails = useCallback(async (id: string): Promise<ProductDetailData | undefined> => {
    try {
      const r = await fetch('/api/product-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id }),
      });
      const d = await r.json() as { bullets?: string[]; images?: string[]; description?: string };
      const det: ProductDetailData = { bullets: d.bullets ?? [], images: d.images ?? [], description: d.description ?? '' };
      setState(prev => ({ ...prev, productDetails: { ...prev.productDetails, [id]: det } }));
      return det;
    } catch {
      setState(prev => ({ ...prev, productDetails: { ...prev.productDetails, [id]: 'error' } }));
      return undefined;
    }
  }, []);

  // Detail cards are opened client-side (no /api/chat round-trip), so persist the
  // interaction explicitly — otherwise it vanishes when the conversation reloads.
  const persistDetailInteraction = useCallback((p: RealProduct, userText: string, botText: string, det?: { bullets: string[]; images: string[]; description?: string }) => {
    const convId = convIdRef.current;
    if (!convId || sessionStatus !== 'authenticated') return;
    const snippet = {
      id: p.id,
      name: p.name,
      price: p.price,
      compare_at_price: p.comparePrice != null ? { amount: p.comparePrice, currency: p.price.currency } : null,
      image_url: p.image_url,
      in_stock: p.in_stock,
      url: p.url,
      summary: p.summary,
    };
    fetch(`/api/conversations/${convId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: userText },
          {
            role: 'assistant',
            content: '',
            widgets: { kind: 'detail', productId: p.id, bullets: det?.bullets ?? [], description: det?.description ?? '', images: det?.images ?? [] },
            products: [snippet],
          },
          { role: 'assistant', content: botText },
        ],
      }),
    }).catch(() => {});
  }, [sessionStatus]);

  const openDetail = (id: string) => {
    const p = getProduct(id);
    if (!p) return;
    const userText = `Tell me more about the ${p.name}`;
    const botText = `Here are the full details for ${p.name}! Add it to your cart, or ask me anything about it. 🛍️`;
    pushUser(userText);
    pushBot({ kind: 'detail', productId: id });
    pushBot({ kind: 'text', text: botText });
    setState(prev => ({ ...prev, detailImageIdx: { ...prev.detailImageIdx, [id]: 0 } }));
    setAvatar('detail');
    const existing = state.productDetails[id];
    if (existing && existing !== 'error') {
      persistDetailInteraction(p, userText, botText, existing);
    } else {
      loadProductDetails(id).then(det => persistDetailInteraction(p, userText, botText, det));
    }
  };

  // "Added to cart" is triggered client-side (no /api/chat round-trip), so
  // persist it explicitly — otherwise it vanishes when the conversation reloads.
  const persistCartConfirm = useCallback((p: RealProduct) => {
    const convId = convIdRef.current;
    if (!convId || sessionStatus !== 'authenticated') return;
    const snippet = {
      id: p.id,
      name: p.name,
      price: p.price,
      compare_at_price: p.comparePrice != null ? { amount: p.comparePrice, currency: p.price.currency } : null,
      image_url: p.image_url,
      in_stock: p.in_stock,
      url: p.url,
      summary: p.summary,
    };
    fetch(`/api/conversations/${convId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'assistant', content: '', widgets: { kind: 'cartconfirm', productId: p.id }, products: [snippet] },
        ],
      }),
    }).catch(() => {});
  }, [sessionStatus]);

  const toggleWish = (id: string) => {
    const has = state.wishlist.includes(id);
    setState(prev => ({ ...prev, wishlist: has ? prev.wishlist.filter(x => x !== id) : [...prev.wishlist, id] }));
    if (!has) {
      const p = getProduct(id);
      if (p) {
        fetch('/api/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: id, name: p.name, image_url: p.image_url, price_amount: p.price.amount ?? 0 }),
        }).catch(() => {});
      }
    } else {
      fetch(`/api/wishlist/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    showToast(has ? 'Removed from wishlist' : 'Saved to wishlist', 'heart');
  };

  const addToCart = (id: string) => {
    const p = getProduct(id);
    if (!p || !p.price.amount) return;
    const amount = p.price.amount;
    setState(prev => {
      const ex = prev.cart.find(i => i.id === id);
      const cart = ex
        ? prev.cart.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i)
        : [...prev.cart, { id, name: p.name, price: amount, qty: 1, imageUrl: p.image_url, tone: p.tone, glyph: p.glyph }];
      return { ...prev, cart };
    });
    fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: id, name: p.name, price_amount: amount }),
    }).catch(() => {});
    showToast(`Added · ${money(amount)}`, 'cart');
    pushBot({ kind: 'cartconfirm', productId: id });
    persistCartConfirm(p);
    setAvatar('cart');
  };

  const setQty = (id: string, d: number) => setState(prev => ({
    ...prev,
    cart: prev.cart.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + d) } : i),
  }));
  const removeCart = (id: string) => {
    setState(prev => ({ ...prev, cart: prev.cart.filter(i => i.id !== id) }));
    fetch(`/api/cart?product_id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  };
  const clearCart = () => {
    setState(prev => ({ ...prev, cart: [] }));
    fetch('/api/cart', { method: 'DELETE' }).catch(() => {});
  };

  // ── checkout handlers (send to agent) ──
  const beginCheckout = () => {
    if (state.cart.length === 0) { showToast('Your cart is empty', 'cart'); return; }
    setState(prev => ({ ...prev, drawer: null }));
    // Warm the city lookup now — the delivery card (with its autocomplete) is a few
    // agent turns away, giving the MCP connection time to establish before the user types.
    warmCityLookup();
    const text = "I'd like to check out";
    pushUser(text);
    sendMessage(text);
  };

  const submitCityDate = (mid: string) => {
    const f = state.forms['cd_' + mid] || {};
    if (!f.city || !f.date) { showToast('Pick a city and date', 'cal'); return; }
    completeMsg(mid);
    const text = `Deliver to ${String(f.city)} on ${String(f.dateFull)}`;
    pushUser(text);
    sendMessage(text);
  };

  const submitSaved = (mid: string, addrId: string, addrs: SavedAddress[]) => {
    const a = addrs.find(x => x.id === addrId) || state.savedAddrs.find(x => x.id === addrId);
    if (!a) return;
    completeMsg(mid);
    const text = `Deliver to: ${a.recipientName}, ${a.city}, ${a.phone}`;
    pushUser(text);
    sendMessage(text);
  };

  const newAddress = (mid: string) => {
    completeMsg(mid);
    const text = 'Use a new address';
    pushUser(text);
    sendMessage(text);
  };

  const submitRecipient = (mid: string) => {
    const k = 'rc_' + mid;
    const f = state.forms[k] || {};
    const addrs = state.savedAddrs;
    const hasSaved = addrs.length > 0;
    // No saved addresses → the widget only shows the new-address fields.
    const addingNew = hasSaved ? Boolean(f.addingNew) : true;

    if (!addingNew) {
      // A saved address is selected — default to the default/first when untouched.
      const selId = (f.selectedAddrId as string) || addrs.find(a => a.isDefault)?.id || addrs[0]?.id;
      const a = addrs.find(x => x.id === selId);
      if (!a) { showToast('Pick an address', 'pin'); return; }
      completeMsg(mid);
      const text = `Recipient: ${a.recipientName} | ${a.phone} | ${a.address || a.city}`;
      pushUser(text);
      sendMessage(text);
      return;
    }

    // Entering a brand-new address.
    if (!f.name || !f.phone || !f.address) { showToast('Fill all recipient fields', 'user'); return; }
    completeMsg(mid);
    if (f.save) {
      // Save to local state only (for the Settings view). We deliberately do NOT
      // persist to /api/addresses — saved addresses are no longer fed to the agent
      // (that flow looped/misfired); the recipient card surfaces them client-side.
      const addr: SavedAddress = {
        id: 'local-' + (++uidRef.current),
        label: 'Saved address',
        recipientName: String(f.name),
        city: String(f.address),
        phone: String(f.phone),
        address: String(f.address),
        isDefault: false,
      };
      setState(prev => ({ ...prev, savedAddrs: [...prev.savedAddrs, addr] }));
      showToast('Address saved', 'pin');
    }
    const text = `Recipient: ${String(f.name)} | ${String(f.phone)} | ${String(f.address)}`;
    pushUser(text);
    sendMessage(text);
  };

  // Mark a saved address as the default (used in the Settings drawer).
  const setDefaultAddress = (id: string) => {
    setState(prev => ({ ...prev, savedAddrs: prev.savedAddrs.map(a => ({ ...a, isDefault: a.id === id })) }));
    if (sessionStatus === 'authenticated' && !id.startsWith('demo-') && !id.startsWith('local-')) {
      fetch(`/api/addresses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      }).catch(() => {});
    }
    showToast('Default address updated', 'pin');
  };

  const submitSender = (mid: string) => {
    const f = state.forms['sn_' + mid] || {};
    if (!f.name) { showToast('Enter the sender name', 'user'); return; }
    completeMsg(mid);
    const text = `Sender: ${String(f.name)}`;
    pushUser(text);
    sendMessage(text);
  };

  // Type the drafted note in character-by-character so the card feels like Ruki is
  // writing it live, rather than the text snapping in all at once.
  const revealGiftMessage = (k: string, full: string) => {
    clearInterval(giftRevealRef.current);
    let i = 0;
    const step = Math.max(1, Math.round(full.length / 48)); // ~48 frames ≈ 1s
    giftRevealRef.current = setInterval(() => {
      i = Math.min(full.length, i + step);
      if (i >= full.length) {
        clearInterval(giftRevealRef.current);
        setForm(k, { message: full, writing: false });
      } else {
        setForm(k, { message: full.slice(0, i) });
      }
    }, 22);
  };

  // Draft the gift note — only when the user presses "Help me write".
  const helpWrite = async (mid: string) => {
    const k = 'gf_' + mid;
    if (stateRef.current.forms[k]?.writing) return;
    clearInterval(giftRevealRef.current);
    setForm(k, { writing: true, message: '' });
    try {
      const r = await fetch('/api/gift-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: buildHistory(),
          sender: session?.user?.name ?? '',
        }),
      });
      if (!r.ok) throw new Error('bad response');
      const d = await r.json() as { message?: string };
      if (!d.message) throw new Error('empty');
      revealGiftMessage(k, d.message);
      showToast('Drafted a message for you ✨', 'spark');
    } catch {
      setForm(k, { writing: false });
      showToast("Couldn't draft one — give it another try", 'spark');
    }
  };

  const submitGift = (mid: string, skip: boolean) => {
    const f = state.forms['gf_' + mid] || {};
    completeMsg(mid);
    const text = skip ? 'No gift message.' : `Gift message: ${String(f.message || '')}`;
    pushUser(text);
    sendMessage(text);
  };

  const submitFeedback = (mid: string) => {
    const k = 'fb_' + mid;
    const f = state.forms[k] || {};
    const rating = Number(f.rating || 0);
    if (!rating) { showToast('Tap a star to rate', 'star'); return; }
    const comment = String(f.comment || '').trim();
    const orderRef = state.messages.find(m => m.id === mid)?.orderRef as string | undefined;
    completeMsg(mid);
    setForm(k, { submitted: true });
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment, order_ref: orderRef, conversation_id: convIdRef.current }),
    }).catch(() => {});
  };

  const submitTrackInput = (mid: string) => {
    const f = state.forms['ti_' + mid] || {};
    if (!f.orderNo) { showToast('Enter your order number', 'box'); return; }
    completeMsg(mid);
    const orderNo = String(f.orderNo).trim();
    pushUser(orderNo);
    sendMessage('Track order ' + orderNo);
  };

  const newChat = () => {
    abortRef.current?.abort();
    convIdRef.current = null;
    setAdminView(false);
    setState(prev => ({
      ...prev,
      started: false, messages: [], streaming: false, status: null,
      headerState: 'greeting', drawer: null, input: '', conversationId: null,
      forms: {}, avSeq: prev.avSeq + 1,
    }));
  };
  const openDrawer = (tab: string) => setState(prev => ({ ...prev, drawer: prev.drawer === tab ? null : tab }));

  // ── load conversation history ──
  const loadConversation = async (id: string) => {
    setState(prev => ({ ...prev, drawer: null }));
    try {
      const r = await fetch(`/api/conversations/${id}`);
      const d = await r.json() as { conversation: { id: string; title: string }; messages: Array<{ role: string; content: string; products?: unknown; widgets?: unknown }> };
      convIdRef.current = id;

      // Stored products are either the new shape [{ label?, products: Snippet[] }]
      // or the legacy flat Snippet[]. Normalise both to labelled tabs.
      type Snippet = {
        id: string; name: string; price: { amount: number | null; currency: string };
        compare_at_price?: { amount: number | null; currency: string } | null;
        image_url: string | null; in_stock: boolean; url: string; summary: string;
      };
      const normaliseTabs = (raw: unknown): { label?: string; products: Snippet[] }[] => {
        if (!Array.isArray(raw) || raw.length === 0) return [];
        const first = raw[0] as Record<string, unknown>;
        if (first && Array.isArray(first.products)) {
          return (raw as { label?: string; products: Snippet[] }[]).filter(t => Array.isArray(t.products) && t.products.length);
        }
        return [{ products: raw as Snippet[] }]; // legacy flat array → one unlabelled tab
      };

      const msgs: Message[] = [];
      const restoredProducts: Record<string, RealProduct> = {};
      const restoredDetails: Record<string, { bullets: string[]; images: string[]; description: string }> = {};
      for (const m of d.messages) {
        const role = m.role === 'user' ? 'user' as const : 'bot' as const;

        // Stored widget payload — either a client-persisted detail/cart card
        // ({kind, productId}) or a bot-emitted event ({type/widget, data}) such
        // as the payment link or a track-order result.
        const w = (m.widgets ?? null) as {
          kind?: string; productId?: string; bullets?: string[]; description?: string; images?: string[];
          type?: string; widget?: string; data?: Record<string, unknown>;
        } | null;

        // Persisted detail-card interaction → rebuild the card + rehydrate its details.
        if (role === 'bot' && w?.kind === 'detail' && w.productId) {
          const snippet = Array.isArray(m.products) ? (m.products as Snippet[])[0] : undefined;
          if (snippet) {
            restoredProducts[snippet.id] = {
              ...snippet,
              comparePrice: snippet.compare_at_price?.amount ?? null,
              tone: TONES[0],
              glyph: 'gift',
            };
          }
          restoredDetails[w.productId] = { bullets: w.bullets ?? [], images: w.images ?? [], description: w.description ?? '' };
          msgs.push({ id: String(++uidRef.current), role: 'bot', kind: 'detail', productId: w.productId });
          continue;
        }

        // Persisted "added to cart" confirmation → rebuild the card.
        if (role === 'bot' && w?.kind === 'cartconfirm' && w.productId) {
          const snippet = Array.isArray(m.products) ? (m.products as Snippet[])[0] : undefined;
          if (snippet) {
            restoredProducts[snippet.id] = {
              ...snippet,
              comparePrice: snippet.compare_at_price?.amount ?? null,
              tone: TONES[0],
              glyph: 'gift',
            };
          }
          msgs.push({ id: String(++uidRef.current), role: 'bot', kind: 'cartconfirm', productId: w.productId });
          continue;
        }

        // Order-tracking result → rebuild the track_result card.
        if (role === 'bot' && w?.type === 'track_result' && w.data) {
          msgs.push({ id: String(++uidRef.current), role: 'bot', kind: 'track_result', trackData: w.data as unknown as import('@/lib/chat/types').TrackResult });
          continue;
        }

        // Payment link card → rebuild it after the bot's preamble text so the
        // checkout link (with order ref + expiry) survives a reload.
        if (role === 'bot' && w?.widget === 'pay_url') {
          const data = w.data ?? {};
          if (m.content) msgs.push({ id: String(++uidRef.current), role: 'bot', kind: 'text', text: m.content });
          msgs.push({
            id: String(++uidRef.current),
            role: 'bot',
            kind: 'pay_url',
            payUrl: typeof data.url === 'string' ? data.url : undefined,
            payAmount: typeof data.amount === 'number' ? data.amount : undefined,
            itemsTotal: typeof data.items_total === 'number' ? data.items_total : undefined,
            deliveryFee: typeof data.delivery_fee === 'number' ? data.delivery_fee : undefined,
            itemsCount: typeof data.items_count === 'number' ? data.items_count : undefined,
            orderRef: typeof data.order_ref === 'string' ? data.order_ref : undefined,
            expiresAt: typeof data.expires_at === 'string' ? data.expires_at : undefined,
            payItems: Array.isArray(data.payItems)
              ? data.payItems as { name: string; qty: number; price: number; imageUrl: string | null }[]
              : undefined,
          });
          continue;
        }

        if (m.content) {
          msgs.push({ id: String(++uidRef.current), role, kind: 'text', text: m.content });
        }
        if (role === 'bot' && m.products) {
          const tabs = normaliseTabs(m.products);
          const labelledTabs: ProductTab[] = [];
          const flatIds: string[] = [];
          for (const t of tabs) {
            const ids: string[] = [];
            t.products.forEach((p, i) => {
              restoredProducts[p.id] = {
                ...p,
                comparePrice: p.compare_at_price?.amount ?? null,
                tone: TONES[i % TONES.length],
                glyph: 'gift',
              };
              ids.push(p.id);
            });
            if (t.label) labelledTabs.push({ label: t.label, ids });
            else flatIds.push(...ids);
          }
          if (labelledTabs.length) msgs.push({ id: String(++uidRef.current), role: 'bot', kind: 'products', tabs: labelledTabs });
          if (flatIds.length) msgs.push({ id: String(++uidRef.current), role: 'bot', kind: 'products', items: flatIds });
        }
      }

      setState(prev => ({
        ...prev,
        conversationId: id,
        started: msgs.length > 0,
        messages: msgs,
        products: { ...prev.products, ...restoredProducts },
        productDetails: { ...prev.productDetails, ...restoredDetails },
        headerState: 'idle',
      }));
    } catch {
      showToast('Could not load conversation', 'close');
    }
  };

  const loadConversations = async () => {
    setState(prev => ({ ...prev, loadingDrawers: { ...prev.loadingDrawers, history: true } }));
    try {
      const r = await fetch('/api/conversations');
      const d = await r.json() as { conversations: ConversationRow[] };
      setState(prev => ({ ...prev, conversations: d.conversations || [], loadingDrawers: { ...prev.loadingDrawers, history: false } }));
    } catch {
      setState(prev => ({ ...prev, loadingDrawers: { ...prev.loadingDrawers, history: false } }));
    }
  };

  // ── sub-renders ──

  const ProductImage = ({ p, height = 120, glyphSize = 48, src }: { p: RealProduct; height?: number; glyphSize?: number; src?: string }) => {
    const url = src ?? p.image_url;
    if (url) {
      return (
        <div style={{ position: 'relative', width: '100%', height, borderRadius: 14, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', width: '100%', height, borderRadius: 14, overflow: 'hidden', background: tileGrad(p.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 80% 0%, rgba(255,255,255,.5), transparent 55%)' }} />
        <Icon name={p.glyph || 'gift'} size={glyphSize} color="rgba(255,255,255,.95)" />
      </div>
    );
  };

  const Stars = ({ rating, reviews }: { rating?: number; reviews?: number }) => {
    if (!rating) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon name="star" size={13} color="#FDB813" fill="#FDB813" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4A3D6B' }}>{rating.toFixed(1)}</span>
        {reviews && <span style={{ fontSize: 11, color: '#9389AE' }}>({reviews})</span>}
      </div>
    );
  };


  // ── widget renderers ──

  const ProductCard = ({ id, i }: { id: string; i: number }) => {
    const p = getProduct(id)!;
    const inW = state.wishlist.includes(id);
    return (
      <div key={id} style={{ flex: '0 0 210px', scrollSnapAlign: 'start', background: '#fff', border: '1px solid rgba(64,41,112,.1)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'widgetIn .5s both', animationDelay: (i * 60) + 'ms', boxShadow: '0 2px 10px rgba(64,41,112,.06)' }}>
        <div style={{ position: 'relative' }}>
          <ProductImage p={p} height={130} glyphSize={42} />
          <button onClick={() => toggleWish(id)} style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
            <Icon name="heart" size={16} color={inW ? '#E5447A' : '#9389AE'} fill={inW ? '#E5447A' : undefined} />
          </button>
        </div>
        <div style={{ padding: '11px 12px 13px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A', lineHeight: 1.25 }}>{p.name}</div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {p.comparePrice && p.price.amount && p.comparePrice > p.price.amount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, color: '#9389AE', textDecoration: 'line-through' }}>{money(p.comparePrice)}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#C0392B', background: '#FDECEA', padding: '2px 5px', borderRadius: 4 }}>
                  -{Math.round((1 - p.price.amount / p.comparePrice) * 100)}%
                </span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#402970', whiteSpace: 'nowrap' }}>{p.price.amount ? money(p.price.amount) : 'View price'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.in_stock ? '#1F9D6B' : '#D98818', background: p.in_stock ? '#E4F6EE' : '#FCF1DD', padding: '2px 6px', borderRadius: 5 }}>{p.in_stock ? 'In stock' : 'Limited'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
            <button onClick={() => openDetail(id)} style={{ flex: 1, padding: 9, borderRadius: 10, border: '1.5px solid #E2D9F3', background: '#fff', color: '#5C3FB0', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Details</button>
            <button onClick={() => addToCart(id)} style={{ width: 38, padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={16} color="#fff" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const WProducts = ({ m }: { m: Message }) => {
    const hasTabs = (m.tabs?.length ?? 0) > 1;
    const activeTabIdx = hasTabs ? (state.selectedTabs[m.id] ?? 0) : 0;

    // Resolve which IDs to show and the label for "load more"
    let displayIds: string[];
    let activeLabel: string | undefined;
    if (m.tabs) {
      const tab = m.tabs[Math.min(activeTabIdx, m.tabs.length - 1)];
      displayIds = tab.ids;
      activeLabel = tab.label;
    } else {
      displayIds = m.items ?? [];
      activeLabel = undefined;
    }
    const loadedIds = displayIds.filter(id => !!getProduct(id));

    // Total across all tabs (for header count)
    const totalLoaded = m.tabs
      ? m.tabs.reduce((s, t) => s + t.ids.filter(id => !!getProduct(id)).length, 0)
      : loadedIds.length;

    if (totalLoaded === 0) return null;

    return (
      <Card>
        {/* ── header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970' }}>
            <Icon name="spark" size={16} color="#7B5BD6" /> {totalLoaded} gift ideas
          </div>
          <div style={{ fontSize: 11, color: '#9389AE' }}>Swipe to browse</div>
        </div>

        {/* ── tab strip (only when 2+ labelled searches) ── */}
        {hasTabs && (
          <div style={{ display: 'flex', gap: 6, margin: '0 18px', padding: '8px 0 2px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {m.tabs!.map((tab, i) => {
              const active = i === activeTabIdx;
              const cnt = tab.ids.filter(id => !!getProduct(id)).length;
              return (
                <button
                  key={i}
                  onClick={() => {
                    setState(prev => ({ ...prev, selectedTabs: { ...prev.selectedTabs, [m.id]: i } }));
                    requestAnimationFrame(() => {
                      const el = document.getElementById(`carousel-${m.id}`);
                      if (el) el.scrollLeft = 0;
                    });
                  }}
                  style={{
                    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                    color: active ? '#fff' : '#7B5BD6',
                    background: active ? '#5C3FB0' : '#F0EAFB',
                    boxShadow: active ? '0 2px 8px rgba(64,41,112,.18)' : 'none',
                    opacity: cnt === 0 ? 0.4 : 1,
                    transition: 'all .15s',
                  }}
                >
                  {sentenceCase(tab.label)}
                  {cnt > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px',
                      background: active ? 'rgba(255,255,255,.22)' : 'rgba(123,91,214,.14)',
                      color: active ? '#fff' : '#7B5BD6',
                    }}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── carousel ── */}
        <div id={`carousel-${m.id}`} style={{ display: 'flex', gap: 14, overflowX: 'auto', margin: '0 18px', padding: '8px 0 14px', scrollSnapType: 'x mandatory' }}>
          {loadedIds.map((id, i) => ProductCard({ id, i }))}

          {/* load more sentinel — only for labelled searches */}
          {activeLabel && (
            <div
              onClick={() => {
                const msg = `Show me more options for "${sentenceCase(activeLabel!)}"`;
                pushUser(msg);
                sendMessage(msg);
              }}
              style={{ flex: '0 0 88px', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', opacity: 0.55, transition: 'opacity .2s', userSelect: 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.55'; }}
            >
              <div style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #C9B8ED', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F5FF' }}>
                <span style={{ fontSize: 18, color: '#7B5BD6', lineHeight: 1 }}>›</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7B5BD6', textAlign: 'center', lineHeight: 1.3 }}>More</div>
            </div>
          )}
        </div>
      </Card>
    );
  };

  const WDetail = ({ m }: { m: Message }) => {
    const p = getProduct(m.productId as string);
    if (!p) return null;
    const inW = state.wishlist.includes(p.id);

    const det = state.productDetails[p.id];
    const loadingAi = det === undefined;
    const aiData = det && det !== 'error' ? det : null;

    // Images: prefer the full list from the details endpoint; fall back to the card image.
    const imgs = aiData?.images.length ? aiData.images : (p.image_url ? [p.image_url] : []);
    const activeImg = Math.min(state.detailImageIdx[p.id] ?? 0, Math.max(0, imgs.length - 1));

    // Bullets: AI summary if available, else split the raw snippet summary.
    const fallbackLines = p.summary ? p.summary.split('. ').filter(Boolean).slice(0, 4) : [];
    const bullets = aiData?.bullets.length ? aiData.bullets : fallbackLines;
    return (
      <Card>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: isMobile ? '1 1 100%' : '0 0 230px', padding: isMobile ? '16px 16px 4px' : 16 }}>
            <ProductImage p={p} height={210} glyphSize={72} src={imgs[activeImg]} />
            {imgs.length > 1 && (
              <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                {imgs.slice(0, 4).map((url, i) => (
                  <button key={i} onClick={() => setState(prev => ({ ...prev, detailImageIdx: { ...prev.detailImageIdx, [p.id]: i } }))}
                    style={{ flex: 1, height: 48, padding: 0, borderRadius: 9, cursor: 'pointer', border: i === activeImg ? '2px solid #5C3FB0' : '1px solid rgba(64,41,112,.12)', opacity: i === activeImg ? 1 : 0.55, overflow: 'hidden', background: '#fff', transition: 'opacity .15s, border-color .15s' }}>
                    <ProductImage p={p} height={46} glyphSize={18} src={url} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: isMobile ? '1 1 100%' : '1 1 280px', padding: isMobile ? '4px 16px 18px' : '18px 20px 18px 6px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <Stars />
            <div style={{ fontFamily: "var(--font-baloo2), 'Baloo 2', sans-serif", fontWeight: 700, fontSize: 21, color: '#2A1E4A', lineHeight: 1.15 }}>{p.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={{ fontWeight: 800, fontSize: 24, color: '#402970' }}>{p.price.amount ? money(p.price.amount) : '—'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.in_stock ? '#1F9D6B' : '#D98818', background: p.in_stock ? '#E4F6EE' : '#FCF1DD', padding: '4px 9px', borderRadius: 7 }}>{p.in_stock ? 'In stock' : 'Low stock'}</span>
            </div>
            {loadingAi ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0' }}>
                {['85%', '72%', '78%'].map((w, i) => (
                  <div key={i} style={{ height: 11, width: w, borderRadius: 6, background: 'linear-gradient(90deg,#EEE7FB 25%,#F7F3FE 50%,#EEE7FB 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.3s ease-in-out infinite' }} />
                ))}
              </div>
            ) : bullets.length > 0 ? (
              <ul style={{ margin: '2px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bullets.map((d, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#5C5276', alignItems: 'flex-start' }}>
                    <span style={{ color: '#7B5BD6', marginTop: 1, flex: '0 0 auto' }}><Icon name="check" size={14} color="#7B5BD6" /></span>{d.trim()}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, color: '#5C5276', margin: '2px 0', lineHeight: 1.5 }}>{p.summary || 'Ask me for more details!'}</p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={() => addToCart(p.id)} style={{ flex: 1, padding: 13, borderRadius: 13, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 6px 18px rgba(64,41,112,.3)' }}>
                <Icon name="cart" size={17} color="#fff" /> Add to cart
              </button>
              <button onClick={() => toggleWish(p.id)} style={{ padding: '13px 16px', borderRadius: 13, cursor: 'pointer', border: '1.5px solid ' + (inW ? '#F2C2D4' : '#E2D9F3'), background: inW ? '#FDEEF4' : '#fff', color: inW ? '#E5447A' : '#5C3FB0', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="heart" size={16} color={inW ? '#E5447A' : '#5C3FB0'} fill={inW ? '#E5447A' : undefined} />
              </button>
            </div>
            {/* View on Kapruka — subtle link */}
            {p.url && (
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9389AE', textDecoration: 'none', marginTop: 2 }}>
                <Icon name="link" size={12} color="#9389AE" /> View on Kapruka
              </a>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const WCartConfirm = ({ m }: { m: Message }) => {
    const p = getProduct(m.productId as string);
    if (!p) return null;
    return (
      <Card accent="#1F9D6B" lush>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flex: '0 0 auto' }}><ProductImage p={p} height={52} glyphSize={22} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#1F9D6B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={14} color="#1F9D6B" /> Added to cart</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#2A1E4A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            <div style={{ fontSize: 12, color: '#9389AE' }}>{cartCount()} item(s) · {money(subtotal())}</div>
          </div>
          <button onClick={beginCheckout} style={{ padding: '10px 16px', borderRadius: 11, border: 'none', cursor: 'pointer', background: '#FDB813', color: '#402970', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(253,184,19,.4)' }}>Checkout →</button>
        </div>
      </Card>
    );
  };

  const WCityDate = ({ m }: { m: Message }) => {
    const key = 'cd_' + m.id;
    const f = state.forms[key] || {};
    const done = m.done;
    const today = new Date();
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i + 1); return d; });

    return (
      <Card>
        <div style={{ padding: '16px 18px', opacity: done ? 0.65 : 1, pointerEvents: done ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970', marginBottom: 12 }}>
            <Icon name="truck" size={16} color="#7B5BD6" /> Delivery details
          </div>
          <CityAutocomplete
            value={String(f.city || f.q || '')}
            hasCity={!!f.city}
            onChange={v => setForm(key, { q: v, city: '' })}
            onPick={c => setForm(key, { city: c, q: c })}
          />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#9389AE', textTransform: 'uppercase', letterSpacing: '.4px' }}>Delivery date</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '9px 0 4px', marginBottom: 6 }}>
            {days.map((d, i) => {
              const sel = f.dateKey === i;
              const lbl = d.toLocaleDateString('en-US', { weekday: 'short' });
              const dn = d.getDate();
              const mo = d.toLocaleDateString('en-US', { month: 'short' });
              const full = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              return (
                <button key={i} onClick={() => setForm(key, { date: dn, dateKey: i, dateFull: full })}
                  style={{ flex: '0 0 auto', width: 58, padding: '9px 0', borderRadius: 13, cursor: 'pointer', border: '1.5px solid ' + (sel ? '#5C3FB0' : '#E6DEF5'), background: sel ? 'linear-gradient(135deg,#402970,#5C3FB0)' : '#fff', color: sel ? '#fff' : '#5C5276', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, transition: 'all .15s' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: .8 }}>{lbl}</span>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{dn}</span>
                  <span style={{ fontSize: 9, opacity: .7 }}>{mo}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => submitCityDate(m.id)} disabled={!!done}
            style={{ width: '100%', marginTop: 10, padding: 13, borderRadius: 13, border: 'none', cursor: 'pointer', background: (f.city && f.date) ? 'linear-gradient(135deg,#402970,#5C3FB0)' : '#D8CEEC', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: (f.city && f.date) ? '0 6px 18px rgba(64,41,112,.3)' : 'none', transition: 'all .2s' }}>
            {done ? '✓ Confirmed' : 'Check delivery'}
          </button>
        </div>
      </Card>
    );
  };

  const WSaved = ({ m }: { m: Message }) => {
    const addrs = (m.savedAddrs as SavedAddress[] | undefined) || state.savedAddrs;
    return (
      <Card>
        <div style={{ padding: '16px 18px', opacity: m.done ? 0.65 : 1, pointerEvents: m.done ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970', marginBottom: 12 }}>
            <Icon name="pin" size={16} color="#7B5BD6" /> Choose a delivery address
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {addrs.map(a => (
              <button key={a.id} onClick={() => submitSaved(m.id, a.id, addrs)}
                style={{ textAlign: 'left', border: '1.5px solid #E6DEF5', background: '#fff', borderRadius: 14, padding: '13px 15px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', transition: 'all .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#5C3FB0'; (e.currentTarget as HTMLElement).style.background = '#F8F4FE'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E6DEF5'; (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="box" size={17} color="#7B5BD6" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#2A1E4A' }}>{a.label}</span>
                    {a.isDefault && <span style={{ fontSize: 10, fontWeight: 700, color: '#7B5BD6', background: '#EEE7FB', padding: '2px 7px', borderRadius: 6 }}>Default</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#7B7398', marginTop: 2 }}>{a.recipientName} · {a.address || a.city}</div>
                  <div style={{ fontSize: 12, color: '#9389AE', marginTop: 1 }}>{a.phone}</div>
                </div>
                <Icon name="chev" size={18} color="#C3B8DE" />
              </button>
            ))}
            <button onClick={() => newAddress(m.id)} style={{ border: '1.5px dashed #C9B8ED', background: '#FBF9FF', borderRadius: 14, padding: 12, cursor: 'pointer', color: '#5C3FB0', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Icon name="plus" size={16} color="#5C3FB0" /> Deliver to a new address
            </button>
          </div>
        </div>
      </Card>
    );
  };

  const WRecipient = ({ m }: { m: Message }) => {
    const k = 'rc_' + m.id;
    const f = state.forms[k] || {};
    const addrs = state.savedAddrs;
    const hasSaved = addrs.length > 0;
    // With no saved addresses the widget is just the three fields; otherwise show a
    // selectable list of saved addresses plus an "add a new address" option.
    const addingNew = hasSaved ? Boolean(f.addingNew) : true;
    const defaultId = addrs.find(a => a.isDefault)?.id ?? addrs[0]?.id;
    const selectedId = addingNew ? null : (String(f.selectedAddrId || '') || defaultId);
    const saveChecked = Boolean(f.save);

    const radio = (on: boolean) => (
      <span style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto', marginTop: 1, border: '2px solid ' + (on ? '#5C3FB0' : '#D8CEEC'), display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
        {on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg,#402970,#5C3FB0)' }} />}
      </span>
    );

    return (
      <Card>
        <div style={{ padding: '16px 18px', opacity: m.done ? 0.65 : 1, pointerEvents: m.done ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970', marginBottom: 13 }}><Icon name="user" size={16} color="#7B5BD6" /> {hasSaved ? 'Deliver to' : 'Recipient details'}</div>

          {hasSaved && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: addingNew ? 14 : 0 }}>
              {addrs.map(a => {
                const sel = a.id === selectedId;
                return (
                  <button key={a.id} onClick={() => setForm(k, { selectedAddrId: a.id, addingNew: false })}
                    style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', border: '1.5px solid ' + (sel ? '#5C3FB0' : '#E6DEF5'), background: sel ? '#F8F4FE' : '#fff', borderRadius: 14, padding: '12px 14px', cursor: 'pointer', transition: 'all .15s' }}>
                    {radio(sel)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A' }}>{a.recipientName}</span>
                        {a.isDefault && <span style={{ fontSize: 10, fontWeight: 700, color: '#7B5BD6', background: '#EEE7FB', padding: '2px 7px', borderRadius: 6 }}>Default</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#7B7398', marginTop: 2 }}>{a.address || a.city}</div>
                      <div style={{ fontSize: 12, color: '#9389AE', marginTop: 1 }}>{a.phone}</div>
                    </div>
                  </button>
                );
              })}
              <button onClick={() => setForm(k, { addingNew: true })}
                style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center', border: '1.5px ' + (addingNew ? 'solid #5C3FB0' : 'dashed #C9B8ED'), background: addingNew ? '#F8F4FE' : '#FBF9FF', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
                {radio(addingNew)}
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#5C3FB0', fontWeight: 700, fontSize: 13 }}><Icon name="plus" size={16} color="#5C3FB0" /> Add a new address</span>
              </button>
            </div>
          )}

          {addingNew && (
            <div style={hasSaved ? { animation: 'widgetIn .3s cubic-bezier(.2,.9,.3,1) both' } : undefined}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Field label="Full name" value={String(f.name || '')} onChange={v => setForm(k, { name: v })} ph="Recipient name" />
                <Field label="Phone" value={String(f.phone || '')} onChange={v => setForm(k, { phone: v })} type="tel" ph="07X XXX XXXX" />
                <Field label="Street address" value={String(f.address || '')} onChange={v => setForm(k, { address: v })} ph="House no, street, area" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, cursor: 'pointer', userSelect: 'none' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid ' + (saveChecked ? '#5C3FB0' : '#D8CEEC'), background: saveChecked ? 'linear-gradient(135deg,#402970,#5C3FB0)' : '#fff', transition: 'all .15s' }}>
                  {saveChecked && <Icon name="check" size={13} color="#fff" />}
                </span>
                <input type="checkbox" checked={saveChecked} onChange={e => setForm(k, { save: e.target.checked })} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#5C5276' }}>Save this address for next time</span>
              </label>
            </div>
          )}

          <button onClick={() => submitRecipient(m.id)} style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 13, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 6px 18px rgba(64,41,112,.3)' }}>{m.done ? '✓ Confirmed' : 'Continue'}</button>
        </div>
      </Card>
    );
  };

  const WSender = ({ m }: { m: Message }) => {
    const k = 'sn_' + m.id;
    return (
      <Card>
        <div style={{ padding: '16px 18px', opacity: m.done ? 0.65 : 1, pointerEvents: m.done ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970', marginBottom: 13 }}><Icon name="user" size={16} color="#7B5BD6" /> Your name (sender)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Field label="Your name" value={String(state.forms[k]?.name || '')} onChange={v => setForm(k, { name: v })} ph={session?.user?.name?.split(' ')[0] || 'e.g. Sahan'} />
          </div>
          <div style={{ fontSize: 11.5, color: '#9389AE', marginTop: 8 }}>Shown on the gift card.</div>
          <button onClick={() => submitSender(m.id)} style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 13, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 6px 18px rgba(64,41,112,.3)' }}>{m.done ? '✓ Saved' : 'Continue'}</button>
        </div>
      </Card>
    );
  };

  const WGift = ({ m }: { m: Message }) => {
    const k = 'gf_' + m.id;
    const f = state.forms[k] || {};
    const msg = String(f.message || '');
    const len = msg.length;
    const writing = Boolean(f.writing);
    return (
      <Card>
        <div style={{ padding: '16px 18px', opacity: m.done ? 0.65 : 1, pointerEvents: m.done ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970' }}><Icon name="msg" size={16} color="#7B5BD6" /> Gift message</div>
            <button onClick={() => helpWrite(m.id)} disabled={writing} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #F0DFF7', background: 'linear-gradient(135deg,#FBF3FF,#F3EBFF)', color: '#8B47C9', fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 10, cursor: writing ? 'default' : 'pointer', opacity: writing ? 0.7 : 1 }}>
              <Icon name="spark" size={14} color="#A855D6" /> {writing ? 'Writing…' : 'Help me write'}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            {writing ? (
              // While drafting, show a read-only "live writing" surface: a shimmering
              // placeholder until the first characters arrive, then the note typing
              // in with a blinking caret.
              <div style={{ width: '100%', minHeight: 84, border: '1.5px solid #C9B8ED', borderRadius: 13, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: '#241C3D', background: '#FAF8FE', boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg ? (
                  <>
                    {msg}
                    <span style={{ display: 'inline-block', width: 2, height: '1.05em', background: '#7B5BD6', marginLeft: 1, verticalAlign: 'text-bottom', animation: 'caretBlink 1s step-end infinite' }} />
                  </>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#9389AE', fontStyle: 'italic' }}>
                    <Icon name="spark" size={14} color="#A855D6" /> Ruki is writing a heartfelt note
                    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 1 }}>
                      {[0, 150, 300].map(d => (
                        <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: '#C9B8ED', display: 'inline-block', animation: 'dotBounce .9s ease infinite', animationDelay: d + 'ms' }} />
                      ))}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <textarea value={msg} maxLength={200} placeholder="Write a heartfelt note… (optional)" onChange={e => setForm(k, { message: e.target.value })}
                style={{ width: '100%', minHeight: 84, border: '1.5px solid ' + (msg ? '#C9B8ED' : '#E6DEF5'), borderRadius: 13, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, outline: 'none', resize: 'vertical', color: '#241C3D', background: msg ? '#FAF8FE' : '#fff', boxSizing: 'border-box' }} />
            )}
            <span style={{ position: 'absolute', bottom: 10, right: 14, fontSize: 11, color: len > 180 ? '#D98818' : '#B7AECB', fontWeight: 600 }}>{len}/200</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 13 }}>
            <button onClick={() => submitGift(m.id, true)} disabled={writing} style={{ flex: '0 0 auto', padding: '13px 18px', borderRadius: 13, border: '1.5px solid #E2D9F3', background: '#fff', color: '#7B7398', fontWeight: 700, fontSize: 14, cursor: writing ? 'default' : 'pointer', opacity: writing ? 0.6 : 1 }}>Skip</button>
            <button onClick={() => submitGift(m.id, false)} disabled={!msg || writing} style={{ flex: 1, padding: 13, borderRadius: 13, border: 'none', cursor: (msg && !writing) ? 'pointer' : 'default', background: (msg && !writing) ? 'linear-gradient(135deg,#402970,#5C3FB0)' : '#D8CEEC', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: (msg && !writing) ? '0 6px 18px rgba(64,41,112,.3)' : 'none' }}>Add message & continue</button>
          </div>
        </div>
      </Card>
    );
  };

  const WFeedback = ({ m }: { m: Message }) => {
    const k = 'fb_' + m.id;
    const f = state.forms[k] || {};
    const rating = Number(f.rating || 0);
    const comment = String(f.comment || '');
    const submitted = Boolean(f.submitted) || Boolean(m.done);
    const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

    if (submitted) {
      return (
        <Card accent="#1F9D6B">
          <div style={{ padding: '22px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#EDFAF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={22} color="#1F9D6B" /></div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#2A1E4A' }}>Thank you for your feedback!</div>
            <div style={{ fontSize: 13, color: '#7B7398', maxWidth: 260 }}>{rating >= 4 ? 'So glad you enjoyed shopping with Kapruka 💜' : 'We’ll use your notes to keep improving.'}</div>
            <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
              {[1, 2, 3, 4, 5].map(s => <Icon key={s} name="star" size={16} fill={s <= rating ? '#FDB813' : undefined} color={s <= rating ? '#FDB813' : '#E2D9F3'} />)}
            </div>
          </div>
        </Card>
      );
    }

    return (
      <Card accent="#FDB813">
        <div style={{ padding: '18px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#2A1E4A', textAlign: 'center' }}>How was your experience?</div>
          <div style={{ fontSize: 12.5, color: '#7B7398', textAlign: 'center', marginTop: 3 }}>Your order is on its way — we’d love your feedback.</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '16px 0 4px' }}>
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => setForm(k, { rating: s })} aria-label={`${s} star${s > 1 ? 's' : ''}`}
                style={{ all: 'unset', cursor: 'pointer', lineHeight: 0, transform: s <= rating ? 'scale(1.1)' : 'scale(1)', transition: 'transform .12s' } as CSSProperties}>
                <Icon name="star" size={34} fill={s <= rating ? '#FDB813' : undefined} color={s <= rating ? '#FDB813' : '#DDD3EE'} />
              </button>
            ))}
          </div>
          <div style={{ textAlign: 'center', height: 17, fontSize: 12.5, fontWeight: 700, color: '#E0A106' }}>{labels[rating]}</div>
          <textarea value={comment} maxLength={1000} placeholder="Tell us more… (optional)" onChange={e => setForm(k, { comment: e.target.value })}
            style={{ width: '100%', minHeight: 64, border: '1.5px solid ' + (comment ? '#C9B8ED' : '#E6DEF5'), borderRadius: 13, padding: '11px 13px', fontSize: 14, lineHeight: 1.5, outline: 'none', resize: 'vertical', color: '#241C3D', background: comment ? '#FAF8FE' : '#fff', boxSizing: 'border-box', marginTop: 8 }} />
          <button onClick={() => submitFeedback(m.id)} disabled={!rating}
            style={{ width: '100%', marginTop: 12, padding: 13, borderRadius: 13, border: 'none', cursor: rating ? 'pointer' : 'default', background: rating ? 'linear-gradient(135deg,#402970,#5C3FB0)' : '#D8CEEC', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: rating ? '0 6px 18px rgba(64,41,112,.3)' : 'none' }}>
            Submit feedback
          </button>
        </div>
      </Card>
    );
  };

  const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
    delivered:        { color: '#1F9D6B', bg: '#EDFAF5', icon: '✓' },
    out_for_delivery: { color: '#2563EB', bg: '#EFF6FF', icon: '🚚' },
    shipped:          { color: '#2563EB', bg: '#EFF6FF', icon: '📦' },
    confirmed:        { color: '#5C3FB0', bg: '#F3EBFF', icon: '✅' },
    received:         { color: '#5C3FB0', bg: '#F3EBFF', icon: '📋' },
    cancelled:        { color: '#C0392B', bg: '#FDECEA', icon: '✕' },
  };

  const WTrackResult = ({ m }: { m: Message }) => {
    const d = m.trackData;
    if (!d) return null;
    const cfg = STATUS_CONFIG[d.status] ?? { color: '#6B5B93', bg: '#F5F0FF', icon: '📦' };
    const lkrAmount = parseFloat(d.amount ?? '0');
    return (
      <Card accent={cfg.color}>
        <div style={{ padding: '18px 18px 14px' }}>
          {/* Status header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{cfg.icon}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: cfg.color }}>{d.status_display || d.status}</div>
              <div style={{ fontSize: 12, color: '#9389AE', marginTop: 1 }}>Order {d.order_number}</div>
            </div>
            {!isNaN(lkrAmount) && lkrAmount > 0 && (
              <div style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 14, color: '#402970' }}>{money(lkrAmount)}</div>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: '#6B5B93', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #ECE5F7' }}>
            {d.order_date && <span>Ordered {d.order_date}</span>}
            {d.delivery_date && <span>Delivery {d.delivery_date}</span>}
            {d.payment_method && <span>{d.payment_method}</span>}
          </div>

          {/* Progress timeline */}
          {d.progress?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9389AE', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>Progress</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.progress.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? cfg.color : '#C9B8ED', marginTop: 4, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#2A1E4A' : '#5A4F72' }}>{step.step}</div>
                      {step.timestamp && <div style={{ fontSize: 11, color: '#9389AE' }}>{step.timestamp}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          {d.items?.length > 0 && (
            <div style={{ marginBottom: 12, paddingTop: 12, borderTop: '1px solid #ECE5F7' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9389AE', letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' }}>Items</div>
              {d.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5A4F72', marginBottom: 4 }}>
                  <span>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}</span>
                  {item.selling_price > 0 && <span style={{ fontWeight: 600, color: '#402970' }}>{money(item.selling_price)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Recipient */}
          {d.recipient?.name && (
            <div style={{ fontSize: 12, color: '#9389AE', paddingTop: 10, borderTop: '1px solid #ECE5F7' }}>
              Delivering to <strong style={{ color: '#6B5B93' }}>{d.recipient.name}</strong>
              {d.recipient.city ? `, ${d.recipient.city}` : ''}
            </div>
          )}

          {/* Extras */}
          {(d.live_tracking_available || d.has_delivery_photo || d.has_delivery_video) && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#1F9D6B', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {d.live_tracking_available && <span>📍 Live tracking available</span>}
              {d.has_delivery_photo && <span>📷 Delivery photo available</span>}
              {d.has_delivery_video && <span>🎥 Delivery video available</span>}
            </div>
          )}
        </div>
      </Card>
    );
  };

  const WPayUrl = ({ m }: { m: Message }) => {
    const amount = (m.payAmount as number | undefined) ?? 0;
    const url = (m.payUrl as string | undefined) ?? '';
    const orderRef = (m.orderRef as string | undefined);
    const expiresAt = (m.expiresAt as string | undefined);

    // Itemised order. payItems is a live-session cart snapshot (absent on reload);
    // the totals come from the order summary and persist, so the breakdown always shows.
    const items = m.payItems ?? [];
    const itemsCount = m.itemsCount ?? (items.reduce((s, i) => s + i.qty, 0) || items.length);
    const itemsTotal = m.itemsTotal ?? (items.length ? items.reduce((s, i) => s + i.price * i.qty, 0) : undefined);
    const deliveryFee = m.deliveryFee ?? (amount && itemsTotal != null ? Math.max(0, amount - itemsTotal) : undefined);

    let expiryLabel = '';
    if (expiresAt) {
      try {
        const dt = new Date(expiresAt);
        expiryLabel = dt.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }) + ' SL time';
      } catch { expiryLabel = '60 minutes'; }
    }

    return (
      <Card accent="#1F9D6B">
        <div style={{ padding: '20px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970', marginBottom: 14 }}>
            <Icon name="box" size={16} color="#7B5BD6" /> Order ready to pay
            {itemsCount > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: '#9389AE' }}>{itemsCount} item{itemsCount === 1 ? '' : 's'}</span>}
          </div>

          {items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 232, overflowY: 'auto', marginBottom: 12 }}>
              {items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, overflow: 'hidden', flex: '0 0 auto', background: tileGrad('violet') }}>
                    {it.imageUrl && <img src={it.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2A1E4A', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.name}</div>
                    {it.qty > 1 && <div style={{ fontSize: 11, color: '#9389AE', marginTop: 1 }}>Qty {it.qty}</div>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#402970', flex: '0 0 auto' }}>{money(it.price * it.qty)}</div>
                </div>
              ))}
            </div>
          )}

          {(itemsTotal != null || deliveryFee != null || amount > 0) && (
            <div style={{ borderTop: '1.5px solid #ECE5F7', paddingTop: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {itemsTotal != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5C5276' }}>
                  <span>Items{itemsCount > 0 ? ` (${itemsCount})` : ''}</span>
                  <span style={{ fontWeight: 600, color: '#2A1E4A' }}>{money(itemsTotal)}</span>
                </div>
              )}
              {deliveryFee != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5C5276' }}>
                  <span>Delivery</span>
                  <span style={{ fontWeight: 600, color: '#2A1E4A' }}>{deliveryFee > 0 ? money(deliveryFee) : 'Free'}</span>
                </div>
              )}
              {amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 3, paddingTop: 8, borderTop: '1px dashed #ECE5F7' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#2A1E4A' }}>Total</span>
                  <span style={{ fontWeight: 800, fontSize: 20, color: '#402970' }}>{money(amount)}</span>
                </div>
              )}
            </div>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: 15, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#1F9D6B,#16855A)', color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 22px rgba(31,157,107,.36)' }}>
            <Icon name="check" size={18} color="#fff" /> Complete Purchase {amount > 0 && `· ${money(amount)}`}
          </a>
          {orderRef && (
            <div style={{ marginTop: 11, padding: '7px 10px', background: '#F5F0FF', borderRadius: 8, fontSize: 12, color: '#6B5B93', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Order ref</span>
              <strong style={{ fontFamily: 'monospace', letterSpacing: 0.4 }}>{orderRef}</strong>
            </div>
          )}
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#9389AE', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            🔒 Secure checkout via kapruka.com{expiryLabel ? ` · ⏱ link expires ${expiryLabel}` : ''}
          </div>
          <div style={{ marginTop: 8, padding: '7px 10px', background: '#FFF8EC', borderRadius: 8, fontSize: 11, color: '#8B6914', lineHeight: 1.4 }}>
            After paying, Kapruka will email you an order number (e.g. VIMP12345CB2) — save it to track your delivery.
          </div>
        </div>
      </Card>
    );
  };

  const WTrackInput = ({ m }: { m: Message }) => {
    const k = 'ti_' + m.id;
    const f = state.forms[k] || {};
    return (
      <Card>
        <div style={{ padding: '16px 18px', opacity: m.done ? 0.65 : 1, pointerEvents: m.done ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#402970', marginBottom: 13 }}><Icon name="truck" size={16} color="#7B5BD6" /> Track your order</div>
          <Field label="Order number" value={String(state.forms[k]?.orderNo || '')} onChange={v => setForm(k, { orderNo: v })} ph="e.g. VIMP34456CB2 (from your email)" />
          <button onClick={() => submitTrackInput(m.id)} style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 13, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 6px 18px rgba(64,41,112,.3)' }}>{m.done ? '✓ Tracking…' : 'Track order'}</button>
        </div>
      </Card>
    );
  };

  const renderWidget = (m: Message) => {
    switch (m.kind) {
      case 'products':      return WProducts({ m });
      case 'detail':        return WDetail({ m });
      case 'cartconfirm':   return WCartConfirm({ m });
      case 'citydate':      return WCityDate({ m });
      case 'saved':         return WSaved({ m });
      case 'recipient':     return WRecipient({ m });
      case 'sender':        return WSender({ m });
      case 'gift':          return WGift({ m });
      case 'track_result':  return WTrackResult({ m });
      case 'pay_url':       return WPayUrl({ m });
      case 'feedback':      return WFeedback({ m });
      case 'track_input':   return WTrackInput({ m });
      default: return null;
    }
  };

  const renderMessage = (m: Message) => {
    if (m.role === 'user') {
      return (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end', animation: 'msgIn .45s cubic-bezier(.2,.9,.3,1) both' }}>
          <div style={{ maxWidth: '74%', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', padding: '11px 16px', borderRadius: '18px 18px 5px 18px', fontSize: 14.5, lineHeight: 1.5, boxShadow: '0 4px 14px rgba(64,41,112,.22)', fontWeight: 500 }}>{m.text}</div>
        </div>
      );
    }
    if (m.kind === 'text') {
      return (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start', animation: 'msgIn .5s cubic-bezier(.2,.9,.3,1) both' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '76%' }}>
            <div style={{ background: '#fff', color: '#2A2342', padding: m.streaming ? '14px 18px' : '11px 16px', borderRadius: '5px 18px 18px 18px', fontSize: 14.5, lineHeight: 1.55, boxShadow: '0 3px 12px rgba(64,41,112,.08)', border: '1px solid rgba(64,41,112,.05)' }} className="ruki-md">
              {m.streaming ? (
                <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9B8ED', display: 'inline-block', animation: 'dotBounce .9s ease infinite', animationDelay: '0ms' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9B8ED', display: 'inline-block', animation: 'dotBounce .9s ease infinite', animationDelay: '150ms' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9B8ED', display: 'inline-block', animation: 'dotBounce .9s ease infinite', animationDelay: '300ms' }} />
                </span>
              ) : <RukiMarkdown text={m.text ?? ''} />}
            </div>
          </div>
        </div>
      );
    }
    const widget = renderWidget(m);
    if (!widget) return null;
    return (
      <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start', animation: 'msgIn .5s cubic-bezier(.2,.9,.3,1) both' }}>
        <div style={{ flex: 1, maxWidth: 640, minWidth: 0 }}>{widget}</div>
      </div>
    );
  };

  // ── composer toolbar ──
  const QUICK_ACTIONS = [
    { label: '⭐  Best sellers', msg: 'Show me your best sellers' },
    { label: '🏷️  Promotions',  msg: "Show me today's deals and promotions" },
    { label: '⚡  Same day delivery', msg: 'What can I get delivered today?' },
  ];

  const chipBtn = (label: string, onClick: () => void, delay = 0) => (
    <button key={label} onClick={onClick}
      style={{ flex: '0 0 auto', border: '1.5px solid rgba(64,41,112,.13)', background: '#fff', borderRadius: 20, padding: '7px 13px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#5C3FB0', whiteSpace: 'nowrap', animation: 'chipIn .4s both', animationDelay: delay + 'ms', transition: 'background .15s, border-color .15s', boxShadow: '0 2px 6px rgba(64,41,112,.06)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F5F1FE'; (e.currentTarget as HTMLElement).style.borderColor = '#C9B8ED'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(64,41,112,.13)'; }}>
      {label}
    </button>
  );

  let composerToolbar: React.ReactNode = null;
  if (state.started) {
    const last = [...state.messages].reverse().find(m => m.role === 'bot');
    const contextual: React.ReactNode[] = [];
    if (last) {
      if (last.kind === 'detail')      contextual.push(chipBtn('See more options', () => { pushUser('Show me more gift options'); sendMessage('Show me more gift options'); }, 220));
      if (last.kind === 'cartconfirm') contextual.push(chipBtn('Keep shopping', () => { pushUser('Show me more gifts'); sendMessage('Show me more gifts'); }, 220), chipBtn('Checkout now', beginCheckout, 275));
      if (last.kind === 'pay_url')     contextual.push(chipBtn('Track my order', () => { pushUser('Track my order'); sendMessage('Track my order'); }, 220));
    }
    composerToolbar = (
      <div style={{ marginBottom: 8, display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: isMobile ? 2 : 74 }}>
        {QUICK_ACTIONS.map((a, i) => chipBtn(a.label, () => { pushUser(a.msg); sendMessage(a.msg); }, i * 55))}
        {chipBtn('Under Rs 10K', () => { const msg = 'Show me gifts under Rs 10,000'; pushUser(msg); sendMessage(msg); }, 165)}
        {contextual}
        {chipBtn('🛒 Cart', () => openDrawer('cart'), 220)}
      </div>
    );
  }

  // ── drawer ──
  const renderDrawer = () => {
    if (!state.drawer) return null;
    const close = () => setState(prev => ({ ...prev, drawer: null }));
    let title = '';
    let body: React.ReactNode = null;

    const EmptyState = ({ icon, title: t, sub }: { icon: string; title: string; sub: string }) => (
      <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Icon name={icon} size={28} color="#B6A6E0" /></div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#2A1E4A' }}>{t}</div>
        <div style={{ fontSize: 13, color: '#9389AE', maxWidth: 240 }}>{sub}</div>
      </div>
    );

    const skelStyle: CSSProperties = {
      background: 'linear-gradient(90deg,#EDE8F6 25%,#F5F2FC 50%,#EDE8F6 75%)',
      backgroundSize: '400% 100%',
      animation: 'shimmer 1.4s ease infinite',
    };
    const Skel = ({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) => (
      <div style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...skelStyle }} />
    );

    if (state.drawer === 'cart') {
      title = 'Your Cart';
      body = state.loadingDrawers.cart ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 11 }}>
              <Skel w={54} h={54} r={11} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Skel w="68%" h={13} />
                <Skel w="38%" h={13} />
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <Skel w={26} h={26} r={8} />
                  <Skel w={18} h={26} r={8} />
                  <Skel w={26} h={26} r={8} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : state.cart.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={clearCart} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C3B8DE', fontSize: 12, fontWeight: 600 }}>Clear cart</button>
          </div>
          {state.cart.map(i => {
            const p = getProduct(i.id);
            return (
              <div key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 11 }}>
                <div style={{ width: 54, height: 54, borderRadius: 11, overflow: 'hidden', flex: '0 0 auto' }}>
                  {p ? <ProductImage p={p} height={54} glyphSize={22} /> : <div style={{ width: 54, height: 54, background: tileGrad('violet') }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A', lineHeight: 1.25 }}>{i.name}</div>
                  <div style={{ fontWeight: 800, color: '#402970', fontSize: 14, marginTop: 3 }}>{money(i.price * i.qty)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
                    <button onClick={() => setQty(i.id, -1)} style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid #E2D9F3', background: '#fff', cursor: 'pointer', color: '#5C3FB0', fontWeight: 800, fontSize: 15, lineHeight: 1 }}>−</button>
                    <span style={{ fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{i.qty}</span>
                    <button onClick={() => setQty(i.id, 1)} style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid #E2D9F3', background: '#fff', cursor: 'pointer', color: '#5C3FB0', fontWeight: 800, fontSize: 15, lineHeight: 1 }}>+</button>
                    <button onClick={() => removeCart(i.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#C3B8DE', fontSize: 12, fontWeight: 600 }}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1.5px solid #ECE5F7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 13 }}>
              <span style={{ fontWeight: 700, color: '#2A1E4A' }}>Subtotal</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: '#402970' }}>{money(subtotal())}</span>
            </div>
            <button onClick={beginCheckout} style={{ width: '100%', padding: 14, borderRadius: 13, border: 'none', cursor: 'pointer', background: '#FDB813', color: '#402970', fontWeight: 800, fontSize: 14.5, boxShadow: '0 6px 18px rgba(253,184,19,.4)' }}>Checkout in chat →</button>
          </div>
        </div>
      ) : <EmptyState icon="cart" title="Your cart is empty" sub="Find a gift and it'll appear here." />;
    } else if (state.drawer === 'wishlist') {
      title = 'Wishlist';
      const wishProducts = state.wishlist.map(id => getProduct(id)).filter(Boolean) as RealProduct[];
      body = state.loadingDrawers.wishlist ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 11 }}>
              <Skel w={54} h={54} r={11} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Skel w="62%" h={13} />
                <Skel w="35%" h={13} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skel w={82} h={30} r={10} />
                <Skel w={82} h={26} r={10} />
              </div>
            </div>
          ))}
        </div>
      ) : wishProducts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {wishProducts.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 11 }}>
              <div style={{ width: 54, height: 54, borderRadius: 11, overflow: 'hidden', flex: '0 0 auto' }}><ProductImage p={p} height={54} glyphSize={22} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontWeight: 800, color: '#402970', fontSize: 14, marginTop: 2 }}>{p.price.amount ? money(p.price.amount) : '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
                <button
                  onClick={() => { if (p.price.amount) addToCart(p.id); setState(prev => ({ ...prev, drawer: null })); }}
                  style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  Add to cart
                </button>
                <button
                  onClick={() => toggleWish(p.id)}
                  style={{ padding: '5px 12px', borderRadius: 10, border: '1.5px solid #F0DFF7', background: '#fff', color: '#9389AE', fontWeight: 600, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12 }}>×</span> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon="heart" title="No saved gifts yet" sub="Tap the heart on any product to save it." />;
    } else if (state.drawer === 'history') {
      title = 'Chat History';
      body = state.loadingDrawers.history ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'center', background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 13, padding: '12px 14px' }}>
              <Skel w={34} h={34} r={10} />
              <Skel w={`${55 + (i % 3) * 12}%`} h={13} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.conversations.length === 0 && <EmptyState icon="msg" title="No conversations yet" sub="Your chat history will appear here." />}
          {state.conversations.map(c => (
            <button key={c.id} onClick={() => loadConversation(c.id)}
              style={{ textAlign: 'left', background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 13, padding: '12px 14px', cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'center', transition: 'all .15s' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#F8F4FE')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#fff')}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="msg" size={16} color="#7B5BD6" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
              </div>
              <Icon name="chev" size={18} color="#C3B8DE" />
            </button>
          ))}
        </div>
      );
    } else if (state.drawer === 'saved') {
      title = 'Saved Addresses';
      body = state.loadingDrawers.saved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1].map(i => (
            <div key={i} style={{ background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Skel w="45%" h={14} />
              <Skel w="58%" h={12} />
              <Skel w="72%" h={12} />
              <Skel w="38%" h={12} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {state.savedAddrs.map(a => (
            <div key={a.id} style={{ background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: '#2A1E4A' }}>{a.label}</span>
                {a.isDefault && <span style={{ fontSize: 10, fontWeight: 700, color: '#7B5BD6', background: '#EEE7FB', padding: '2px 7px', borderRadius: 6 }}>Default</span>}
              </div>
              <div style={{ fontSize: 13, color: '#5C5276', marginTop: 6 }}>{a.recipientName}</div>
              <div style={{ fontSize: 12.5, color: '#9389AE', marginTop: 2 }}>{a.address || a.city}</div>
              <div style={{ fontSize: 12.5, color: '#9389AE' }}>{a.phone}</div>
            </div>
          ))}
          {state.savedAddrs.length === 0 && <EmptyState icon="pin" title="No saved addresses" sub="Addresses you use will be saved here." />}
        </div>
      );
    } else if (state.drawer === 'settings') {
      title = 'Settings';
      const SectionHeader = ({ icon, label }: { icon: string; label: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13, color: '#402970', textTransform: 'uppercase', letterSpacing: '.4px', margin: '4px 0 12px' }}>
          <Icon name={icon} size={15} color="#7B5BD6" /> {label}
        </div>
      );
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100%' }}>
          {/* ── Saved addresses ── */}
          <div>
            <SectionHeader icon="pin" label="Saved addresses" />
            {state.loadingDrawers.saved ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1].map(i => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <Skel w="45%" h={14} /><Skel w="58%" h={12} /><Skel w="72%" h={12} />
                  </div>
                ))}
              </div>
            ) : state.savedAddrs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {state.savedAddrs.map(a => (
                  <div key={a.id} style={{ background: '#fff', border: '1px solid ' + (a.isDefault ? '#C9B8ED' : 'rgba(64,41,112,.09)'), borderRadius: 14, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#2A1E4A' }}>{a.label}</span>
                      {a.isDefault && <span style={{ fontSize: 10, fontWeight: 700, color: '#7B5BD6', background: '#EEE7FB', padding: '2px 7px', borderRadius: 6 }}>Default</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#5C5276', marginTop: 6 }}>{a.recipientName}</div>
                    <div style={{ fontSize: 12.5, color: '#9389AE', marginTop: 2 }}>{a.address || a.city}</div>
                    <div style={{ fontSize: 12.5, color: '#9389AE' }}>{a.phone}</div>
                    {!a.isDefault && (
                      <button onClick={() => setDefaultAddress(a.id)} style={{ marginTop: 10, border: '1.5px solid #E2D9F3', background: '#fff', color: '#5C3FB0', fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 10, cursor: 'pointer' }}>
                        Set as default
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="pin" title="No saved addresses" sub="Tick “Save this address” at checkout to store it here." />}
          </div>

          {/* ── Account ── */}
          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <SectionHeader icon="user" label="Account" />
            <div style={{ background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 13 }}>
              {!isAnon && session?.user?.image
                ? <img src={session.user.image} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', flex: '0 0 auto' }} />
                : <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#5C3FB0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', flex: '0 0 auto' }}>{isAnon ? <Icon name="user" size={22} color="#fff" /> : userInitial}</div>
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#9389AE', fontWeight: 600 }}>{isAnon ? 'Browsing as' : 'Signed in as'}</div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: '#2A1E4A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isAnon ? 'Guest' : session?.user?.name}</div>
                {!isAnon && session?.user?.email && <div style={{ fontSize: 12, color: '#9389AE', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</div>}
              </div>
            </div>
            {isAnon ? (
              <button onClick={() => signIn('google')} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 13, border: '1.5px solid #E2D9F3', background: '#fff', color: '#2A1E4A', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/google-logo-48.png" alt="" style={{ width: 18, height: 18, display: 'block' }} /> Sign in with Google
              </button>
            ) : (
              <button onClick={() => signOut()} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 13, border: '1.5px solid #F2C2C2', background: '#fff', color: '#C0392B', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="back" size={16} color="#C0392B" /> Log out
              </button>
            )}
          </div>
        </div>
      );
    } else if (state.drawer === 'orders') {
      title = 'Orders';
      const trackFormKey = 'orders_track';
      const trackOrderNo = String(state.forms[trackFormKey]?.orderNo || '');
      const handleTrack = () => {
        if (!trackOrderNo.trim()) { showToast('Enter your order number', 'box'); return; }
        setState(prev => ({ ...prev, drawer: null }));
        const msg = 'Track order ' + trackOrderNo.trim();
        pushUser(msg);
        sendMessage(msg);
      };
      const trackOrder = (orderId: string) => {
        setState(prev => ({ ...prev, drawer: null }));
        const msg = 'Track order ' + orderId;
        pushUser(msg);
        sendMessage(msg);
      };
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── Recent orders ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13, color: '#402970', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>
              <Icon name="box" size={15} color="#7B5BD6" /> Recent orders
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {DUMMY_ORDERS.map(o => {
                const cfg = STATUS_CONFIG[o.status] ?? { color: '#6B5B93', bg: '#F5F0FF', icon: '📦' };
                return (
                  <div key={o.id} style={{ background: '#fff', border: '1px solid rgba(64,41,112,.09)', borderRadius: 14, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5, color: '#2A1E4A' }}>{o.id}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap' }}>{cfg.icon} {o.statusLabel}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#7B7398', marginTop: 6 }}>{o.items.join(' · ')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: '#9389AE' }}>{o.date} · <strong style={{ color: '#402970' }}>{money(o.total)}</strong></div>
                      <button onClick={() => trackOrder(o.id)} style={{ border: '1.5px solid #E2D9F3', background: '#fff', color: '#5C3FB0', fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="truck" size={13} color="#5C3FB0" /> Track
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg,#EEE7FB,#F8F4FE)', border: '1px solid rgba(64,41,112,.1)', borderRadius: 16, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'linear-gradient(135deg,#402970,#5C3FB0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name="truck" size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#2A1E4A' }}>Order Tracking</div>
                <div style={{ fontSize: 12.5, color: '#7B7398', marginTop: 1 }}>Enter your order number to get live updates</div>
              </div>
            </div>
            <Field label="Order number" value={String(state.forms[trackFormKey]?.orderNo || '')} onChange={v => setForm(trackFormKey, { orderNo: v })} ph="e.g. KPR-2026-12345" />
            <button onClick={handleTrack}
              style={{ width: '100%', padding: '13px 0', borderRadius: 13, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 6px 18px rgba(64,41,112,.3)', transition: 'opacity .15s' }}>
              Track order →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: 'ship', label: 'Shipping status', sub: 'See where your package is right now' },
              { icon: 'cal', label: 'Delivery estimate', sub: 'Check expected arrival date' },
              { icon: 'pin', label: 'Delivery address', sub: 'Confirm where it\'s being sent' },
            ].map(({ icon, label, sub }) => (
              <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid rgba(64,41,112,.08)', borderRadius: 13, padding: '12px 14px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <Icon name={icon} size={18} color="#7B5BD6" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A' }}>{label}</div>
                  <div style={{ fontSize: 12, color: '#9389AE', marginTop: 1 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    } else if (state.drawer === 'account') {
      title = isAnon ? 'Sign in' : 'Account';
      body = isAnon ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={30} color="#7B5BD6" /></div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#2A1E4A' }}>Sign in to save your progress</div>
          <div style={{ fontSize: 13.5, color: '#7B7398', maxWidth: 280 }}>Your cart, wishlist, and addresses will be saved across sessions.</div>
          <button onClick={() => signIn('google')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', borderRadius: 13, border: '1.5px solid #E2D9F3', background: '#fff', color: '#2A1E4A', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(64,41,112,.12)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/google-logo-48.png" alt="" style={{ width: 20, height: 20, display: 'block' }} /> Continue with Google
          </button>
        </div>
      ) : (
        <div style={{ padding: '24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            {session?.user?.image
              ? <img src={session.user.image} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#5C3FB0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: '#fff' }}>{userInitial}</div>
            }
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#2A1E4A' }}>{session?.user?.name}</div>
              <div style={{ fontSize: 12.5, color: '#9389AE' }}>{session?.user?.email}</div>
            </div>
          </div>
        </div>
      );
    }

    // Persistence nudge: cart, wishlist & history work this session but only
    // survive across sessions/devices once the user signs in.
    const persistNudge: Record<string, string> = {
      cart: 'Your cart is saved for this session only.',
      wishlist: 'Your wishlist is saved for this session only.',
      history: 'Your chat history is saved for this session only.',
    };
    if (isAnon && persistNudge[state.drawer]) {
      body = (
        <>
          <div style={{ background: 'linear-gradient(135deg,#EEE7FB,#F8F4FE)', border: '1px solid rgba(64,41,112,.12)', borderRadius: 14, padding: '13px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#402970,#5C3FB0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name="link" size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#2A1E4A', lineHeight: 1.3 }}>{persistNudge[state.drawer]}</div>
                <div style={{ fontSize: 12, color: '#7B7398', marginTop: 2, lineHeight: 1.4 }}>Sign in to keep it and sync across your devices.</div>
              </div>
            </div>
            <button onClick={() => signIn('google')} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#fff', border: '1.5px solid #E2D9F3', color: '#2A1E4A', fontWeight: 700, fontSize: 12.5, boxShadow: '0 2px 8px rgba(64,41,112,.1)' } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/google-logo-48.png" alt="" style={{ width: 15, height: 15, display: 'block' }} /> Sign in with Google
            </button>
          </div>
          {body}
        </>
      );
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}>
        <div onClick={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: isMobile ? 0 : 74, background: 'rgba(42,30,74,.32)', backdropFilter: 'blur(2px)', animation: 'fadeBg .25s both' }} />
        <div style={{ position: 'relative', marginLeft: isMobile ? 0 : 74, width: isMobile ? '100%' : 380, maxWidth: isMobile ? '100%' : '90vw', height: '100%', background: '#F6F2FC', boxShadow: '8px 0 40px rgba(42,30,74,.2)', display: 'flex', flexDirection: 'column', animation: 'drawerIn .32s cubic-bezier(.2,.9,.3,1) both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(64,41,112,.08)' }}>
            <div style={{ fontFamily: "var(--font-baloo2), 'Baloo 2', sans-serif", fontWeight: 700, fontSize: 19, color: '#2A1E4A' }}>{title}</div>
            <button onClick={close} style={{ all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9389AE', background: '#fff' }}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>{body}</div>
        </div>
      </div>
    );
  };

  // ── derived ──
  const cc = cartCount();
  const wishCount = state.wishlist.length;

  const RailBtn = ({ icon, label, onClick, active }: { icon: string; label: string; onClick: () => void; active?: boolean }) => (
    <button onClick={() => { onClick(); if (isMobile) setRailOpen(false); }} title={label}
      style={{ all: 'unset', cursor: 'pointer', width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#402970' : 'rgba(255,255,255,.85)', background: active ? '#fff' : 'transparent', transition: 'all .15s' } as CSSProperties}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.14)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
      <Icon name={icon} size={21} />
    </button>
  );

  // ── main render ──
  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100%', overflow: 'hidden', background: '#ECE7F6', color: '#241C3D' }}>

      {/* Mobile rail backdrop */}
      {isMobile && railOpen && (
        <div onClick={() => setRailOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 69, background: 'rgba(42,30,74,.4)', backdropFilter: 'blur(2px)', animation: 'fadeBg .25s both' }} />
      )}

      {/* Left rail */}
      <aside style={isMobile
        ? { width: 74, position: 'fixed', top: 0, bottom: 0, left: 0, background: 'linear-gradient(180deg,#402970 0%,#33205C 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 6, zIndex: 70, boxShadow: '2px 0 24px rgba(45,28,90,.22)', transform: railOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .28s cubic-bezier(.2,.9,.3,1)' }
        : { width: 74, flex: '0 0 74px', position: 'relative', background: 'linear-gradient(180deg,#402970 0%,#33205C 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 6, zIndex: 70, boxShadow: '2px 0 24px rgba(45,28,90,.22)' }}>
        <div style={{ flex: 1 }} />
        <RailBtn icon="plus" label="New chat" onClick={newChat} />
        <RailBtn icon="msg" label="Conversations" onClick={() => { openDrawer('history'); if (state.drawer !== 'history') loadConversations(); }} active={state.drawer === 'history'} />
        <RailBtn icon="box" label="Orders" onClick={() => openDrawer('orders')} active={state.drawer === 'orders'} />
        <RailBtn icon="heart" label="Wishlist" onClick={() => openDrawer('wishlist')} active={state.drawer === 'wishlist'} />
        <RailBtn icon="cart" label="Cart" onClick={() => openDrawer('cart')} active={state.drawer === 'cart'} />
        <RailBtn icon="gear" label="Settings" onClick={() => openDrawer('settings')} active={state.drawer === 'settings'} />
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <RailBtn icon="chart" label="Manager dashboard" onClick={() => setAdminView(v => !v)} active={adminView} />
          {!adminView && <div style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: '#FDB813', border: '1.5px solid #402970', pointerEvents: 'none' }} />}
        </div>
        <button onClick={() => { openDrawer('account'); if (isMobile) setRailOpen(false); }} title={isAnon ? 'Sign in' : 'Account'}
          style={{ all: 'unset', cursor: 'pointer', width: 46, height: 46, borderRadius: '50%', background: '#5C3FB0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(0,0,0,.25)', border: '2px solid rgba(255,255,255,.25)', overflow: 'hidden' } as CSSProperties}>
          {!isAnon && session?.user?.image
            ? <img src={session.user.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <Icon name="user" size={22} color="#fff" />
          }
        </button>
        {isAnon && showSignInPrompt && !isMobile && (
          <div style={{ position: 'fixed', left: 84, bottom: 20, zIndex: 55, background: '#fff', borderRadius: 16, padding: '14px 14px 14px 16px', boxShadow: '0 8px 32px rgba(42,30,74,.22)', border: '1px solid rgba(64,41,112,.1)', display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 250, animation: 'widgetIn .35s cubic-bezier(.2,.9,.3,1) both' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A', lineHeight: 1.3 }}>Sign in to save your progress</div>
              <div style={{ fontSize: 12, color: '#9389AE', marginTop: 3, lineHeight: 1.4 }}>Cart, wishlist & orders sync across devices.</div>
              <button onClick={() => signIn('google')} style={{ all: 'unset', cursor: 'pointer', marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9, background: 'linear-gradient(135deg,#402970,#5C3FB0)', color: '#fff', fontWeight: 700, fontSize: 12.5, boxShadow: '0 4px 12px rgba(64,41,112,.28)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#fff' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/google-logo-48.png" alt="" style={{ width: 12, height: 12, display: 'block' }} />
                </span> Sign in with Google
              </button>
            </div>
            <button onClick={() => setShowSignInPrompt(false)} style={{ all: 'unset', cursor: 'pointer', color: '#C3B8DE', marginTop: -2, flex: '0 0 auto' }}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* Drawer */}
      {renderDrawer()}

      {/* Manager dashboard overlay */}
      {adminView && <KaprukaAdminUI railOffset={!isMobile} topOffset={isMobile ? 60 : 72} />}

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'radial-gradient(120% 80% at 100% 0%, #F3EFFC 0%, #ECE7F6 55%, #E7E0F4 100%)', position: 'relative' }}>

        {/* Header */}
        <header style={{ height: isMobile ? 60 : 72, flex: isMobile ? '0 0 60px' : '0 0 72px', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, padding: isMobile ? '0 14px' : '0 26px', background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(64,41,112,.08)', zIndex: 20 }}>
          {isMobile && (
            <button onClick={() => setRailOpen(true)} title="Menu" aria-label="Open menu" style={{ all: 'unset', cursor: 'pointer', width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#402970', background: '#fff', boxShadow: '0 2px 8px rgba(64,41,112,.08)', flex: '0 0 auto' } as CSSProperties}>
              <Icon name="menu" size={20} color="#402970" />
            </button>
          )}
          <button onClick={newChat} title="New chat" aria-label="Kapruka home" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center' } as CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo-full.png" alt="Kapruka" style={{ height: 30, width: 'auto', display: 'block' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </button>
          <div style={{ flex: 1 }} />
          {!adminView && (<>
          <button onClick={() => openDrawer('wishlist')}
            style={{ all: 'unset', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '9px 11px' : '9px 14px', borderRadius: 12, background: '#fff', boxShadow: '0 2px 8px rgba(64,41,112,.08)', border: '1px solid rgba(64,41,112,.07)', transition: 'transform .15s ease, box-shadow .15s ease' } as CSSProperties}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(64,41,112,.16)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(64,41,112,.08)'; }}>
            <Icon name="heart" size={17} color="#5C3FB0" fill={wishCount > 0 ? '#E5447A' : undefined} />
            {!isMobile && <span style={{ fontWeight: 600, fontSize: 13, color: '#4A3D6B' }}>Wishlist</span>}
            {wishCount > 0 && (
              <span key={'wb' + wishCount} style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#E5447A', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'badgePop .4s' }}>
                {wishCount}
              </span>
            )}
          </button>
          <button onClick={() => openDrawer('cart')}
            style={{ all: 'unset', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '9px 12px' : '9px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#402970,#5C3FB0)', boxShadow: '0 4px 14px rgba(64,41,112,.32)', transition: 'transform .15s ease, box-shadow .15s ease' } as CSSProperties}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 22px rgba(64,41,112,.42)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(64,41,112,.32)'; }}>
            <Icon name="cart" size={17} color="#fff" />
            {!isMobile && <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Cart</span>}
            {cc > 0 && (
              <span key={'cb' + cc} style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#FDB813', color: '#402970', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'badgePop .4s' }}>
                {cc}
              </span>
            )}
          </button>
          </>)}
        </header>

        {/* Scroll area */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollBehavior: 'smooth' }}>

          {/* Hero */}
          {!state.started && (
            <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 18px 10px' : '30px 24px 10px', animation: 'heroIn .6s cubic-bezier(.2,.9,.3,1) both' }}>
              <div style={{ position: 'relative', marginBottom: isMobile ? 16 : 22 }}>
                <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,91,214,.22),transparent 70%)' }} />
                <div style={{ width: isMobile ? 120 : 160, height: isMobile ? 120 : 160, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 18px 44px rgba(64,41,112,.32)', border: '4px solid #fff', position: 'relative' }}>
                  <AvatarVideo src={AV.greeting} poster={AVP.greeting} />
                </div>
                <div style={{ position: 'absolute', top: 6, right: -6, animation: 'sparkleFloat 3s ease-in-out infinite' }}>
                  <Icon name="spark" size={22} color="#FDB813" fill="#FDB813" />
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-baloo2), 'Baloo 2', sans-serif", fontWeight: 700, fontSize: isMobile ? 24 : 30, color: '#2A1E4A', textAlign: 'center', lineHeight: 1.15 }}>Hi {userName}! I&apos;m Ruki 👋</div>
              <div style={{ fontSize: isMobile ? 14 : 15.5, color: '#6B6390', textAlign: 'center', maxWidth: 440, marginTop: 9, lineHeight: 1.55 }}>
                Your AI gift concierge for Kapruka. Tell me who you&apos;re shopping for and I&apos;ll find, wrap, and deliver the perfect gift — start to finish, right here in chat.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 11, justifyContent: 'center', marginTop: 24, maxWidth: 560 }}>
                {([
                  ['🎂 Birthday gift for mom', 'Birthday gift for mom under Rs 10,000'],
                  ['💐 Send flowers to Colombo', 'Send flowers to Colombo'],
                  ['🍫 Chocolate hampers', 'Show me chocolate hampers'],
                  ['📦 Track my order', 'Track my order'],
                ] as [string, string][]).map(([label, q], i) => (
                  <button key={i} onClick={() => { pushUser(label.replace(/^[\p{Emoji}\s]+/u, '').trim()); sendMessage(q); }}
                    style={{ border: '1.5px solid rgba(64,41,112,.12)', background: '#fff', borderRadius: 12, padding: '8px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#3A2E5C', boxShadow: '0 3px 12px rgba(64,41,112,.07)', animation: 'chipIn .5s both', animationDelay: (i * 80 + 200) + 'ms', transition: 'all .15s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 8px 20px rgba(64,41,112,.15)'; el.style.borderColor = '#C9B8ED'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'none'; el.style.boxShadow = '0 3px 12px rgba(64,41,112,.07)'; el.style.borderColor = 'rgba(64,41,112,.12)'; }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Thread */}
          {state.started && (
            <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '16px 14px 8px' : '24px 26px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {state.messages.map(m => renderMessage(m))}
              {/* Retry button — shown once after the full bot turn */}
              {!state.streaming && state.messages.some(m => m.role === 'bot') && state.messages.some(m => m.role === 'user') && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 2 }}>
                  <button
                    onClick={retryLastUser}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#B4AAD0', fontSize: 11.5, fontWeight: 600, padding: '2px 4px', borderRadius: 6, transition: 'color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#7B5BD6')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#B4AAD0')}
                    title="Retry last response"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    Retry
                  </button>
                </div>
              )}
              {state.status && state.status !== 'Thinking' && (
                <div key="status" style={{ display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 2, animation: 'msgIn .3s both' }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #C9B8ED', borderTopColor: '#7B5BD6', animation: 'spin .7s linear infinite', flex: '0 0 auto', display: 'block' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, backgroundImage: 'linear-gradient(90deg,#B3A6D4 25%,#5C3FB0 50%,#B3A6D4 75%)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', animation: 'shimmer 1.6s linear infinite' }}>
                    {state.status}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ flex: '0 0 auto', padding: isMobile ? '0 12px 14px' : '0 26px 22px', background: 'linear-gradient(180deg, rgba(236,231,246,0) 0%, #ECE7F6 38%)', position: 'relative', zIndex: 10 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: -40, height: 54, pointerEvents: 'none', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 100%)', maskImage: 'linear-gradient(to bottom, transparent 0%, #000 100%)' }} />
          <div style={{ maxWidth: 860, margin: '0 auto', position: 'relative' }}>
            {composerToolbar}
            {/* Ruki avatar (appears once chat starts) */}
            {state.started && !isMobile && (
              <div style={{ position: 'absolute', left: -66, bottom: -4, zIndex: 30, width: 128, height: 128, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,91,214,.16),transparent 70%)' }} />
                <div key={state.avSeq + '-' + state.headerState} style={{ width: 128, height: 128, borderRadius: '50%', overflow: 'hidden', border: '5px solid #fff', boxShadow: '0 14px 32px rgba(64,41,112,.28)', animation: 'rukiPop .5s cubic-bezier(.2,1.3,.4,1) both' }}>
                  <AvatarVideo
                    src={state.headerState === 'idle'
                      ? IDLE_VARIANTS[state.avSeq % IDLE_VARIANTS.length]
                      : (AV[state.headerState] || AV.idle)}
                    poster={AVP[state.headerState] || AVP.idle}
                    loop={state.headerState !== 'show'}
                  />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#fff', border: '1.5px solid rgba(64,41,112,.1)', borderRadius: 20, padding: '8px 8px 8px 18px', boxShadow: '0 8px 28px rgba(64,41,112,.12)' }}>
              {state.started && !isMobile && <div style={{ flex: '0 0 auto', width: 82 }} />}
              <textarea value={state.input} rows={1} placeholder="Ask me anything…"
                onChange={e => setState(prev => ({ ...prev, input: e.target.value }))}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 15, lineHeight: 1.5, color: '#241C3D', background: 'transparent', padding: '9px 0', maxHeight: 120, minWidth: 0 }} />
              <button onClick={send} disabled={state.streaming}
                style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: 14, border: 'none', cursor: state.streaming ? 'default' : 'pointer', background: ((state.input || '').trim() && !state.streaming) ? 'linear-gradient(135deg,#402970,#5C3FB0)' : '#D8CEEC', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', boxShadow: ((state.input || '').trim() && !state.streaming) ? '0 4px 14px rgba(64,41,112,.32)' : 'none' }}>
                <Icon name="send" size={19} color="#fff" />
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#9389AE', marginTop: 9 }}>Talk to me in සිංහල, தமிழ் or English · Powered by Kapruka</div>
          </div>
        </div>

      </main>

      {/* Toast */}
      {state.toast && (
        <div key={state.toast.id} style={{ position: 'fixed', bottom: 104, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: '#2A1E4A', color: '#fff', padding: '12px 20px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 600, boxShadow: '0 12px 32px rgba(42,30,74,.4)', animation: 'toastIn .4s cubic-bezier(.2,1.2,.4,1) both', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'flex', color: state.toast.icon === 'heart' ? '#FF8FB8' : '#FDB813' }}>
            <Icon name={state.toast.icon} size={17} color={state.toast.icon === 'heart' ? '#FF8FB8' : '#FDB813'} fill={state.toast.icon === 'heart' ? '#FF8FB8' : undefined} />
          </span>
          {state.toast.text}
        </div>
      )}

    </div>
  );
}
