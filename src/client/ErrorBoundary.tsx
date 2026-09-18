import { Component, type ErrorInfo, type ReactNode } from 'react';

interface BoundaryProps {
  children: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

/**
 * Keeps a render crash from producing a blank page. The message deliberately
 * avoids echoing error details to the user.
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      JSON.stringify({
        event: 'client_render_error',
        error_name: error.name,
        component_stack_length: info.componentStack?.length ?? 0,
      }),
    );
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="app-state" role="alert">
        <h1>Something went wrong</h1>
        <p>
          The interface hit an unexpected error and stopped. Reloading usually fixes it. If it
          repeats, email support@cite-scout.com with what you were doing.
        </p>
        <button
          type="button"
          className="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload CiteScout
        </button>
      </div>
    );
  }
}
