import appLogger from '@utils/logger';
import { type ProductProjection } from '@commercetools/platform-sdk';
import { getAppApiRoot } from '@api/ctpClient';
import { parseError } from '@services/appErrors';
import { useProjectSettingsStore } from '@/stores/projectSettingsStore';
import { isDemoMode } from '@/demo/config';
import { demoProductsService } from '@/demo/productsService';

const settingsStore = useProjectSettingsStore();

export interface ProductDetailOptions {
  expand?: string | string[];
  staged?: boolean;
}

export interface ProductIdentifier {
  type: 'id' | 'key' | 'slug';
  value: string;
}

import { categoriesLanguages } from '@/stores/userPreferencesStore';
import { isNotFoundError } from '@/utils/isNotFoundError';

export interface productProperties {
  limit: number;
  offset: number;
  categoryId?: string;
  sort?: string;
  language?: categoriesLanguages;
  searchText?: string;
  priceMin: number;
  priceMax: number;
  isDiscounted?: boolean;
  currency: currency;
  playersCount: number;
}

export enum currency {
  'en' = 'EUR',
  'ru' = 'RUB',
  'usd' = 'USD',
}

class ProductsService {
  private get apiRoot() {
    return getAppApiRoot();
  }

  async fetchProduct(
    identifier: ProductIdentifier,
    options: ProductDetailOptions = {},
  ): Promise<ProductProjection | null> {
    if (isDemoMode) {
      return demoProductsService.fetchProduct(identifier, options);
    }
    appLogger.log(
      `ProductsService: Fetching product by ${identifier.type}: ${identifier.value}`,
    );
    const { expand = [], staged = false } = options;
    const defaultExpandList = [
      'masterVariant.prices[*].discounted',
      'variants[*].prices[*].discounted',
    ];
    const finalExpand = Array.isArray(expand)
      ? [...new Set([...defaultExpandList, ...expand])]
      : [...new Set([...defaultExpandList, expand])];

    try {
      let requestBuilder;

      if (identifier.type === 'id') {
        requestBuilder = this.apiRoot
          .productProjections()
          .withId({ ID: identifier.value });
      } else if (identifier.type === 'key') {
        requestBuilder = this.apiRoot
          .productProjections()
          .withKey({ key: identifier.value });
      } else if (identifier.type === 'slug') {
        const locales = settingsStore.getAvailableLanguages;
        for (const locale of locales) {
          const queryArgs = {
            where: `slug(${locale}="${identifier.value}")`,
            limit: 1,
            staged,
            expand: finalExpand.length > 0 ? finalExpand : undefined,
          };
          const response = await this.apiRoot
            .productProjections()
            .get({ queryArgs })
            .execute();
          if (response.body.results.length > 0) {
            appLogger.log(
              `ProductsService: Product (Slug: ${identifier.value}) fetched successfully in locale ${locale}.`,
            );
            return response.body.results[0];
          }
        }
        appLogger.warn(
          `ProductsService: Product with Slug ${identifier.value} not found in any locale.`,
        );
        return null;
      } else {
        throw new Error('Invalid product identifier type');
      }

      const response = await requestBuilder
        .get({
          queryArgs: {
            staged,
            expand: finalExpand.length > 0 ? finalExpand : undefined,
          },
        })
        .execute();
      appLogger.log(
        `ProductsService: Product (${identifier.type}: ${identifier.value}) fetched successfully.`,
      );
      return response.body;
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        appLogger.warn(
          `ProductsService: Product with identifier ${identifier.value} not found.`,
        );
        return null;
      }
      appLogger.error(
        `ProductsService: Error fetching product by identifier ${identifier.value}:`,
        error,
      );
      throw parseError(error);
    }
  }

  async fetchCategories() {
    if (isDemoMode) {
      return demoProductsService.fetchCategories();
    }
    appLogger.log('App.vue: Fetching products...');
    try {
      const response = await this.apiRoot
        .categories()
        .get({
          queryArgs: {
            limit: 100,
            sort: 'name.ru asc',
          },
        })
        .execute();
      const results = response.body.results;
      return results;
    } catch (error) {
      appLogger.error('App.vue: Error fetching categories:', error);
      const parsed = parseError(error);
      throw new Error(parsed.message);
      // errorMessage.value = parsed.message;
    }
  }

  async fetchProductsPrice(categoryId: string, price: string = 'EUR') {
    if (isDemoMode) {
      return demoProductsService.fetchProductsPrice(categoryId, price);
    }
    try {
      const filters = [];
      if (categoryId !== '0') {
        filters.push(`categories.id:"${categoryId}"`);
      }

      const response = await this.apiRoot
        .productProjections()
        .search()
        .get({
          queryArgs: {
            filter: filters,
            facet: ['variants.price.centAmount'],
            limit: 500,
            staged: false,
            priceCurrency: 'EUR',
          },
        })
        .execute();

      const prices = response.body.results.reduce(
        (acc, elem) => {
          if (elem.masterVariant.prices) {
            const priceObj = elem.masterVariant.prices;
            const centAmount = priceObj.filter(
              (el) => el.value.currencyCode === price,
            )[0].value.centAmount;
            acc.push(centAmount / 100);
          }

          return acc;
        },
        <number[]>[],
      );

      return {
        priceMin: Math.min(...prices),
        priceMax: Math.max(...prices),
      };
    } catch (error: unknown) {
      appLogger.error('App.vue: Error fetching products:', error);
      const parsed = parseError(error);
      throw new Error(parsed.message);
    }
  }

  async fetchProductsPageByCategory(product: productProperties) {
    if (isDemoMode) {
      return demoProductsService.fetchProductsPageByCategory(product);
    }
    appLogger.log('App.vue: Fetching products...');
    try {
      const filters = [
        `variants.prices.value.currencyCode: "EUR"`,
        `variants.prices.value.centAmount:range(${product.priceMin * 100} to ${product.priceMax * 100})`,
      ];
      if (product.categoryId !== '0') {
        filters.push(`categories.id:"${product.categoryId}"`);
      }
      if (product.isDiscounted) {
        filters.push('variants.prices.discounted.value.centAmount:exists');
      }
      if (product.playersCount > 0) {
        filters.push(
          `variants.attributes.players-min:range(0 to ${product.playersCount})`,
        );
      }
      const args = {
        filter: filters,
        limit: product.limit,
        staged: false,
        offset: product.offset,
        sort: product.sort,
        [`text.${product.language}`]: product.searchText,
        fuzzy: true,
      };
      const response = await this.apiRoot
        .productProjections()
        .search()
        .get({
          queryArgs: args,
        })
        .execute();
      const result = response.body;
      appLogger.log('App.vue: Products fetched:', result);
      return result;
    } catch (error: unknown) {
      appLogger.error('App.vue: Error fetching products:', error);
      const parsed = parseError(error);
      throw new Error(parsed.message);
      // errorMessage.value = parsed.message;
    }
  }
}
export { ProductsService };
export default new ProductsService();
