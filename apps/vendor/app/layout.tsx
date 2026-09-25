import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'AasPass Vendor',
  description: 'AasPass merchant workspace',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
