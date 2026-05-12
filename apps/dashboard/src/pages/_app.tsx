import type { Metadata } from 'next';
import { DashboardLayout } from '@/components/layout/sidebar';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Agentic Control Tower',
  description: 'Unified platform for AI agent management and orchestration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}