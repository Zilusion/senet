import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, ProductProjection } from '@commercetools/platform-sdk';
import { clearDemoCatalogCache, type DemoCatalog } from './catalog';
import { demoProductsService } from './productsService';
import { demoCartService } from './cartService';
import { demoAuthService } from './authService';
import type { categoriesLanguages } from '@/stores/userPreferencesStore';
import type { currency } from '@/services/products/productsService';

const category = {
  id: 'category-party',
  version: 1,
  key: 'party-games',
  name: { en: 'Party Games', ru: 'Вечериночные' },
  slug: { en: 'party-games', ru: 'party-games' },
  ancestors: [],
  orderHint: '0.01',
  createdAt: '2025-05-01T00:00:00.000Z',
  lastModifiedAt: '2025-05-01T00:00:00.000Z',
} as Category;

function product(
  id: string,
  name: string,
  centAmount: number,
  players: number,
): ProductProjection {
  return {
    id,
    version: 1,
    key: id,
    name: { en: name, ru: name },
    slug: { en: name.toLowerCase(), ru: name.toLowerCase() },
    categories: [{ typeId: 'category', id: category.id, obj: category }],
    productType: { typeId: 'product-type', id: 'board-game' },
    masterVariant: {
      id: 1,
      prices: [
        {
          id: `${id}-eur`,
          value: {
            type: 'centPrecision',
            currencyCode: 'EUR',
            centAmount,
            fractionDigits: 2,
          },
        },
      ],
      images: [{ url: `/demo/products/${id}.webp` }],
      attributes: [
        { name: 'players-min', value: players },
        { name: 'players-max', value: players + 2 },
      ],
      assets: [],
    },
    variants: [],
    searchKeywords: {},
    hasStagedChanges: false,
    published: true,
    createdAt: '2025-05-01T00:00:00.000Z',
    lastModifiedAt: '2025-05-01T00:00:00.000Z',
  } as unknown as ProductProjection;
}

const catalog: DemoCatalog = {
  metadata: {
    mode: 'portfolio-demo',
    productCount: 2,
    generatedAt: '2025-05-01T00:00:00.000Z',
  },
  categories: [category],
  products: [
    product('alpha', 'Alpha', 2000, 2),
    product('beta', 'Beta', 1000, 4),
  ],
};

describe('demo services', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDemoCatalogCache();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => catalog,
      }),
    );
  });

  it('filters, searches, sorts and paginates the local catalog', async () => {
    const result = await demoProductsService.fetchProductsPageByCategory({
      limit: 20,
      offset: 0,
      categoryId: category.id,
      sort: 'price asc',
      language: 'en' as categoriesLanguages,
      searchText: 'a',
      priceMin: 0,
      priceMax: 100,
      currency: 'EUR' as currency,
      playersCount: 4,
    });

    expect(result.total).toBe(2);
    expect(result.results.map((item) => item.id)).toEqual(['beta', 'alpha']);
    await expect(
      demoProductsService.fetchProduct({ type: 'slug', value: 'alpha' }),
    ).resolves.toMatchObject({ id: 'alpha' });
  });

  it('persists cart operations and applies FIRST15', async () => {
    const cart = await demoCartService.createCart();
    const withItem = await demoCartService.addLineItemToCart('alpha', 1, 2);
    expect(withItem.lineItems[0]?.quantity).toBe(2);
    expect(withItem.totalPrice.centAmount).toBe(4000);

    const discounted = await demoCartService.applyDiscountCode(
      cart.id,
      withItem.version,
      'FIRST15',
    );
    expect(discounted.totalPrice.centAmount).toBe(3400);
    expect(discounted.discountCodes[0]?.discountCode.obj?.code).toBe('FIRST15');
  });

  it('registers and restores a local demo account', async () => {
    const result = await demoAuthService.register({
      email: 'demo@example.com',
      password: 'Password1!',
      firstName: 'Demo',
      lastName: 'Player',
      dateOfBirth: '1995-05-25',
      shippingAddress: {
        streetName: 'Main Street',
        city: 'Berlin',
        postalCode: '10115',
        country: 'DE',
        isDefaultShipping: true,
        isDefaultBilling: true,
      },
      sameAsShipping: true,
      billingAddress: {
        streetName: 'Main Street',
        city: 'Berlin',
        postalCode: '10115',
        country: 'DE',
      },
    });

    expect(result.customer.email).toBe('demo@example.com');
    await expect(demoAuthService.restoreSession()).resolves.toMatchObject({
      firstName: 'Demo',
    });
  });
});
