'use client';

import { useState, CSSProperties } from 'react';

// ─────────────────────────────────────────────
// Types & data (self-contained dummy data)
// ─────────────────────────────────────────────

interface AdminProduct {
  id: string;
  name: string;
  price: number;
  rating: number;
  reviews: number;
  tone: string;
  glyph: string;
}

const PRODUCTS: Record<string, AdminProduct> = {
  p1: { id: 'p1', name: 'Grand Red Roses Bouquet',      price: 8500,  rating: 4.9, reviews: 212, tone: 'rose',   glyph: 'flower' },
  p2: { id: 'p2', name: 'Chocolate Indulgence Hamper',  price: 12900, rating: 4.8, reviews: 156, tone: 'cocoa',  glyph: 'gift' },
  p3: { id: 'p3', name: 'Spa & Pamper Gift Box',        price: 9750,  rating: 4.7, reviews: 98,  tone: 'mint',   glyph: 'spark' },
  p4: { id: 'p4', name: 'Photo Mug + Ribbon Cake',      price: 6200,  rating: 4.6, reviews: 74,  tone: 'peach',  glyph: 'mug' },
  p5: { id: 'p5', name: 'Orchid Elegance Arrangement',  price: 11400, rating: 4.9, reviews: 131, tone: 'violet', glyph: 'flower' },
};

const TONE_COLORS: Record<string, string[]> = {
  rose:   ['#FBD7E3', '#F4A8C4', '#D86A95'],
  cocoa:  ['#EAD9C4', '#D2A878', '#9E6B3C'],
  mint:   ['#D5EFE2', '#A7DEC6', '#5FB893'],
  peach:  ['#FCE2CF', '#F7C39A', '#E89A5E'],
  violet: ['#E4D8FA', '#C3A9F2', '#8B6FE8'],
};

const IDLE_AVATAR = '/avatar/images/idle.png';

// ─────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────

const ICON_PATHS: Record<string, string | string[]> = {
  box:         'M21 8l-9-5-9 5 9 5 9-5ZM3 8v8l9 5 9-5V8M12 13v8',
  cart:        'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  spark:       'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z',
  pin:         'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  star:        'M12 3l2.6 5.6L21 9.3l-4.5 4.3 1.1 6.4L12 17l-5.6 3 1.1-6.4L3 9.3l6.4-.7L12 3Z',
  flower:      'M12 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 8c0-3 2-4 2-4M12 8c0-3-2-4-2-4M12 14c0 3 2 4 2 4M12 14c0 3-2 4-2 4M9 11c-3 0-4-2-4-2M15 11c3 0 4-2 4-2M9 11c-3 0-4 2-4 2M15 11c3 0 4 2 4 2',
  gift:        'M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M2 7h20v5H2zM12 22V7M12 7S11 3 8.5 3 6 6 12 7M12 7s1-4 3.5-4S18 6 12 7',
  mug:         'M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 10h2a2 2 0 0 1 0 4h-2',
  msg:         'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z',
  chart:       'M3 21V5M3 21h18M8 21v-6M13 21v-10M18 21v-4',
  shield:      'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z',
  shieldcheck: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM9 12l2 2 4-4',
  up:          'M12 19V5M5 12l7-7 7 7',
  down:        'M12 5v14M5 12l7 7 7-7',
  bolt:        'M13 2 3 14h7l-1 8 10-12h-7l1-8Z',
  alert:       'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  users:       'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  globe:       'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z',
  download:    'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  trend:       'M22 7 13.5 15.5 8.5 10.5 2 17M22 7h-6M22 7v6',
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

function money(n: number) {
  return 'Rs ' + Number(n).toLocaleString('en-US');
}

function tileGrad(tone: string) {
  const G = TONE_COLORS[tone] || TONE_COLORS.violet;
  return `linear-gradient(140deg, ${G[0]} 0%, ${G[1]} 60%, ${G[2]} 100%)`;
}

function Tile({ p, height = 120, glyphSize = 48 }: { p: AdminProduct; height?: number; glyphSize?: number }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 14, overflow: 'hidden', background: tileGrad(p.tone), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 80% 0%, rgba(255,255,255,.5), transparent 55%)' }} />
      <div style={{ color: 'rgba(255,255,255,.92)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.18))' }}>
        <Icon name={p.glyph} size={glyphSize} color="rgba(255,255,255,.95)" />
      </div>
    </div>
  );
}

function ATrend({ value, up }: { value: string; up: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 800, color: up ? '#1F9D6B' : '#E5447A', background: up ? '#E4F6EE' : '#FCE8EF', padding: '3px 7px', borderRadius: 8, whiteSpace: 'nowrap' }}>
      <Icon name={up ? 'up' : 'down'} size={11} color={up ? '#1F9D6B' : '#E5447A'} />
      {value}
    </span>
  );
}

function ACard({ title, sub, children, right, style, tight }: { title?: string | null; sub?: string | null; children: React.ReactNode; right?: React.ReactNode; style?: CSSProperties; tight?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(64,41,112,.08)', borderRadius: 20, boxShadow: '0 4px 20px rgba(64,41,112,.06)', display: 'flex', flexDirection: 'column', padding: '18px 20px 20px', minWidth: 0, ...(style || {}) }}>
      {title ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: tight ? 10 : 16 }}>
          <div>
            <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 700, fontSize: 15.5, color: '#2A1E4A' }}>{title}</div>
            {sub ? <div style={{ fontSize: 12, color: '#9389AE', marginTop: 2 }}>{sub}</div> : null}
          </div>
          {right || null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────

const RANGES = ['Today', 'Last 7 days', 'Last 30 days', 'Last 90 days'];

export default function KaprukaAdminUI({ railOffset = false, topOffset = 0 }: { railOffset?: boolean; topOffset?: number } = {}) {
  const [range, setRange] = useState('Last 7 days');

  // -------- KPI strip --------
  const kpis: [string, string, string, boolean, string, string, string][] = [
    ['Conversations', '3,482', '+12.4%', true, 'across web & WhatsApp', '#7B5BD6', 'chart'],
    ['Orders placed', '614', '+8.1%', true, 'completed in chat', '#5C3FB0', 'box'],
    ['Chat → order rate', '17.6%', '+1.4 pts', true, 'visitor to paid order', '#1F9D6B', 'trend'],
    ['Revenue (GMV)', 'Rs 6.84M', '+15.3%', true, 'gross merchandise value', '#FDB813', 'spark'],
    ['Avg order value', 'Rs 11,150', '−3.2%', false, 'per paid order', '#E5447A', 'cart'],
  ];

  // -------- conversation volume --------
  const volData = [238, 262, 251, 289, 274, 233, 201, 247, 283, 301, 318, 295, 277, 309];
  const ordData = [41, 45, 42, 52, 49, 38, 33, 42, 50, 55, 58, 52, 49, 57];
  const dayLbl = ['15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28'];
  const maxV = Math.max(...volData);
  const ch = 158;

  // -------- conversion funnel --------
  const funnel: [string, number, string][] = [
    ['Searches started', 4210, '#8067D8'],
    ['Products viewed', 3180, '#6B53C8'],
    ['Added to cart', 1290, '#5C3FB0'],
    ['Checkout started', 870, '#473294'],
    ['Order paid', 614, '#1F9D6B'],
  ];
  const fTop = funnel[0][1];

  // -------- top products --------
  const prodStats: [string, number][] = [['p1', 182], ['p2', 143], ['p5', 96], ['p3', 71], ['p4', 54]];

  // -------- top intents --------
  const intents: [string, number][] = [
    ['Birthday gifts', 31], ['Flowers to Colombo', 18], ['Chocolate hampers', 14], ['Gifts for mom / her', 11],
    ['Anniversary gifts', 9], ['Track my order', 8], ['Corporate hampers', 5], ['Wedding gifts', 4],
  ];
  const iMax = intents[0][1];

  // -------- delivery destinations --------
  const cities: [string, number, boolean][] = [
    ['Colombo', 34, false], ['Dehiwala', 11, false], ['Kandy', 9, false], ['Negombo', 7, false], ['Nugegoda', 6, false],
    ['Galle', 5, false], ['USA · diaspora', 9, true], ['United Kingdom', 7, true], ['Australia', 6, true],
  ];
  const cMax = Math.max(...cities.map((c) => c[1]));

  // -------- AI performance --------
  const ai: [string, string, string, string, string][] = [
    ['shieldcheck', 'Self-serve resolution', '86%', 'no human needed', '#1F9D6B'],
    ['bolt', 'Avg first response', '1.2s', 'median reply time', '#7B5BD6'],
    ['alert', 'Not-understood rate', '4.3%', 'fallback replies', '#D98818'],
    ['users', 'Handed to human', '6.1%', 'agent escalations', '#5C3FB0'],
    ['spark', '“Help me write” used', '38%', 'of paid orders', '#A855D6'],
    ['msg', 'Msgs per order', '11', 'avg to checkout', '#E5447A'],
  ];

  // -------- recent conversations feed --------
  const feed: [string, string, string, number | null, string, string][] = [
    ['Nimal P.', 'Birthday gift for mom under Rs 10k', 'Order placed', 8850, 'pos', '2m ago'],
    ['Ayesha R.', 'Send orchids to Kandy on Friday', 'Order placed', 11400, 'pos', '14m ago'],
    ['Guest', 'Do you ship gifts to Australia?', 'Browsing', null, 'neu', '21m ago'],
    ['Dinesh F.', 'Where is my order KPR-2026-0481?', 'Tracked', null, 'neu', '33m ago'],
    ['Guest', 'anything cheaper than this?', 'Drop-off', null, 'neg', '40m ago'],
    ['Sanduni W.', 'Chocolate hamper + card for husband', 'Order placed', 12900, 'pos', '52m ago'],
    ['Roshan M.', 'Help me write a get-well message', 'Browsing', null, 'pos', '1h ago'],
    ['Tharushi K.', 'Anniversary roses to Colombo 07', 'Order placed', 8500, 'pos', '1h ago'],
  ];
  const outChip: Record<string, [string, string]> = {
    'Order placed': ['#1F9D6B', '#E4F6EE'],
    Tracked: ['#5C3FB0', '#EEE7FB'],
    Browsing: ['#D98818', '#FCF1DD'],
    'Drop-off': ['#E5447A', '#FCE8EF'],
  };
  const sentDot: Record<string, string> = { pos: '#1F9D6B', neu: '#D98818', neg: '#E5447A' };

  return (
    <div style={{ position: 'fixed', top: topOffset, right: 0, bottom: 0, left: railOffset ? 74 : 0, zIndex: 50, overflowY: 'auto', background: 'radial-gradient(120% 70% at 100% 0%, #F3EFFC 0%, #ECE7F6 55%, #E7E0F4 100%)', animation: 'fadeBg .3s both', color: '#241C3D' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '26px 30px 60px' }}>

        {/* banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'linear-gradient(135deg,#FFF6E0,#FDEFC9)', border: '1px solid #F2D89A', borderRadius: 14, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: '#FDB813', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <Icon name="shield" size={17} color="#5A3D00" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#7A5400' }}>Manager view — not visible to shoppers</div>
            <div style={{ fontSize: 12, color: '#9A7220' }}>This dashboard is shown only to chatbot administrators. All figures below are sample data for demonstration.</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#7A5400', background: '#FBE3A6', padding: '5px 10px', borderRadius: 8, flex: '0 0 auto' }}>DEMO DATA</span>
        </div>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid #fff', boxShadow: '0 4px 12px rgba(64,41,112,.22)', flex: '0 0 auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IDLE_AVATAR} alt="Ruki" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 23, color: '#2A1E4A', lineHeight: 1.1 }}>Ruki Manager Dashboard</div>
            <div style={{ fontSize: 13, color: '#7B7398', marginTop: 1 }}>Performance & insights for your gift concierge</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', background: '#fff', border: '1px solid rgba(64,41,112,.1)', borderRadius: 12, padding: 3, boxShadow: '0 2px 8px rgba(64,41,112,.06)' }}>
            {RANGES.map((r) => {
              const on = range === r;
              return (
                <button key={r} onClick={() => setRange(r)} style={{ border: 'none', cursor: 'pointer', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, color: on ? '#fff' : '#6B6390', background: on ? 'linear-gradient(135deg,#402970,#5C3FB0)' : 'transparent', transition: 'all .15s' }}>{r}</button>
              );
            })}
          </div>
          <button onClick={() => {}} style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid rgba(64,41,112,.12)', background: '#fff', borderRadius: 12, padding: '9px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#5C3FB0', boxShadow: '0 2px 8px rgba(64,41,112,.06)' }}>
            <Icon name="download" size={15} color="#5C3FB0" />Export
          </button>
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(196px,1fr))', gap: 14 }}>
          {kpis.map(([label, val, tr, up, sub, accent, icon]) => (
            <div key={label} style={{ position: 'relative', background: '#fff', border: '1px solid rgba(64,41,112,.08)', borderRadius: 18, padding: '17px 18px 15px', boxShadow: '0 4px 18px rgba(64,41,112,.06)', display: 'flex', flexDirection: 'column', gap: 9, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: accent }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9389AE', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: accent + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={16} color={accent} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 26, color: '#2A1E4A', lineHeight: 1 }}>{val}</div>
                <ATrend value={tr} up={up} />
              </div>
              <div style={{ fontSize: 12, color: '#9389AE' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* volume + funnel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, marginTop: 16 }}>
          <ACard title="Conversation volume" sub="Daily chats with orders highlighted">
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: ch, padding: '0 2px' }}>
                {volData.map((v, i) => {
                  const cH = (v / maxV) * ch;
                  const oH = (ordData[i] / maxV) * ch;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <div title={`${v} chats · ${ordData[i]} orders`} style={{ width: '100%', maxWidth: 24, height: cH, borderRadius: '7px 7px 3px 3px', background: '#EDE6FA', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: oH, background: 'linear-gradient(180deg,#5C3FB0,#402970)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                {dayLbl.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#9389AE', fontWeight: 600 }}>{d}</div>)}
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 14, justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#7B7398', fontWeight: 600 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#EDE6FA' }} />Conversations</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#7B7398', fontWeight: 600 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#5C3FB0' }} />Resulted in order</div>
              </div>
            </div>
          </ACard>

          <ACard title="Conversion funnel" sub="Where shoppers drop off">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {funnel.map((f, i) => {
                const pct = (f[1] / fTop) * 100;
                const drop = i > 0 ? 100 - (f[1] / funnel[i - 1][1]) * 100 : 0;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#3A2E5C' }}>{f[0]}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#2A1E4A' }}>{f[1].toLocaleString()}</span>
                        <span style={{ fontSize: 11, color: '#9389AE', fontWeight: 600, minWidth: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div style={{ height: 11, borderRadius: 7, background: '#F1ECF8', overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', borderRadius: 7, background: f[2], transition: 'width .4s' }} />
                    </div>
                    {i > 0 ? <div style={{ fontSize: 10.5, color: '#C09BB0', fontWeight: 600, marginTop: 3 }}>↓ {drop.toFixed(0)}% drop-off</div> : null}
                  </div>
                );
              })}
            </div>
          </ACard>
        </div>

        {/* CSAT */}
        <div style={{ marginTop: 16 }}>
          <ACard style={{ background: 'linear-gradient(135deg,#F5F1FE,#FBF9FF)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9389AE', textTransform: 'uppercase', letterSpacing: '.4px' }}>Customer satisfaction</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 34, color: '#2A1E4A', lineHeight: 1 }}>4.6</div>
                  <div style={{ fontSize: 13, color: '#9389AE', fontWeight: 600 }}>/ 5.0</div>
                  <div style={{ display: 'flex', color: '#FDB813', gap: 2 }}>{[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="star" size={16} color="#FDB813" fill={i < 4 ? '#FDB813' : undefined} />)}</div>
                </div>
                <div style={{ fontSize: 12, color: '#9389AE' }}>from 1,204 post-chat ratings</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 18 }}>
                {([['😊 Positive', '78%', '#1F9D6B'], ['😐 Neutral', '17%', '#D98818'], ['☹️ Negative', '5%', '#E5447A']] as [string, string, string][]).map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 20, color: s[2] }}>{s[1]}</div>
                    <div style={{ fontSize: 11.5, color: '#7B7398', fontWeight: 600, marginTop: 2 }}>{s[0]}</div>
                  </div>
                ))}
              </div>
            </div>
          </ACard>
        </div>

        {/* top products + top intents */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <ACard title="Top-selling gifts" sub={range}>
            <div>
              {prodStats.map(([id, units], i) => {
                const p = PRODUCTS[id];
                const rev = units * p.price;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < prodStats.length - 1 ? '1px solid #F1ECF8' : 'none' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, overflow: 'hidden', flex: '0 0 auto' }}><Tile p={p} height={42} glyphSize={18} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#2A1E4A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: '#9389AE', marginTop: 1 }}>{units} sold · {p.rating}★ ({p.reviews})</div>
                    </div>
                    <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: '#402970' }}>{money(rev)}</div>
                      <div style={{ fontSize: 11, color: '#9389AE' }}>revenue</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ACard>

          <ACard title="Top shopper intents" sub="What people ask Ruki for">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {intents.map((it, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3A2E5C' }}>{it[0]}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#7B5BD6' }}>{it[1]}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, background: '#F1ECF8', overflow: 'hidden' }}>
                    <div style={{ width: (it[1] / iMax) * 100 + '%', height: '100%', borderRadius: 5, background: 'linear-gradient(90deg,#7B5BD6,#5C3FB0)' }} />
                  </div>
                </div>
              ))}
            </div>
          </ACard>
        </div>

        {/* destinations + AI performance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <ACard title="Delivery destinations" sub="Where gifts are headed">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cities.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, background: c[2] ? '#E4F6EE' : '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <Icon name={c[2] ? 'globe' : 'pin'} size={13} color={c[2] ? '#1F9D6B' : '#7B5BD6'} />
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3A2E5C', flex: '0 0 116px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c[0]}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 5, background: '#F1ECF8', overflow: 'hidden' }}>
                    <div style={{ width: (c[1] / cMax) * 100 + '%', height: '100%', borderRadius: 5, background: c[2] ? '#1F9D6B' : '#9D85E6' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#5C5276', flex: '0 0 34px', textAlign: 'right' }}>{c[1]}%</span>
                </div>
              ))}
              <div style={{ marginTop: 6, fontSize: 11.5, color: '#9389AE', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="globe" size={13} color="#1F9D6B" />22% of orders ship abroad to Sri Lankan diaspora
              </div>
            </div>
          </ACard>

          <ACard title="Ruki AI performance" sub="Assistant quality & efficiency">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {ai.map((a, i) => (
                <div key={i} style={{ background: '#FBF9FF', border: '1px solid rgba(64,41,112,.07)', borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: a[4] + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a[0]} size={15} color={a[4]} /></div>
                    <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 20, color: '#2A1E4A' }}>{a[2]}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#3A2E5C' }}>{a[1]}</div>
                  <div style={{ fontSize: 11, color: '#9389AE' }}>{a[3]}</div>
                </div>
              ))}
            </div>
          </ACard>
        </div>

        {/* recent conversations feed */}
        <div style={{ marginTop: 16 }}>
          <ACard
            title="Recent conversations"
            sub="Live activity feed"
            right={<span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#1F9D6B' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />Live</span>}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {feed.map((f, i) => {
                const oc = outChip[f[2]];
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < feed.length - 1 ? '1px solid #F1ECF8' : 'none' }}>
                    <span title={f[5]} style={{ width: 8, height: 8, borderRadius: '50%', background: sentDot[f[4]], flex: '0 0 auto' }} />
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#EEE7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontWeight: 800, fontSize: 12.5, color: '#5C3FB0' }}>{f[0] === 'Guest' ? '?' : f[0][0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#2A1E4A' }}>{f[0]}</span>
                        <span style={{ fontSize: 11.5, color: '#B7AECB' }}>{f[5]}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#7B7398', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{f[1]}”</div>
                    </div>
                    {f[3] ? <span style={{ fontSize: 12.5, fontWeight: 800, color: '#402970', flex: '0 0 auto' }}>{money(f[3])}</span> : null}
                    <span style={{ fontSize: 11, fontWeight: 700, color: oc[0], background: oc[1], padding: '4px 9px', borderRadius: 7, flex: '0 0 auto', whiteSpace: 'nowrap' }}>{f[2]}</span>
                  </div>
                );
              })}
            </div>
          </ACard>
        </div>

      </div>
    </div>
  );
}
