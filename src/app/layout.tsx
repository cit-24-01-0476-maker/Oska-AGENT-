import type {Metadata} from 'next';
import Script from 'next/script';
import {extensionCompatibilityScript} from '@/lib/extension-compat';
import './globals.css';
import './connection-setup.css';
import './cloud.css';
export const metadata:Metadata={title:'OSKA AGENT — Think. Plan. Execute.',description:'Your intelligent autonomous workspace. Local first, built around you.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning><Script id="oska-extension-compat" strategy="beforeInteractive">{extensionCompatibilityScript}</Script>{children}</body></html>;}
