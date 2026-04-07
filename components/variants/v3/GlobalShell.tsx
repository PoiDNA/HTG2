import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import HeaderLogo from '@/components/HeaderLogo';
import { Link } from '@/i18n-config';
import NavLinksV3 from './NavLinksV3';
import SlideOverMenu from './SlideOverMenu';

/**
 * V3 „Sanctum" Global Shell
 * Ultra-slim blur header, icon-only nav, hamburger slide-over, narrow max-width.
 */
export default function GlobalShellV3({
  isNagrania,
  children,
}: {
  isNagrania: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {!isNagrania && (
        <header className="bg-htg-card/50 backdrop-blur-md border-b border-htg-card-border/50 sticky top-0 z-50 transition-colors duration-300">
          <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SlideOverMenu />
              <Link href="/" className="flex items-center" aria-label="Strona główna HTG">
                <HeaderLogo />
              </Link>
            </div>
            <nav className="flex-1 flex justify-center">
              <NavLinksV3 />
            </nav>
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
