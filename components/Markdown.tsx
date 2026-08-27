"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export function Markdown({
  children,
  dropCap = false,
}: {
  children: string;
  dropCap?: boolean;
}) {
  return (
    <div className={`${dropCap ? "drop-cap " : ""}prose-gov text-sm leading-relaxed [&_a]:text-accent-ink [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5`}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: (props) => <a {...props} rel="nofollow ugc noopener" target="_blank" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
