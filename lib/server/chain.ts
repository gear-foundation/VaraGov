import { ApiPromise, WsProvider } from "@polkadot/api";

const ENDPOINTS = [
  "wss://rpc.vara.network",
  "wss://archive-rpc.vara-network.io",
  "wss://archive.vara-network.io",
];

const g = globalThis as unknown as { varaApi?: Promise<ApiPromise> };

// Server-side singleton; survives HMR via globalThis.
export function getServerApi(): Promise<ApiPromise> {
  if (!g.varaApi) {
    g.varaApi = ApiPromise.create({
      provider: new WsProvider(ENDPOINTS),
      noInitWarn: true,
    });
  }
  return g.varaApi;
}
