'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  History,
  Menu,
  Mic,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Stack', href: '#stack' },
];

const STACK_LOGOS = [
  'FastAPI',
  'PostGIS',
  'MapLibre GL',
  'Next.js',
  'Redis',
  'Hugging Face',
  'Whisper',
  'NLLB-200',
  'PostgreSQL',
  'WebSockets',
];

const RISK_GRADIENT_STOPS = [
  { color: 'bg-emerald-400', label: 'Low' },
  { color: 'bg-amber-400', label: 'Moderate' },
  { color: 'bg-orange-500', label: 'High' },
  { color: 'bg-red-500', label: 'Critical' },
];

interface BentoTile {
  className: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
  visual?: React.ReactNode;
}

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const container = document.getElementById('landing-scroll-root');
    if (!container) return;
    const onScroll = () => setScrolled(container.scrollTop > 8);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="bg-slate-900 text-white p-1.5 rounded-lg group-hover:scale-105 transition-transform duration-200">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-slate-900">SurakshaGrid</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/report"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors duration-150"
          >
            Citizen SOS
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
          >
            Get Started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200/80 bg-white/95 backdrop-blur-md px-6 py-4 space-y-3">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block text-sm font-medium text-slate-600 hover:text-slate-900 py-1"
            >
              {link.label}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/report"
              className="text-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg py-2"
            >
              Citizen SOS
            </Link>
            <Link
              href="/"
              className="text-center bg-slate-900 text-white text-sm font-semibold rounded-lg py-2"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function HeroPreviewCard() {
  return (
    <div className="relative mt-16 max-w-4xl mx-auto [perspective:2000px]">
      {/* Ambient glow behind the preview */}
      <div className="absolute -inset-x-10 -inset-y-6 bg-gradient-to-r from-sky-200/40 via-indigo-200/40 to-blue-200/40 blur-3xl rounded-[3rem] -z-10" />

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden transition-transform duration-500 hover:[transform:rotateX(1.5deg)_scale(1.01)]">
        {/* Fake browser chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-200/80 bg-slate-50/70">
          <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 text-[11px] font-medium text-slate-400">app.surakshagrid.io/command-center</span>
        </div>

        {/* Mini stat row */}
        <div className="flex flex-wrap gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-white">
          {[
            { label: 'Monitored Area', value: '42.5 km²', tint: 'bg-sky-50 text-sky-600' },
            { label: 'Active SOS', value: '18', tint: 'bg-amber-50 text-amber-600' },
            { label: 'Dispatched Units', value: '11', tint: 'bg-indigo-50 text-indigo-600' },
            { label: 'Avg ETA', value: '6.4 min', tint: 'bg-emerald-50 text-emerald-600' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-2 bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-sm"
            >
              <span className={`w-2 h-2 rounded-full ${stat.tint.split(' ')[0]}`} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{stat.label}</span>
              <span className="text-xs font-bold text-slate-900 tabular-nums">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Fake map area */}
        <div className="relative h-72 sm:h-80 bg-[radial-gradient(circle_at_30%_20%,#e0f2fe_0%,transparent_45%),radial-gradient(circle_at_75%_65%,#fee2e2_0%,transparent_40%),#eef2f7] overflow-hidden">
          {/* faint grid */}
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* risk zone blobs */}
          <div className="absolute left-[18%] top-[30%] w-24 h-16 rounded-full bg-emerald-400/30 blur-md" />
          <div className="absolute left-[42%] top-[20%] w-28 h-20 rounded-full bg-amber-400/35 blur-md" />
          <div className="absolute left-[58%] top-[48%] w-32 h-24 rounded-full bg-orange-500/40 blur-md" />
          <div className="absolute left-[68%] top-[62%] w-20 h-16 rounded-full bg-red-500/45 blur-md" />

          {/* incident markers */}
          <span className="absolute left-[60%] top-[52%] w-3 h-3 rounded-full bg-red-600 ring-4 ring-red-200 animate-pulse" />
          <span className="absolute left-[46%] top-[28%] w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-100" />
          <span className="absolute left-[22%] top-[36%] w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />

          {/* dispatch route line */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <path
              d="M 20% 80% Q 45% 55%, 60% 52%"
              stroke="#0f172a"
              strokeWidth="2"
              strokeDasharray="5 5"
              fill="none"
              opacity="0.6"
            />
          </svg>

          {/* floating scenario controls mini-card */}
          <div className="absolute left-4 top-4 w-40 bg-white/95 backdrop-blur-sm border border-slate-200/80 rounded-xl p-3 shadow-sm space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
              <Sparkles className="w-3 h-3 text-slate-400" />
              Scenario Controls
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full w-2/3 bg-slate-900 rounded-full" />
            </div>
            <div className="w-full text-center bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-md py-1.5">
              Run Dispatch
            </div>
          </div>

          {/* risk legend chip */}
          <div className="absolute right-4 bottom-4 flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-slate-200/80 rounded-lg px-2.5 py-1.5 shadow-sm">
            {RISK_GRADIENT_STOPS.map((stop) => (
              <span key={stop.label} className={`w-2 h-2 rounded-full ${stop.color}`} title={stop.label} />
            ))}
            <span className="text-[9px] font-semibold text-slate-400 ml-0.5">Risk</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoTicker() {
  const doubled = [...STACK_LOGOS, ...STACK_LOGOS];
  return (
    <div id="stack" className="py-16 border-y border-slate-200/80 bg-slate-50/50">
      <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-8">
        Built on an open, production-grade stack
      </p>
      <div className="relative overflow-hidden max-w-5xl mx-auto [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-[marquee_28s_linear_infinite] gap-12">
          {doubled.map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              className="text-lg font-semibold text-slate-300 grayscale hover:text-slate-500 hover:grayscale-0 transition-all duration-300 whitespace-nowrap select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}

function BentoFeatures() {
  const tiles: BentoTile[] = [
    {
      className: 'md:col-span-2 md:row-span-2',
      icon: <Activity className="w-5 h-5" />,
      accent: 'bg-sky-50 text-sky-600',
      title: 'Live PostGIS risk scoring',
      description:
        'Every designated emergency zone is scored in real time from actual geometry — geodesic distance to flood corridors, sampled elevation grids, and active incident density — not a static heatmap. Drag the rainfall slider and watch zones recolor with smooth per-feature transitions.',
      visual: (
        <div className="flex items-center gap-1.5 mt-5">
          {RISK_GRADIENT_STOPS.map((stop) => (
            <div key={stop.label} className="flex-1 space-y-1.5">
              <div className={`h-2 rounded-full ${stop.color}`} />
              <span className="text-[10px] font-medium text-slate-400">{stop.label}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      className: 'md:col-span-2',
      icon: <Mic className="w-5 h-5" />,
      accent: 'bg-indigo-50 text-indigo-600',
      title: 'AI-verified citizen reports',
      description:
        'A local vision-language model checks submitted photos for genuine flood hazards, while an open-source Whisper model transcribes and translates voice SOS reports from regional languages straight into English for dispatch.',
    },
    {
      className: 'md:col-span-1',
      icon: <Route className="w-5 h-5" />,
      accent: 'bg-emerald-50 text-emerald-600',
      title: 'Optimized dispatch',
      description: 'A Hungarian-algorithm solver assigns rescue units to incidents to minimize total ETA cost.',
    },
    {
      className: 'md:col-span-1',
      icon: <History className="w-5 h-5" />,
      accent: 'bg-amber-50 text-amber-600',
      title: 'Digital twin replay',
      description: 'Scrub through the full event timeline to reconstruct and audit any incident after the fact.',
    },
  ];

  return (
    <section id="features" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-xl mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Capabilities</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            One command center, four force multipliers.
          </h2>
          <p className="mt-4 text-slate-500 text-[15px] leading-relaxed">
            Every module runs on open-source models and real spatial data — no black boxes, no vendor lock-in.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4">
          {tiles.map((tile) => (
            <div
              key={tile.title}
              className={`group relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300/80 transition-all duration-300 ${tile.className}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tile.accent}`}>
                {tile.icon}
              </div>
              <h3 className="mt-4 font-semibold text-[15px] text-slate-900 tracking-tight">{tile.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{tile.description}</p>
              {tile.visual}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Citizens report in seconds',
      description: 'A photo, a voice note in any regional language, and a GPS pin — verified automatically on submit.',
    },
    {
      title: 'Risk zones update live',
      description: 'Rainfall, elevation, and incident density recompute every emergency zone’s risk weight instantly.',
    },
    {
      title: 'Dispatch runs the optimizer',
      description: 'One click assigns every available unit to the incident that minimizes total response time.',
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-slate-50/50 border-y border-slate-200/80 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-xl mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">How it works</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            From SOS to dispatch, end to end.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, idx) => (
            <div key={step.title} className="relative pl-12">
              <span className="absolute left-0 top-0 w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <h3 className="font-semibold text-[15px] text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-6 py-20">
      <div className="relative max-w-5xl mx-auto rounded-3xl bg-slate-900 overflow-hidden px-8 py-16 sm:px-16 text-center">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-600/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/30 rounded-full blur-3xl" />

        <div className="relative">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Bring your response teams into one live view.
          </h2>
          <p className="mt-4 text-slate-300 max-w-xl mx-auto text-[15px]">
            Open the command center and simulate a rainfall event, or file a test SOS report from the citizen form.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white text-slate-900 font-semibold text-sm px-6 py-3 rounded-xl transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
            >
              <Play className="w-4 h-4 fill-current" />
              Open Command Center
            </Link>
            <Link
              href="/report"
              className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white font-medium text-sm px-6 py-3 transition-colors duration-150"
            >
              File a Citizen SOS
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const columns = [
    {
      title: 'Product',
      links: [
        { label: 'Command Center', href: '/' },
        { label: 'Citizen SOS', href: '/report' },
        { label: 'Capabilities', href: '#features' },
        { label: 'How it works', href: '#how-it-works' },
      ],
    },
    {
      title: 'Stack',
      links: STACK_LOGOS.slice(0, 4).map((name) => ({ label: name, href: '#stack' })),
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#' },
        { label: 'Contact', href: '#' },
      ],
    },
  ];

  return (
    <footer className="px-6 pt-16 pb-8 border-t border-slate-200/80">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <div className="bg-slate-900 text-white p-1.5 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-semibold text-[15px] tracking-tight text-slate-900">SurakshaGrid</span>
            </div>
            <p className="mt-3 text-sm text-slate-500 max-w-xs leading-relaxed">
              Flood intelligence and emergency dispatch, built on open-source geospatial and AI tooling.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} SurakshaGrid. All rights reserved.</p>
          <p className="text-xs text-slate-400">Built for monsoon-ready emergency response.</p>
        </div>
      </div>
    </footer>
  );
}

export const LandingPage: React.FC = () => {
  return (
    <div
      id="landing-scroll-root"
      className="h-screen w-full overflow-y-auto overflow-x-hidden scroll-smooth bg-white text-slate-900"
    >
      <NavBar />

      {/* Hero */}
      <section className="relative px-6 pt-20 pb-8 sm:pt-28">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,#dbeafe_0%,transparent_60%)] -z-10" />

        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200/80 rounded-full px-3 py-1 text-xs font-medium text-slate-600">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Now with real-time PostGIS risk scoring
          </div>

          <h1 className="mt-6 text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
            Flood response,
            <br />
            orchestrated in real time.
          </h1>

          <p className="mt-6 text-lg text-slate-500 leading-relaxed max-w-2xl mx-auto">
            SurakshaGrid fuses live spatial risk modeling, AI-verified citizen reports, and optimized rescue
            dispatch into one command center — so every unit reaches the right place first.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
            >
              Open Command Center
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium text-sm px-6 py-3 transition-colors duration-150"
            >
              See how it works
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <HeroPreviewCard />
      </section>

      <LogoTicker />
      <BentoFeatures />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </div>
  );
};
