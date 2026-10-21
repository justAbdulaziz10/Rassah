import catalog from "@/data/products.json";

export interface StoreProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  priceSar: number;
}

export const PRODUCTS: StoreProduct[] = catalog.products;
export const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

export const CATEGORY_LABEL: Record<string, string> = {
  perfume: "عطور",
  books: "كتب",
  incense: "بخور ومباخر",
  electronics: "إلكترونيات",
  candles: "شموع",
  "phone-accessories": "إكسسوارات جوال",
  honey: "عسل",
  kitchen: "مطبخ",
  food: "أغذية",
  stationery: "قرطاسية",
  dates: "تمور",
  skincare: "عناية",
  appliances: "أجهزة",
  coffee: "قهوة",
  gifts: "هدايا",
  general: "منوعات",
};

/** Rassah packs at most 12 units per order, so the store enforces the same cap at checkout. */
export const MAX_UNITS = 12;
export const MAX_QTY_PER_LINE = 3;
