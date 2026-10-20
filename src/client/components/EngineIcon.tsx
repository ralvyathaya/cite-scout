import type { GeoEngine } from '../../shared/geo';

const assets: Record<GeoEngine, string> = {
  claude_web_search: 'claude',
  perplexity: 'perplexity',
  openai_web_search: 'openai',
  google_aio: 'google',
  chatgpt_search: 'openai',
  bing_copilot: 'copilot',
};

export function EngineIcon({ engine, className = '' }: { engine: GeoEngine; className?: string }) {
  return (
    <img
      src={`/engines/${assets[engine]}.svg`}
      className={`size-5 shrink-0 object-contain ${className}`}
      width={20}
      height={20}
      alt=""
      aria-hidden="true"
    />
  );
}
