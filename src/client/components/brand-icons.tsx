import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** Perplexity — source of the monitored AI answers. */
export function PerplexityIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2 4.5 7.5v9L12 22l7.5-5.5v-9L12 2zm0 2.2 5.5 4v3.1l-4-2.9V6.6l-1.5-1.1v4.6L7 13.2V9.8l5-3.6V4.2zM6 11.4l4.5 3.2v4.8L6 16.6v-5.2zm12 0v5.2l-4.5 2.8v-4.8L18 11.4z" />
    </svg>
  );
}

/** Reddit — a common citation source in AI answers. */
export function RedditIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2a1.5 1.5 0 0 0-1.45 1.11l-3.3 1.36a2.25 2.25 0 1 0-2.2 3.02c-.32.7-.5 1.45-.5 2.18C4.55 13.7 7.94 16 12 16s7.45-2.3 7.45-6.33c0-.73-.18-1.47-.5-2.18a2.25 2.25 0 1 0-2.2-3.02l-3.3-1.36A1.5 1.5 0 0 0 12 2zm-4.75 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm9.5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM9.2 11.3c.9-.7 1.85-1.05 2.8-1.05s1.9.35 2.8 1.05l-.9 1.2c-.65-.5-1.28-.75-1.9-.75s-1.25.25-1.9.75l-.9-1.2zM4.4 13.9a8.6 8.6 0 0 0 3.35 3.68l-.85 1.5C4.3 17.7 2.9 15.6 2.9 13.1l1.5.8zm15.2 0 1.5-.8c0 2.5-1.4 4.6-4 5.98l-.85-1.5a8.6 8.6 0 0 0 3.35-3.68zM9 18.6c.95.25 1.96.4 3 .4s2.05-.15 3-.4l.6 1.55c-1.13.3-2.36.45-3.6.45s-2.47-.15-3.6-.45L9 18.6z" />
    </svg>
  );
}

/** X (Twitter) — a common citation source in AI answers. */
export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.9 2.6h3.68l-8.04 9.19L24 22.4h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 2.6h7.59l5.24 6.93L18.9 2.6zm-1.29 17.7h2.04L6.49 4.6H4.3l13.31 15.7z" />
    </svg>
  );
}

/** Google Search — the classic search channel CiteScout complements. */
export function GoogleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path
        d="M12.5 2c-5.8 0-10.5 4.7-10.5 10.5S6.7 23 12.5 23c5.24 0 9.6-3.84 10.36-8.86h-9.36v-3h9.36C22.1 6.84 17.74 2 12.5 2zm0 3c3.6 0 6.66 2.5 7.5 5.86h-7.5v6.5c0 2.6-2.13 4.64-4.75 4.64S5.5 19.96 5.5 17.36 7.63 12.7 10.25 12.7c1.1 0 2.1.37 2.9 1v-3.2a7.7 7.7 0 0 0-2.9-.56C6.13 9.94 2.5 13.2 2.5 17.36S6.13 24 10.25 24c3.94 0 7.17-2.96 7.68-6.78l.07.03v-.75h5.44v-1.5C23.44 7.36 18.6 2 12.5 2z"
        opacity=".0"
      />
      <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12.05c0 5.05 4.13 9.95 9.99 9.95 5.23 0 9.04-3.58 9.04-8.87 0-1.1-.16-1.73-.16-1.73l.45-.3z" />
    </svg>
  );
}

/** YouTube — video citations in AI answers. */
export function YoutubeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
    </svg>
  );
}

/** Wikipedia — reference citations in AI answers. */
export function WikipediaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 4.5c-.4 0-1.06.94-1.06.94L8.3 11.2c.9-.36 2.04-.54 3.7-.44 2.53.16 4.24 1.06 4.24 1.06l1.9-3.84S12.4 4.5 12 4.5zM7.34 12.2 3.6 19.74h3.5l.7-1.44h6.42l.66 1.44h3.56l-2.3-4.64c-1.83-.5-4.05-.9-6.14-.9-1.1 0-1.9.14-2.66.4zm.5 3.7h3.94l-.62 1.3H8.2l-.36-.7.36-.6z" />
    </svg>
  );
}

/** Notion — where marketing teams document their work. */
export function NotionIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4.4 2.8c1-.8 2.5-.7 3.7-.6l4.8.3c.6.05 1.3.1 1.7.5.4.4.5 1 .6 1.6l.5 10.6c0 .5.05 1.1-.3 1.5-.3.4-.9.5-1.4.4l-7.9-.5c-.7-.05-1.5-.1-2-.6-.5-.5-.6-1.3-.65-2L3.3 5.3c-.1-1-.2-1.9.4-2.5h.7zm2.9 2.1v10.6c0 .4.1.9.5 1.1.4.2.8 0 1.2-.1L14 7.5l.2 8.9c0 .3.1.7.4.8.3.1.6-.1.8-.3.3-.3.3-.7.3-1.1L15.4 6c0-.4 0-.8-.3-1.1-.3-.3-.7-.2-1 0L8.4 12l-.2-7.2c0-.3-.2-.6-.5-.6-.3 0-.4.4-.4.7z" />
    </svg>
  );
}
