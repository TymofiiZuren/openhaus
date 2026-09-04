import { ThemeControl } from './ThemeControl'
import { HeaderAccountLinks } from './HeaderAccountLinks'
import './App.css'
import './SiteHeader.css'

const links = [['Find homes', '/#explore'], ['About', '/about'], ['Contact', '/contact'], ['Help', '/help'], ['Privacy', '/privacy']] as const

export function SiteHeader({ pathname = window.location.pathname }: { pathname?: string }) {
  const current = pathname.replace(/\/$/, '') || '/'
  return <header className="public-header">
    <a className="public-header-brand" href="/" aria-label="OpenHaus home">OpenHaus<span aria-hidden="true">.</span></a>
    <nav className="public-header-navigation" aria-label="Primary navigation">
      {links.map(([label, href]) => <a key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</a>)}
    </nav>
    <div className="public-header-actions"><ThemeControl /><HeaderAccountLinks /></div>
  </header>
}
