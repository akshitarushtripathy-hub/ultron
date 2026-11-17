import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ULTRON',
  description: 'A fiery holographic AI with gesture control, voice and Android device control via Hermes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
