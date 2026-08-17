import type {
  Cart,
  DiscountCodeReference,
  LineItem,
  MyCartUpdateAction,
  ProductProjection,
} from '@commercetools/platform-sdk';
import { loadDemoCatalog } from './catalog';

const storageKey = 'senet-demo-cart-v1';
const promoCode = 'FIRST15';

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableLineItem = Mutable<LineItem>;
type MutableCart = Omit<Mutable<Cart>, 'lineItems' | 'discountCodes'> & {
  lineItems: MutableLineItem[];
  discountCodes: Array<Cart['discountCodes'][number]>;
};

function createId(prefix: string) {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function money(centAmount: number) {
  return {
    type: 'centPrecision' as const,
    currencyCode: 'EUR',
    centAmount,
    fractionDigits: 2,
  };
}

function getStoredCart(): MutableCart | null {
  const serialized = localStorage.getItem(storageKey);
  if (!serialized) return null;

  try {
    return JSON.parse(serialized) as MutableCart;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

function saveCart(cart: MutableCart): Cart {
  localStorage.setItem(storageKey, JSON.stringify(cart));
  return cart as unknown as Cart;
}

function hasPromo(cart: MutableCart) {
  return cart.discountCodes.some(
    (entry) => entry.discountCode.obj?.code === promoCode,
  );
}

function recalculate(cart: MutableCart): Cart {
  const promoApplied = hasPromo(cart);
  let totalCentAmount = 0;

  for (const lineItem of cart.lineItems) {
    const productUnitAmount =
      lineItem.price.discounted?.value.centAmount ||
      lineItem.price.value.centAmount;
    const unitAmount = promoApplied
      ? Math.round(productUnitAmount * 0.85)
      : productUnitAmount;
    const lineAmount = unitAmount * lineItem.quantity;

    lineItem.totalPrice = money(lineAmount);
    lineItem.discountedPricePerQuantity = promoApplied
      ? [
          {
            quantity: lineItem.quantity,
            discountedPrice: {
              value: money(unitAmount),
              includedDiscounts: [],
            },
          },
        ]
      : [];
    totalCentAmount += lineAmount;
  }

  const now = new Date().toISOString();
  cart.totalPrice = money(totalCentAmount);
  cart.totalLineItemQuantity = cart.lineItems.reduce(
    (sum, lineItem) => sum + lineItem.quantity,
    0,
  );
  cart.version += 1;
  cart.lastModifiedAt = now;
  return saveCart(cart);
}

function createCart(): MutableCart {
  const now = new Date().toISOString();
  return {
    id: createId('demo-cart'),
    version: 1,
    createdAt: now,
    lastModifiedAt: now,
    lineItems: [],
    customLineItems: [],
    totalPrice: money(0),
    taxedPricePortions: [],
    country: 'DE',
    cartState: 'Active',
    shippingMode: 'Single',
    shipping: [],
    shippingInfo: undefined,
    shippingRateInput: undefined,
    shippingCustomFields: undefined,
    discountCodes: [],
    directDiscounts: [],
    inventoryMode: 'None',
    taxMode: 'Platform',
    taxRoundingMode: 'HalfEven',
    taxCalculationMode: 'LineItemLevel',
    origin: 'Customer',
    itemShippingAddresses: [],
    refusedGifts: [],
    store: undefined,
    totalLineItemQuantity: 0,
    deleteDaysAfterLastModification: 30,
  } as unknown as MutableCart;
}

function createLineItem(
  product: ProductProjection,
  quantity: number,
): MutableLineItem {
  const price = product.masterVariant.prices?.find(
    (entry) => entry.value.currencyCode === 'EUR',
  );
  if (!price) throw new Error('The selected product has no EUR price');

  const unitAmount =
    price.discounted?.value.centAmount || price.value.centAmount;
  const now = new Date().toISOString();
  return {
    id: createId('demo-line'),
    productId: product.id,
    productKey: product.key,
    name: product.name,
    productType: product.productType,
    productSlug: product.slug,
    variant: product.masterVariant,
    price,
    quantity,
    totalPrice: money(unitAmount * quantity),
    discountedPricePerQuantity: [],
    state: [],
    perMethodTaxRate: [],
    priceMode: 'Platform',
    lineItemMode: 'Standard',
    addedAt: now,
    lastModifiedAt: now,
  } as unknown as MutableLineItem;
}

class DemoCartService {
  async getActiveCart(): Promise<Cart | null> {
    return (getStoredCart() as unknown as Cart) || null;
  }

  async createCart(): Promise<Cart> {
    return saveCart(createCart());
  }

  async deleteCart(_cart: Cart): Promise<void> {
    void _cart;
    localStorage.removeItem(storageKey);
  }

  async updateCart(
    cartId: string,
    _version: number,
    actions: MyCartUpdateAction[],
  ): Promise<Cart> {
    const cart = getStoredCart();
    if (!cart || cart.id !== cartId) throw new Error('Demo cart not found');
    const { products } = await loadDemoCatalog();

    for (const action of actions) {
      if (action.action === 'addLineItem') {
        const product = products.find((item) => item.id === action.productId);
        if (!product) throw new Error('Product not found');
        const existing = cart.lineItems.find(
          (item) =>
            item.productId === action.productId &&
            item.variant.id === (action.variantId || 1),
        );
        if (existing) existing.quantity += action.quantity || 1;
        else cart.lineItems.push(createLineItem(product, action.quantity || 1));
      } else if (action.action === 'removeLineItem') {
        cart.lineItems = cart.lineItems.filter(
          (item) => item.id !== action.lineItemId,
        );
      } else if (action.action === 'changeLineItemQuantity') {
        const lineItem = cart.lineItems.find(
          (item) => item.id === action.lineItemId,
        );
        if (lineItem) {
          if (action.quantity <= 0) {
            cart.lineItems = cart.lineItems.filter(
              (item) => item.id !== action.lineItemId,
            );
          } else {
            lineItem.quantity = action.quantity;
          }
        }
      } else if (action.action === 'addDiscountCode') {
        if (action.code.trim().toUpperCase() !== promoCode) {
          throw new Error(`Promo code "${action.code}" is not valid`);
        }
        if (!hasPromo(cart)) {
          cart.discountCodes.push({
            discountCode: {
              typeId: 'discount-code',
              id: 'demo-first15',
              obj: {
                id: 'demo-first15',
                version: 1,
                code: promoCode,
                name: {
                  en: 'First order discount',
                  ru: 'Скидка на первый заказ',
                },
                description: { en: '15% off', ru: 'Скидка 15%' },
                isActive: true,
                references: [],
                groups: [],
                cartDiscounts: [],
                applicationVersion: 1,
                createdAt: '2025-05-01T00:00:00.000Z',
                lastModifiedAt: '2025-05-01T00:00:00.000Z',
              },
            },
            state: 'MatchesCart',
          });
        }
      } else if (action.action === 'removeDiscountCode') {
        cart.discountCodes = cart.discountCodes.filter(
          (entry) => entry.discountCode.id !== action.discountCode.id,
        );
      }
    }

    return recalculate(cart);
  }

  async addLineItemToCart(
    productId: string,
    variantId: number,
    quantity = 1,
  ): Promise<Cart> {
    const cart = getStoredCart() || (await this.createCart());
    return this.updateCart(cart.id, cart.version, [
      { action: 'addLineItem', productId, variantId, quantity },
    ]);
  }

  async applyDiscountCode(
    cartId: string,
    cartVersion: number,
    code: string,
  ): Promise<Cart> {
    return this.updateCart(cartId, cartVersion, [
      { action: 'addDiscountCode', code },
    ]);
  }

  async removeDiscountCode(
    cartId: string,
    cartVersion: number,
    discountCode: DiscountCodeReference,
  ): Promise<Cart> {
    return this.updateCart(cartId, cartVersion, [
      { action: 'removeDiscountCode', discountCode },
    ]);
  }
}

export const demoCartService = new DemoCartService();
