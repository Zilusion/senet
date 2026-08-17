import type { Category, ProductProjection } from '@commercetools/platform-sdk';
import type {
  ProductDetailOptions,
  ProductIdentifier,
  productProperties,
} from '@/services/products/productsService';
import { loadDemoCatalog } from './catalog';

function getPrice(product: ProductProjection, currencyCode: string) {
  return product.masterVariant.prices?.find(
    (price) => price.value.currencyCode === currencyCode,
  );
}

function getAttributeNumber(product: ProductProjection, name: string) {
  const value = product.masterVariant.attributes?.find(
    (attribute) => attribute.name === name,
  )?.value;
  return typeof value === 'number' ? value : null;
}

function compareText(left: string, right: string, descending: boolean) {
  return (
    left.localeCompare(right, ['en', 'ru'], { sensitivity: 'base' }) *
    (descending ? -1 : 1)
  );
}

class DemoProductsService {
  async fetchProduct(
    identifier: ProductIdentifier,
    _options: ProductDetailOptions = {},
  ): Promise<ProductProjection | null> {
    void _options;
    const { products } = await loadDemoCatalog();
    const value = identifier.value.toLowerCase();

    return (
      products.find((product) => {
        if (identifier.type === 'id') return product.id === identifier.value;
        if (identifier.type === 'key') return product.key === identifier.value;
        return (
          product.id.toLowerCase() === value ||
          product.key?.toLowerCase() === value ||
          Object.values(product.slug || {}).some(
            (slug) => slug.toLowerCase() === value,
          )
        );
      }) || null
    );
  }

  async fetchCategories(): Promise<Category[]> {
    const { categories } = await loadDemoCatalog();
    return [...categories];
  }

  async fetchProductsPrice(categoryId: string, currencyCode = 'EUR') {
    const { products } = await loadDemoCatalog();
    const prices = products
      .filter(
        (product) =>
          categoryId === '0' ||
          product.categories.some((category) => category.id === categoryId),
      )
      .map((product) => getPrice(product, currencyCode))
      .filter((price) => price !== undefined)
      .map((price) => price.value.centAmount / 100);

    return {
      priceMin: prices.length > 0 ? Math.min(...prices) : 0,
      priceMax: prices.length > 0 ? Math.max(...prices) : 0,
    };
  }

  async fetchProductsPageByCategory(options: productProperties) {
    const { products } = await loadDemoCatalog();
    const language = options.language || 'en';
    const currencyCode = options.currency || 'EUR';
    const searchText = options.searchText?.trim().toLowerCase() || '';

    let filtered = products.filter((product) => {
      if (
        options.categoryId &&
        options.categoryId !== '0' &&
        !product.categories.some(
          (category) => category.id === options.categoryId,
        )
      ) {
        return false;
      }

      const price = getPrice(product, currencyCode);
      if (!price) return false;
      const amount = price.value.centAmount / 100;
      if (amount < options.priceMin || amount > options.priceMax) return false;
      if (options.isDiscounted && !price.discounted) return false;

      if (options.playersCount > 0) {
        const minPlayers = getAttributeNumber(product, 'players-min') || 0;
        const maxPlayers =
          getAttributeNumber(product, 'players-max') ||
          Number.POSITIVE_INFINITY;
        const requestedPlayers = options.playersCount;
        if (
          requestedPlayers < minPlayers ||
          (requestedPlayers < 6 && requestedPlayers > maxPlayers) ||
          (requestedPlayers === 6 && maxPlayers < 6)
        ) {
          return false;
        }
      }

      if (searchText) {
        const searchable = [
          product.name[language],
          product.name.en,
          product.name.ru,
          product.description?.[language],
          product.description?.en,
          product.description?.ru,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(searchText)) return false;
      }

      return true;
    });

    const [sortField = 'createdAt', direction = 'asc'] =
      options.sort?.split(' ') || [];
    const descending = direction === 'desc';
    filtered = [...filtered].sort((left, right) => {
      if (sortField.startsWith('name.')) {
        const sortLanguage = sortField.split('.')[1] || language;
        return compareText(
          left.name[sortLanguage] || left.name.en || '',
          right.name[sortLanguage] || right.name.en || '',
          descending,
        );
      }
      if (sortField === 'price') {
        const leftAmount = getPrice(left, currencyCode)?.value.centAmount || 0;
        const rightAmount =
          getPrice(right, currencyCode)?.value.centAmount || 0;
        return (leftAmount - rightAmount) * (descending ? -1 : 1);
      }
      return compareText(left.createdAt, right.createdAt, descending);
    });

    const results = filtered.slice(
      options.offset,
      options.offset + options.limit,
    );

    return {
      limit: options.limit,
      offset: options.offset,
      count: results.length,
      total: filtered.length,
      results,
      facets: {},
    };
  }
}

export const demoProductsService = new DemoProductsService();
