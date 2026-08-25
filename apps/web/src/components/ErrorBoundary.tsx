import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 720, margin: '40px auto' }}>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 20 }}>
            <h2 style={{ margin: '0 0 8px', color: '#B91C1C', fontSize: 18 }}>Oups, une erreur inattendue est survenue</h2>
            <p style={{ margin: '0 0 12px', color: '#374151', fontSize: 14 }}>
              L’équipe technique a été informée. Vous pouvez réessayer en rechargeant la page.
            </p>
            <pre style={{
              background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8,
              padding: 12, fontSize: 11, overflow: 'auto', maxHeight: 220, color: '#991B1B',
            }}>{this.state.error.message}</pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              style={{
                background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
