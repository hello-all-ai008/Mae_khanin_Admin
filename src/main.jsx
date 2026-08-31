import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import { RaceProvider } from './context/RaceContext.jsx'
import { HashRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <RaceProvider>
          <App />
        </RaceProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
