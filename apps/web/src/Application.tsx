import { Component, lazy, Suspense, type ReactNode } from 'react'
import './Application.css'

const PublicApp = lazy(() => import('./App'))
const StaffApp = lazy(() => import('./ManagerApp').then(module => ({ default: module.ManagerApp })))

export class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="application-status">
        <a className="application-brand" href="/">OpenHaus</a>
        <div role="alert">
          <h1>We couldn’t open this page.</h1>
          <p>Please reload the page. If you’re offline, reconnect first.</p>
        </div>
        <div className="application-status-actions">
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
          <a href="/">Back to OpenHaus</a>
        </div>
      </main>
    )
  }
}

export function Application({ pathname = window.location.pathname }: { pathname?: string }) {
  const manager = pathname === '/manager' || pathname.startsWith('/manager/')
  return (
    <ApplicationBoundary>
      <Suspense fallback={
        <main aria-busy="true" aria-label="Loading page" />
      }>
        {manager ? <StaffApp /> : <PublicApp />}
      </Suspense>
    </ApplicationBoundary>
  )
}
