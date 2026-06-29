import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' }

  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%', color: '#e94560', fontSize: 14 }}>
          <span>Render Error: {this.state.error}</span>
          <button onClick={this.handleReset} style={{ padding: '4px 14px', border: '1px solid #888', borderRadius: 4, background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 12 }}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
