import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'FRIENDSLOP — Вечер историй',
  icons: { icon: '/favicon.svg' },
  description:
    'Один год. Много историй. Очень большой экран. Кооперативная игра для своих.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
