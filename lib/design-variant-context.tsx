'use client';

import { createContext, useContext } from 'react';
import type { DesignVariant } from './design-variant';

const DesignVariantContext = createContext<DesignVariant>('v1');

export function DesignVariantProvider({
  variant,
  children,
}: {
  variant: DesignVariant;
  children: React.ReactNode;
}) {
  return (
    <DesignVariantContext.Provider value={variant}>
      {children}
    </DesignVariantContext.Provider>
  );
}

export function useDesignVariant(): DesignVariant {
  return useContext(DesignVariantContext);
}
