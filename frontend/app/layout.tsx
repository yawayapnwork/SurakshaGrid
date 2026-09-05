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
    <html lang="en" className={`${inter.className} h-full w-full overflow-hidden antialiased`}>
      <body className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 text-slate-900">
        {children}
      </body>
    </html>
  );
}
