import http from "@/api/http";

export const PRODUCT_CODE = import.meta.env.VITE_PRODUCT_CODE || "iqc";

export interface ProductProfile {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description?: string;
  logoUrl?: string;
  collapsedLogoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  homePath: string;
  enabled: boolean;
}

export async function getProductProfile() {
  const { data } = await http.get<ProductProfile>(`/org/products/${PRODUCT_CODE}/profile`);
  return data;
}

export function applyProductBrand(product: ProductProfile) {
  document.title = product.name;
  if (product.primaryColor) document.documentElement.style.setProperty("--iqc-primary-color", product.primaryColor);
  if (product.faviconUrl) {
    let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = product.faviconUrl;
  }
}
