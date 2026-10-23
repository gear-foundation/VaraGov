"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

export function ErrorNotice({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-[10px] border border-nay/25 bg-nay/6 text-sm text-nay ${
        compact ? "p-3" : "panel p-5"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p>{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-ghost mt-2 h-8 !px-2.5"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
