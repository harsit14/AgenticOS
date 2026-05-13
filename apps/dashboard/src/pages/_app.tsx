import type { AppProps } from 'next/app';
import { DashboardLayout } from '@/components/layout/sidebar';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <DashboardLayout>
      <Component {...pageProps} />
    </DashboardLayout>
  );
}
