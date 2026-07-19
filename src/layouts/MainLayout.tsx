// SPDX-License-Identifier: AGPL-3.0-or-later
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';
import { AuthModal } from '@/components/auth/AuthModal';

export function MainLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <Navbar />
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <AuthModal />
    </div>
  );
}
