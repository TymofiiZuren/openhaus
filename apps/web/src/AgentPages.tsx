import { useEffect } from 'react'
import { SiteHeader } from './SiteHeader'
import { getSellingAgent, sellingAgents, type SellingAgent } from './sellingAgents'
import './AgentPages.css'

function AgentCard({ agent }: { agent: SellingAgent }) {
  return <article className="agent-directory-card">
    <div className="agent-monogram" aria-hidden="true">{agent.initials}</div>
    <div className="agent-card-copy"><p className="agent-status"><i aria-hidden="true" />Demonstration profile</p><h2>{agent.name}</h2><p>{agent.role} · {agent.agency}</p></div>
    <dl><div><dt>Coverage</dt><dd>{agent.serviceAreas.length} counties</dd></div><div><dt>Focus</dt><dd>{agent.specialisms[0]}</dd></div></dl>
    <a href={`/agents/${agent.slug}`} aria-label={`View ${agent.name}’s profile`}>View profile <span aria-hidden="true">→</span></a>
  </article>
}

export function AgentPages({ slug }: { slug?: string }) {
  const agent = slug ? getSellingAgent(slug) : undefined
  useEffect(() => {
    const previous = document.title
    document.title = agent ? `${agent.name} — OpenHaus` : slug ? 'Agent not found — OpenHaus' : 'Selling agents — OpenHaus'
    return () => { document.title = previous }
  }, [agent, slug])

  if (slug && !agent) return <div className="site-shell"><SiteHeader pathname={`/agents/${slug}`} /><main className="agent-not-found"><p className="eyebrow">OpenHaus / Agents</p><h1>Agent profile not found.</h1><p>This profile may have moved or is not available.</p><a href="/agents">View the agent directory</a></main></div>

  return <div className="site-shell agent-shell">
    <a className="skip-link" href="#agent-content">Skip to agent information</a>
    <SiteHeader pathname={slug ? `/agents/${slug}` : '/agents'} />
    <main id="agent-content" className="agent-main">
      {!agent ? <>
        <header className="agent-hero"><p className="eyebrow">OpenHaus / Selling agents</p><h1>Meet the listing team.</h1><p>See who represents each demonstration property, their coverage and the information still awaiting verification.</p><a href="/sellers">How OpenHaus presents a home <span aria-hidden="true">→</span></a></header>
        <aside className="agent-disclosure"><strong>Demonstration directory</strong><p>These are sample product profiles, not verified estate-agent identities. No contact details or licence numbers are published until an operator verifies them.</p></aside>
        <section className="agent-directory" aria-label="Selling agent directory">{sellingAgents.map(item => <AgentCard key={item.slug} agent={item} />)}</section>
      </> : <>
        <nav className="agent-breadcrumb" aria-label="Breadcrumb"><a href="/agents">Selling agents</a><span aria-hidden="true">/</span><span>{agent.name}</span></nav>
        <article className="agent-profile">
          <header><div className="agent-monogram agent-monogram-large" aria-hidden="true">{agent.initials}</div><div><p className="agent-status"><i aria-hidden="true" />Demonstration profile</p><h1>{agent.name}</h1><p>{agent.role} · {agent.agency}</p></div></header>
          <div className="agent-profile-grid"><section><p className="eyebrow">Profile</p><h2>Property context before contact.</h2><p>{agent.summary}</p><p>Verified email, phone and regulatory licence details have not been supplied for this demonstration, so OpenHaus does not display or infer them.</p><a className="agent-primary-link" href="/contact">Ask about this listing team <span aria-hidden="true">→</span></a></section><aside><h2>Coverage</h2><div className="agent-area-links">{agent.serviceAreas.map(area => <a key={area} href={`/?county=${encodeURIComponent(area)}#homes`}>{area}</a>)}</div><h2>Specialisms</h2><ul>{agent.specialisms.map(item => <li key={item}>{item}</li>)}</ul></aside></div>
        </article>
      </>}
    </main>
  </div>
}
