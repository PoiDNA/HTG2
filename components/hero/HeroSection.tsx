'use client';

import { useState, useEffect, Component, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import HeroStatic from './HeroStatic';

// Lazy-load the animated hero (code-split)
const HeroAnimated = dynamic(() => import('./HeroAnimated'), {
  ssr: false,
  loading: () => <HeroStatic />,
});

// ─── ErrorBoundary ───
class HeroErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Hero section entry point.
 * - <noscript> shows HeroStatic for no-JS crawlers
 * - Save-Data / slow connection → HeroStatic
 * - prefers-reduced-motion → HeroStatic
 * - Windows High Contrast → HeroStatic (via CSS)
 * - ErrorBoundary → HeroStatic
 */
export default function HeroSection() {
  const [forceStatic, setForceStatic] = useState(false);

  useEffect(() => {
    // Save-Data / slow connection check
    const conn = (navigator as any).connection;
    if (
      conn?.saveData ||
      conn?.effectiveType === '2g' ||
      conn?.effectiveType === '3g'
    ) {
      setForceStatic(true);
      return;
    }
    // Reduced motion check
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setForceStatic(true);
    }
  }, []);

  return (
    <>
      {/* No-JS fallback */}
      <noscript>
        <HeroStatic />
      </noscript>

      {/* JS version */}
      <div className="js-only-hero forced-colors:hidden">
        {forceStatic ? (
          <HeroStatic />
        ) : (
          <HeroErrorBoundary fallback={<HeroStatic />}>
            <HeroAnimated />
          </HeroErrorBoundary>
        )}
      </div>

      {/* Windows High Contrast: show static */}
      <style jsx global>{`
        @media (forced-colors: active) {
          .js-only-hero { display: none !important; }
        }
        @media (forced-colors: active) {
          noscript { display: block !important; }
        }
      `}</style>
    </>
  );
}
