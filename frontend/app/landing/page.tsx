import type { Metadata } from 'next';
import { LandingPage } from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'SurakshaGrid — Flood Intelligence & Emergency Dispatch',
  description:
    'Real-time PostGIS risk scoring, AI-verified citizen reports, and optimized rescue dispatch in one command center.',
};

export default function Landing() {
  return <LandingPage />;
}
