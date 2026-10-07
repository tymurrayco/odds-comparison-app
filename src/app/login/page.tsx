// src/app/login/page.tsx — admin login (sets the oddsday_admin cookie)
import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Admin login | odds.day',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-blue-50">
      <div className="mx-auto flex max-w-sm flex-col px-4 pt-16 sm:pt-24">
        <h1 className="text-[26px] font-bold tracking-[-0.8px]">
          <span className="text-blue-600">odds</span>
          <span className="text-gray-900">.day</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">Admin login. One time per device.</p>
        <div className="mt-5 rounded-lg bg-white p-4 shadow-sm">
          {/* useSearchParams (for ?next=) needs a Suspense boundary at build time */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
