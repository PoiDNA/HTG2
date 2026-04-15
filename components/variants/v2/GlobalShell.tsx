import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import HeaderLogo from '@/components/HeaderLogo';
import ScrollHeader from '@/components/ScrollHeader';
import { Link } from '@/i18n-config';
import NavLinks from '@/components/NavLinks';

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
        <ScrollHeader bgClassName="bg-htg-card/60 backdrop-blur-lg border-b border-htg-card-border/50">
          <div className="mx-auto max-w-7xl px-8 py-5 flex items-center justify-between gap-6">
            <div className="transition-opacity duration-500 group-data-[scroll-state=visible]:opacity-0 group-data-[scroll-state=visible]:pointer-events-none">
              <Link href="/" className="flex items-center" aria-label="Strona główna HTG">
                <HeaderLogo />
              </Link>
            </div>
            <div className="flex-1 flex justify-center transition-opacity duration-500 group-data-[scroll-state=visible]:opacity-0 group-data-[scroll-state=visible]:pointer-events-none">
              <NavLinks />
            </div>
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
