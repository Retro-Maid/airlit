import React from 'react'
import ReactDOM from 'react-dom/client'
import { Boot } from './Boot'
import { ErrorBoundary } from './ui/a11y'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Boot />
    </ErrorBoundary>
  </React.StrictMode>,
)
