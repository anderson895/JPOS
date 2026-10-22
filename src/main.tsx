import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                background: '#2c1a0f',
                color: '#fdf7ee',
                border: '1px solid rgba(233, 187, 126, 0.25)',
                borderRadius: '999px',
                padding: '10px 18px',
                boxShadow: '0 14px 30px -12px rgba(28, 16, 9, 0.6)',
              },
              success: {
                iconTheme: { primary: '#e2a866', secondary: '#2c1a0f' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#fdf7ee' },
              },
            }}
          />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
