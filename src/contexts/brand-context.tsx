"use client";

import { createContext, useContext } from "react";
import { BRANDS, DEFAULT_BRAND, type Brand } from "@/lib/brand";

const BrandContext = createContext<Brand>(BRANDS[DEFAULT_BRAND]);

export function BrandProvider({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
