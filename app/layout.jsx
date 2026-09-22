import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import SiteHeader from '@/components/SiteHeader';
import TabBar from '@/components/TabBar';
import BookingSiteFooter from '@/components/BookingSiteFooter';

export const metadata = {
  title: {
    default: 'Easy Hotel Booking — stays across every state, district and village in India',
    template: '%s · Easy Hotel Booking',
  },
  description:
    'Book hotels, homestays, resorts and guest houses anywhere in India — from state capitals and district towns down to villages at the end of the road. Photos, guest reviews and direct UPI payment.',
  applicationName: 'Easy Hotel Booking',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg', apple: '/icons/icon-192.png' },
  openGraph: {
    title: 'Easy Hotel Booking',
    description: 'Stays across every state, district and village in India.',
    type: 'website',
  },
};

export const viewport = {
  themeColor: '#0f5132',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <AuthProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main className="flex-1 pb-24 md:pb-10">{children}</main>
            <BookingSiteFooter />
            <TabBar />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
