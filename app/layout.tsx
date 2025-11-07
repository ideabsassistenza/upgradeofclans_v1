import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Upgrade of Clans',
  description: 'Piano di upgrade per Clash of Clans (TH10→TH17)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', margin: 0, background: '#0a0a0a', color: '#e5e5e5' }}>
        {children}
      </body>
    </html>
  );
}
