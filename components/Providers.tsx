"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiProvider } from "@/lib/chain/ApiProvider";
import { WalletProvider } from "@/lib/chain/wallet";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 6_000, retry: 2 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider>
        <WalletProvider>{children}</WalletProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}
