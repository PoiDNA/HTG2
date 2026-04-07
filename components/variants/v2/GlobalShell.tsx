import SiteNav from '@/components/SiteNav';
import NavLinks from '@/components/NavLinks';
import Footer from '@/components/Footer';
import HeaderLogo from '@/components/HeaderLogo';
import { Link } from '@/i18n-config';

/**
 * V2 Global Shell — wider layout, centered nav, expanded brand area.
 */
export default function GlobalShellV2({
  isNagrania,
  children,
}: {
  isNagrania: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {!isNagrania && (
        <header className="bg-htg-bg border-b-2 border-htg-indigo/30 sticky top-0 z-50 transition-colors duration-300">
          <div className="mx-auto max-w-7xl px-8 py-5 flex items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2" aria-label="Strona główna HTG">
              <HeaderLogo />
            </Link>
            <div className="flex-1 flex justify-center">
              <NavLinks />
            </div>
            <SiteNav />
          </div>
        </header>
      )}

      <main id="main-content" className="flex-grow w-full">
        {children}
      </main>

      {!isNagrania && <Footer />}
    </>
  );
}
