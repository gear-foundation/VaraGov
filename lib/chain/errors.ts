const FALLBACK_ERROR = "Something went wrong. Please try again.";

/** Converts wallet, RPC and runtime-provider errors into actionable UI copy. */
export function humanizeTxError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("inability to pay") ||
    (normalized.includes("payment") && normalized.includes("invalid transaction"))
  ) {
    return "There is not enough transferable VARA to pay the network fee. Reduce the transaction amount or top up the account, then try again.";
  }

  if (
    normalized.includes("user rejected") ||
    normalized.includes("rejected by user") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled") ||
    normalized.includes("code 4001")
  ) {
    return "The request was rejected in the wallet. No changes were made.";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("websocket") ||
    normalized.includes("disconnected") ||
    normalized.includes("connection closed")
  ) {
    return "The app lost its connection to Vara Network. Check your connection and try again.";
  }

  if (normalized.includes("stale") || normalized.includes("outdated")) {
    return "This transaction is outdated. Refresh the page and try again.";
  }

  if (
    normalized.includes("invalid transaction") &&
    normalized.includes("future")
  ) {
    return "This account has an earlier transaction still pending. Wait for it to finish, then try again.";
  }

  if (
    normalized.includes("bad proof") ||
    normalized.includes("badproof") ||
    normalized.includes("bad signature") ||
    normalized.includes("invalid signature")
  ) {
    return "The network could not verify the wallet signature. Reconnect the wallet and try again.";
  }

  if (
    normalized.includes("exhausts resources") ||
    normalized.includes("exhaustsresources")
  ) {
    return "The network cannot fit this transaction into a block right now. Wait a moment and try again.";
  }

  if (
    normalized.includes("invalid transaction") &&
    normalized.includes("call")
  ) {
    return "This action is not allowed in the referendum's current state. Refresh the page and try again.";
  }

  if (
    normalized.includes("priority is too low") ||
    normalized.includes("already imported") ||
    normalized.includes("temporarily banned")
  ) {
    return "Another transaction from this account is already pending. Wait for it to finish, then try again.";
  }

  if (normalized.includes("referenda.notongoing")) {
    return "This referendum is no longer ongoing, so this action cannot be completed.";
  }

  if (normalized.includes("convictionvoting.notvoter")) {
    return "No active vote was found for this account on the referendum.";
  }

  const moduleCode = raw.match(/\b([a-z][\w]*\.[A-Z][\w]*)\b/)?.[1];
  if (moduleCode) {
    return `The network rejected this action (${moduleCode}). Review the entered values and try again.`;
  }

  return FALLBACK_ERROR;
}

export function humanizeReadError(subject: string): string {
  return `Could not load ${subject}. Check your connection and try again.`;
}

export function humanizeApiError(error: unknown, status?: number): string {
  const raw = typeof error === "string" ? error : "";
  const normalized = raw.toLowerCase();

  if (status && status >= 500) {
    return "The server could not complete the request. Please try again shortly.";
  }

  if (
    normalized.includes("payloadjson") ||
    normalized.includes("wrong action") ||
    normalized.includes("invalid action")
  ) {
    return "The signed request is invalid. Refresh the page and try again.";
  }
  if (
    normalized.includes("signature verification failed") ||
    normalized.includes("invalid address or signature")
  ) {
    return "The wallet signature could not be verified. Check the selected account and try again.";
  }
  if (normalized.includes("timestamp")) {
    return "The signed request expired. Please sign it again.";
  }
  if (raw) return raw;
  return FALLBACK_ERROR;
}

export function humanizeHttpError(): string {
  return "Could not reach the app server. Check your connection and try again.";
}

export function humanizeTxStatus(type: string): string {
  switch (type.toLowerCase()) {
    case "dropped":
      return "The network dropped this transaction. Please try again.";
    case "invalid":
      return "The transaction is no longer valid. Refresh the page and try again.";
    case "usurped":
      return "A newer transaction from this account replaced this one.";
    case "finalitytimeout":
      return "The transaction was submitted but was not finalized in time. Check the account before retrying.";
    default:
      return FALLBACK_ERROR;
  }
}
