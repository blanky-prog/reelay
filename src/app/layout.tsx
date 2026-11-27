import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reelay',
  description: 'Verified Instagram clipping campaigns: Crew App, Control Room and Reelay Live.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
