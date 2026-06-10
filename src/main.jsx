import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VirusProvider } from './context/VirusContext'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <VirusProvider>
        <App />
      </VirusProvider>
    </ErrorBoundary>
  </StrictMode>,
)
