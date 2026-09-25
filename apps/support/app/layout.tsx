import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'AasPass Support', description: 'AasPass support operations console' };
export default function RootLayout({children}:{children:ReactNode}){ return <html lang="en"><body>{children}</body></html>; }
