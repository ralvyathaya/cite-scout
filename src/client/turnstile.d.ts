interface TurnstileOptions {
  sitekey: string;
  action: string;
  size?: 'normal' | 'compact' | 'flexible';
  callback: (token: string) => void;
  'expired-callback': () => void;
}

interface Window {
  turnstile?: { render(container: HTMLElement, options: TurnstileOptions): string };
}
