import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { RaceProvider } from './context/RaceContext.jsx'
import { HashRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <RaceProvider>
        <App />
      </RaceProvider>
    </HashRouter>
  </React.StrictMode>,
)
