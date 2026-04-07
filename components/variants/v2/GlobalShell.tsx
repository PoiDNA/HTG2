import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import HeaderLogo from '@/components/HeaderLogo';
import { Link } from '@/i18n-config';
import NavLinksV2 from './NavLinksV2';

/**
 * V2 „Sanctuary" Global Shell
 * Transparent blur header, wider layout, calm nav visible for logged-in users.
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
        <header className="bg-htg-card/30 backdrop-blur-lg border-b border-htg-card-border/50 sticky top-0 z-50 transition-colors duration-300">
          <div className="mx-auto max-w-7xl px-8 py-5 flex items-center justify-between gap-6">
            <Link href="/" className="flex items-center" aria-label="Strona główna HTG">
              <HeaderLogo />
            </Link>
            <div className="flex-1 flex justify-center">
              <NavLinksV2 />
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
