import { Component, lazy, Suspense, type ReactNode } from 'react'
import './Application.css'
import { SiteHeader } from './SiteHeader'

const PublicApp = lazy(() => import('./App'))
const StaffApp = lazy(() => import('./ManagerApp').then(module => ({ default: module.ManagerApp })))
const InformationApp = lazy(() => import('./InformationPages').then(module => ({ default: module.InformationPages })))
const BuyerApp = lazy(() => import('./ClientApp').then(module => ({ default: module.ClientApp })))
const DiscoveryRoute = lazy(() => import('./DiscoveryApp').then(module => ({ default: module.DiscoveryApp })))
const AgentRoute = lazy(() => import('./AgentPages').then(module => ({ default: module.AgentPages })))

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
  const path = pathname.replace(/\/$/, '') || '/'
  const manager = path === '/manager' || path === '/manager/login' || path === '/manager/analytics' || path === '/manager/profile' || /^\/manager\/preview\/[^/]+$/.test(path)
  const client = path === '/client' || path === '/client/login' || path === '/client/register'
  const information = pathname.replace(/\/$/, '').slice(1)
  const informationPage = information === 'about' || information === 'contact' || information === 'help' || information === 'privacy' || information === 'services' || information === 'buyers' || information === 'sellers' || information === 'accessibility' || information === 'terms' || information === 'roadmap' ? information : undefined
  const agentMatch = path.match(/^\/agents(?:\/([^/]+))?$/)
  const discoveryPage = path === '/match' ? 'match' : path === '/areas' ? 'areas' : undefined
  const catalogue = path === '/' || /^\/properties\/[^/]+(?:\/tour)?$/.test(path)
  return (
    <ApplicationBoundary>
      <Suspense fallback={
        <main aria-busy="true" aria-label="Loading page" />
      }>
        {manager ? <StaffApp /> : client ? <BuyerApp key={pathname} pathname={pathname} /> : discoveryPage ? <DiscoveryRoute page={discoveryPage} /> : agentMatch ? <AgentRoute slug={agentMatch[1]} /> : informationPage ? <InformationApp key={informationPage} page={informationPage} /> : catalogue ? <PublicApp /> : <div className="site-shell"><SiteHeader pathname={pathname} /><main className="application-status"><p className="eyebrow">404 / OpenHaus</p><h1>Page not found.</h1><p>This address may have changed. Find a home or use the navigation above.</p><div className="application-status-actions"><a href="/#explore">Back to property search</a><a href="/help">Open help</a></div></main></div>}
      </Suspense>
    </ApplicationBoundary>
  )
}
