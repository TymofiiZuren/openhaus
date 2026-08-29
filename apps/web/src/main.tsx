import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ManagerApp } from './ManagerApp.tsx'

const application = window.location.pathname.startsWith('/manager') ? <ManagerApp /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {application}
  </StrictMode>,
)
