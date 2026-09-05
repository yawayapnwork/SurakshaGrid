import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SurakshaGrid - Emergency Flood Response Platform',
  description: 'Mathematical optimization & real-time GIS flood response dispatch engine.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F8FAFC] text-slate-900">
        {children}
      </body>
    </html>
  );
}
