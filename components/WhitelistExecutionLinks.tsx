"use client";

import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import { PHASE_LABEL } from "@/components/referenda";
import type { FellowshipWhitelistLinks } from "@/lib/chain/whitelist-links";

export function WhitelistExecutionLinks({
  links,
}: {
  links: FellowshipWhitelistLinks | undefined;
}) {
  if (!links?.executions.length) return null;

  return (
    <section className="panel mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="label-serif flex items-center gap-2">
        <Link2 size={15} className="text-accent-ink" aria-hidden="true" />
        Execution
      </span>
      <div className="flex flex-wrap gap-2">
        {links.executions.map((execution) => (
          <Link
            key={execution.index}
            href={`/referenda/${execution.index}`}
            className="btn btn-soft h-8 !px-3 text-xs"
            title={`${PHASE_LABEL[execution.phase]} · Whitelisted Caller`}
          >
            Referendum #{execution.index}
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
