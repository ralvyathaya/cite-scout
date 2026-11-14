import { Link, useLocation, useSearchParams } from 'react-router';
import { geoEngineSchema } from '../../../shared/geo';

export function MonitoringNavigation() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const filters = new URLSearchParams();
  const days = params.get('days');
  if (days && ['7', '14', '30'].includes(days)) filters.set('days', days);
  const engine = geoEngineSchema.safeParse(params.get('engine'));
  if (engine.success) filters.set('engine', engine.data);
  const prompt = params.get('promptId');
  if (prompt && prompt.length <= 100) filters.set('promptId', prompt);
  const query = filters.size ? `?${filters}` : '';
  const active =
    pathname === '/app/questions' ? 'Prompts' : pathname === '/app/trends' ? 'Trends' : 'Answers';
  return (
    <nav aria-label="Monitoring views" className="mb-4 flex gap-5 border-b text-sm">
      {[
        { label: 'Prompts', to: '/app/questions' },
        { label: 'Answers', to: `/app/observations${query}` },
        { label: 'Trends', to: `/app/trends${query}` },
      ].map(({ label, to }) => (
        <Link
          key={label}
          to={to}
          aria-current={active === label ? 'page' : undefined}
          className={`-mb-px border-b-2 px-1 py-2.5 font-medium ${active === label ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
