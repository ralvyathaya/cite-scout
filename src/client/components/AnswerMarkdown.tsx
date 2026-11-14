import { lazy, Suspense } from 'react';

const MarkdownBody = lazy(() => import('./MarkdownBody'));

export function AnswerMarkdown({ text, preview = false }: { text: string; preview?: boolean }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap break-words text-sm">{text}</p>}>
      <MarkdownBody text={text} preview={preview} />
    </Suspense>
  );
}
