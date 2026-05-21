import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import * as React from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/sidebar';
import { queryClient } from '@/lib/queryClient';
import { api } from '@/lib/api';
import '../styles/globals.css';

// On first run (no provider keys configured), redirect to /onboarding.
// We do this from a top-level component inside the QueryClientProvider so
// the auth check participates in the same cache.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      api.getSettings() as Promise<{
        provider_api_keys?: Record<string, string>;
        default_model_id?: string;
      }>,
  });

  React.useEffect(() => {
    if (!settingsQuery.data) return;
    if (router.pathname === '/onboarding') return;
    // Consider onboarding "done" once either a cloud key is configured OR a
    // default model is chosen (local-only setups won't have a key).
    const keys = settingsQuery.data.provider_api_keys ?? {};
    const hasDefault = !!settingsQuery.data.default_model_id;
    if (Object.keys(keys).length === 0 && !hasDefault) {
      router.replace('/onboarding');
    }
  }, [settingsQuery.data, router]);

  return <>{children}</>;
}

export default function App({ Component, pageProps, router }: AppProps) {
  const isOnboarding = router.pathname === '/onboarding';

  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingGate>
        {isOnboarding ? (
          <Component {...pageProps} />
        ) : (
          <DashboardLayout>
            <Component {...pageProps} />
          </DashboardLayout>
        )}
      </OnboardingGate>
    </QueryClientProvider>
  );
}
