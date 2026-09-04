import { useEffect, useState } from 'react'
import { SiteHeader } from './SiteHeader'
import './App.css'
import './InformationPages.css'

const pages = {
  about: { title: 'A fuller picture of home.', label: 'About', intro: 'Explore the place, understand the space, and keep your decisions together.' },
  contact: { title: 'Start a conversation.', label: 'Contact', intro: 'Find the right route for listing help, property questions or privacy enquiries.' },
  help: { title: 'A little clarity.', label: 'Help', intro: 'Straightforward answers about maps, media and your buyer workspace.' },
  privacy: { title: 'Your information, explained.', label: 'Privacy', intro: 'What this demonstration stores, what external services receive, and what still needs to be completed.' },
} as const
type Page = keyof typeof pages
const answers = [
  ['How do I open a 360° tour?', 'On a home with a panorama, choose Open full-window 360° tour. The external viewer loads after you choose Enter 360° tour. A tour may show an illustrative example rather than the listed home; check its labels.'],
  ['Can I sign in as a buyer?', 'Sign-in is optional. When development accounts are enabled, a sign-in prompt appears alongside property notes. Comparisons and notes work without an account and stay in this browser. Email verification and password recovery are not available yet. Manager sign-in is for listing staff only.'],
  ['How do I choose a local area?', 'Choose a county on the map or in Choose location. The county dropdown closes and local areas open. Use the Ireland control to return to the national view.'],
  ['Does a viewing request book an appointment?', 'No. The current viewing form is a demonstration with sample times. It does not send your details to a listing team or reserve an appointment.'],
  ['How do I remove saved notes and comparisons?', 'Use the browser-data controls on the Privacy page. They remove your OpenHaus notes and comparison list from this browser only.'],
  ['Are concept images actual property photographs?', 'No. Architectural concept illustrations are labelled examples. Listing managers can replace them by uploading property photography.'],
]

export function InformationPages({ page }: { page: Page }) {
  const content = pages[page]
  const [query, setQuery] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const previous = document.title
    document.title = `${content.label} — OpenHaus`
    return () => { document.title = previous }
  }, [content.label])

  function clearBuyerData() {
    if (!confirmed) return
    setMessage(''); setError('')
    try {
      const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      for (const key of keys) {
        if (key && (key === 'openhaus:comparison:v1' || key.startsWith('openhaus:property-notes:'))) localStorage.removeItem(key)
      }
      setConfirmed(false)
      setMessage('Cleared notes and comparisons in this browser. Refresh other open OpenHaus tabs before using them; unsaved edits there may restore data. Server records and third-party data were not deleted.')
    } catch { setError('Browser storage could not be fully cleared. Use your browser’s site-data settings to finish removing it.') }
  }
  const matching = answers.filter(answer => answer.join(' ').toLowerCase().includes(query.trim().toLowerCase()))

  return <div className="site-shell information-shell">
    <a className="skip-link" href="#information-content">Skip to content</a>
    <SiteHeader pathname={`/${page}`} />
    <main id="information-content" className="information-main">
      <header className="information-intro"><p className="eyebrow">OpenHaus / {content.label}</p><h1>{content.title}</h1><p>{content.intro}</p></header>
      <div className="information-layout"><nav className="information-nav" aria-label="Information pages">{Object.entries(pages).map(([key, item]) => <a key={key} href={`/${key}`} aria-current={key === page ? 'page' : undefined}>{item.label}</a>)}</nav>
        <div className="information-body">
          {page === 'privacy' && <section><h2>Development client accounts</h2><p>When enabled, registration stores your email and a password hash in the application database. Account-saved homes are server records linked to that account. Sign-in uses an HttpOnly session cookie with a 24-hour expiry and signing out revokes that session. Account deletion, email verification, recovery and retention cleanup are not available yet; do not use this development feature for real customer data. Clearing browser notes does not delete an account or its saved homes.</p></section>}
          {page === 'about' && <><section><h2>More than a listing photograph.</h2><p>OpenHaus brings location, photography, floor plans and hosted 360° tours into one property workspace. Browse across Ireland, compare homes and keep private notes as you explore.</p></section><section><h2>Built with a clear distinction.</h2><p>This is an independent demonstration project. Concept illustrations, sample tours, indicative insights and sample viewing times are not verified property information or live booking services.</p><a href="/#explore">Explore the catalogue</a></section><section><h2>For the people behind a listing.</h2><p>The manager workspace supports property details, photography, floor plans, hosted tours and publication previews.</p><a href="/manager/login">Open the manager workspace</a></section></>}
          {page === 'contact' && <><section><h2>Property questions</h2><p>Open the property page to review its media, location and details. Viewing requests are currently demonstrations, not delivered enquiries.</p><a href="/#homes">Find a property</a></section><section><h2>Website and privacy enquiries</h2><p>Contact details are not configured for this demonstration. A verified operator name and public email must be added before enquiries or privacy requests can be accepted here.</p><p>Please do not submit identity documents or sensitive personal information through sample forms.</p></section><section><h2>Need help using OpenHaus?</h2><a href="/help">Browse questions and answers</a></section></>}
          {page === 'help' && <section><h2>How can we help?</h2><label className="information-search">Search help<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try panorama, notes or county" /></label><div className="information-answers">{matching.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>{matching.length === 0 && <p role="status">No matching answers. Try a different word or visit <a href="/contact">Contact</a>.</p>}</section>}
          {page === 'privacy' && <><aside className="information-notice"><strong>Draft privacy information — not a completed policy</strong><p>The operator’s legal identity, contact details, lawful bases, retention schedule and provider arrangements still need confirmation before public launch.</p></aside><section><h2>Browser-saved information</h2><p>OpenHaus saves your appearance preference, comparison list and property notes in local storage. They remain in this browser until removed; they are separate from a client account. Anyone using the same browser profile may be able to access them.</p></section><section><h2>Accounts, saved homes and listings</h2><p>Client accounts, account-saved homes, manager accounts and listing records are stored by the application backend. Authentication uses revocable session cookies. Sample viewing and saved-search forms do not send enquiries or create live subscriptions.</p></section><section><h2>Maps, tours and external services</h2><p>When configured, Google Maps loads with the property explorer. Hosted panorama content loads after you choose to enter its viewer. External services receive connection information when loaded; their storage, processing locations and terms need assessment before launch.</p><p>Review <a href="https://policies.google.com/privacy">Google’s privacy notice</a> and <a href="https://kuula.co/page/privacy">Kuula’s privacy notice</a>.</p></section><section><h2>Your privacy rights</h2><p>Depending on the circumstances, you may have rights to access, correct, erase or restrict processing of personal data, object to processing, and receive portable data. Where processing relies on consent, you may withdraw it. A verified operator contact is needed to support these requests.</p><p>Read about your rights and complaints with the <a href="https://www.dataprotection.ie/en/individuals/know-your-rights">Irish Data Protection Commission</a>.</p></section><section><h2>Clear this browser’s buyer data</h2><p>This removes browser notes and comparisons only. It does not delete an account, account-saved homes, manager records, session cookies, other websites’ data or copies on other devices. Close other OpenHaus tabs first.</p><label className="information-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I understand that these saved notes and comparisons cannot be recovered.</label><button type="button" disabled={!confirmed} onClick={clearBuyerData}>Clear saved buyer data</button>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section></>}
        </div>
      </div>
    </main><footer className="information-footer"><a href="/">OpenHaus</a><p>Find home with the full picture.</p><a href="/privacy">Privacy information</a></footer>
  </div>
}
