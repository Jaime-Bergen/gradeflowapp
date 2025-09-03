import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

// Import spark polyfill first to set up global spark object
import './lib/sparkPolyfill'

import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
)
