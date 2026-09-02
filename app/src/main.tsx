import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { bootstrapHouseholdConfig } from './services/householdConfigService.ts'

const root = createRoot(document.getElementById('root')!)
void bootstrapHouseholdConfig().then(async () => {
  const { default: App } = await import('./App.tsx')
  root.render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)
}).catch(() => {
  root.render(<main role="alert" className="startup-error"><h1>eY OS unavailable</h1><p>Household configuration could not be loaded.</p></main>)
})
