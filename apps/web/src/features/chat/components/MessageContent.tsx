import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import CodeBlock from "./CodeBlock";
import { PillLink } from "./PillLink";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

export const MessageContent = memo(function MessageContent({
  content,
  isStreaming,
}: MessageContentProps) {
  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          p: ({ children, ...props }) => (
            <p className="wrap-anywhere" data-testid="message-content-paragraph" {...props}>
              {children}
            </p>
          ),
          li: ({ children, ...props }) => (
            <li className="wrap-anywhere" {...props}>
              {children}
            </li>
          ),
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-lg border border-border/60">
              <table className="w-max min-w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="whitespace-nowrap border border-border/60 bg-muted/40 px-3 py-2 text-left align-top font-semibold"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="border border-border/60 px-3 py-2 align-top wrap-anywhere"
              {...props}
            >
              {children}
            </td>
          ),
          // Custom code block rendering with copy button
          pre: ({ children }) => {
            // children is the <code> element
            return <>{children}</>;
          },
          code: ({ className, children, ...props }) => {
            // Check if this is a code block (has language class) or inline code
            const isCodeBlock =
              className?.includes("language-") || className?.includes("hljs");

            // If it has a language, definitely a code block
            if (isCodeBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }

            // If no language, check if content has newlines - if so, treat as block
            const contentString = String(children);
            if (contentString.includes("\n")) {
              return (
                <CodeBlock className="language-text">{children}</CodeBlock>
              );
            }

            // Inline code
            return (
              <code
                className="bg-muted/70 break-all rounded px-1.5 py-0.5 font-mono text-[0.925em] text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },
          // Custom link as pill
          a: ({ href, children }) => (
            <PillLink href={href}>{children}</PillLink>
          ),
          // Imported images (e.g. Gemini's lh3.googleusercontent.com URLs) use
          // referrer-based hotlink protection — omit the Referer header so they
          // load instead of returning 429/403.
          img: ({ src, alt }) =>
            typeof src === "string" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ""}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="my-2 max-h-96 max-w-full rounded-lg border border-border/60"
              />
            ) : null,
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      )}
    </>
  );
});
