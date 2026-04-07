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
    <>
      {!isNagrania && (
        <header className="bg-htg-card border-b border-htg-card-border sticky top-0 z-50 transition-colors duration-300">
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

      <main id="main-content" className="flex-grow w-full">
        {children}
      </main>

      {!isNagrania && <Footer />}
    </>
  );
}
