import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { DatabaseConnectionsProvider } from './context/DatabaseConnectionsContext'
import { ThemeProvider } from './context/ThemeContext'
import { CurrencyProvider } from '@graphcore/shared'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename === '/' ? undefined : basename}>
      <ThemeProvider>
        <CurrencyProvider>
          <AuthProvider>
            <DatabaseConnectionsProvider>
              <App />
            </DatabaseConnectionsProvider>
          </AuthProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
