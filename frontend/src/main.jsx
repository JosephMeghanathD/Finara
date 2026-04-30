import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#141e35',
            color: '#e8eaf0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontFamily: 'DM Sans, sans-serif',
          },
          success: { iconTheme: { primary: '#e91e8c', secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
