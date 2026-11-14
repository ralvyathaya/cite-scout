import { memo, type ReactNode } from 'react';
import Markdown from 'markdown-to-jsx/react';

function AnswerLink({ href, children }: { href?: string; children?: ReactNode }) {
  let safeUrl: string | undefined;
  try {
    const url = new URL(href ?? '');
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      safeUrl = url.href;
  } catch {
    // Keep the label readable when a saved answer contains an invalid link.
  }
  return safeUrl ? (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

function PreviewLink({ children }: { children?: ReactNode }) {
  return <span>{children}</span>;
}

export default memo(function MarkdownBody({ text, preview }: { text: string; preview: boolean }) {
  return (
    <Markdown
      className="answer-markdown"
      options={{
        forceBlock: true,
        forceWrapper: true,
        disableParsingRawHTML: true,
        overrides: {
          a: preview ? PreviewLink : AnswerLink,
          img: ({ alt }: { alt?: string }) => <span>{alt ?? 'Image'}</span>,
          h1: { component: 'h3' },
        },
      }}
    >
      {text}
    </Markdown>
  );
});
