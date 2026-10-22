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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
                // Theme colours (CSS variables), so toasts follow the active color theme
                background: 'rgb(var(--espresso-900))',
                color: 'rgb(var(--cream-100))',
                border: '1px solid rgb(var(--caramel-300) / 0.25)',
                borderRadius: '999px',
                padding: '10px 18px',
                boxShadow: '0 14px 30px -12px rgb(var(--espresso-950) / 0.6)',
              },
              success: {
                iconTheme: { primary: 'rgb(var(--caramel-400))', secondary: 'rgb(var(--espresso-900))' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: 'rgb(var(--cream-100))' },
              },
            }}
          />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
