import type { Category, ProductProjection } from '@commercetools/platform-sdk';

export interface DemoCatalog {
  metadata: {
    mode: string;
    productCount: number;
    generatedAt: string;
  };
  categories: Category[];
  products: ProductProjection[];
}

let catalogPromise: Promise<DemoCatalog> | null = null;

export function loadDemoCatalog(): Promise<DemoCatalog> {
  if (!catalogPromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    catalogPromise = fetch(`${baseUrl}demo/catalog.json`).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Demo catalog request failed: ${response.status}`);
        }
        return (await response.json()) as DemoCatalog;
      },
    );
  }

  return catalogPromise;
}

export function clearDemoCatalogCache(): void {
  catalogPromise = null;
}
