import SiteNav from '@/components/SiteNav';
import NavLinks from '@/components/NavLinks';
import Footer from '@/components/Footer';
import HeaderLogo from '@/components/HeaderLogo';
import { Link } from '@/i18n-config';

export default function GlobalShellV1({
  isNagrania,
  children,
}: {
  isNagrania: boolean;
  children: React.ReactNode;
}) {
  return (
    // z-[1] tworzy stacking context na poziomie 1 w root SC.
    // Canvas BG jest na z:0 — treść na z:1 jest nad nim definitywnie.
    <div className="relative z-[1] flex flex-col flex-1">
      {!isNagrania && (
        <header data-sand-edge="header" className="bg-htg-card border-b border-htg-card-border sticky top-0 z-50 transition-colors duration-300">
          <div className="mx-auto max-w-6xl px-6 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-4 relative">
            <Link href="/" className="flex items-center" aria-label="Strona główna HTG">
              <HeaderLogo />
            </Link>
            <NavLinks />
            <div className="col-start-3 flex justify-end">
              <SiteNav />
            </div>
          </div>
        </header>
      )}

      <main id="main-content" data-sand-edge="main" className="flex-grow w-full">
        {children}
      </main>

      {!isNagrania && <Footer />}
    </div>
  );
}
