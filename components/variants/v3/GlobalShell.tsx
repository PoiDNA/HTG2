import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import HeaderLogo from '@/components/HeaderLogo';
import ScrollHeader from '@/components/ScrollHeader';
import { Link } from '@/i18n-config';
import NavLinks from '@/components/NavLinks';
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
        <ScrollHeader bgClassName="bg-htg-card backdrop-blur-md border-b border-htg-card-border/50">
          <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SlideOverMenu />
              <Link href="/" className="flex items-center" aria-label="Strona główna HTG">
                <HeaderLogo />
              </Link>
            </div>
            <nav className="flex-1 flex justify-center">
              <NavLinks />
            </nav>
            <SiteNav />
          </div>
        </ScrollHeader>
      )}

      <main id="main-content" className="flex-grow w-full">
        {children}
      </main>

      {!isNagrania && <Footer />}
    </>
  );
}
