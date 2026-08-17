import {
  type Cart,
  type DiscountCodeReference,
  type MyCartUpdateAction,
} from '@commercetools/platform-sdk';
import anonymousSessionService from '../auth/anonymousSessionService';
import appLogger from '@/utils/logger';
import { parseError } from '../appErrors';
import { userTokenCache } from '@/api/localStorageTokenCache';
import { CtpClientFactory } from '@/api/ctpClientBuilderFactory';
import { isNotFoundError } from '@/utils/isNotFoundError';
import { isDemoMode } from '@/demo/config';
import { demoCartService } from '@/demo/cartService';

const cartDraft = {
  currency: 'EUR',
};

export class CartService {
  private async getSession() {
    const storedUserToken = userTokenCache.get();
    const session = storedUserToken.token
      ? CtpClientFactory.createApiRootWithUserSession()
      : (await anonymousSessionService.ensureSession())?.apiRoot;

    if (!session) {
      throw new Error('No active session');
    }

    return session;
  }

  public async getActiveCart(): Promise<Cart | null> {
    if (isDemoMode) return demoCartService.getActiveCart();
    const session = await this.getSession();

    try {
      const response = await session
        .me()
        .activeCart()
        .get({
          queryArgs: {
            expand: 'discountCodes[*].discountCode',
          },
        })
        .execute();

      appLogger.log(
        'CartService: Active cart retrieved via /me',
        response.body,
      );
      return response.body;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      appLogger.error('CartService: Failed to get cart via /me', error);
      throw parseError(error);
    }
  }

  public async createCart(): Promise<Cart> {
    if (isDemoMode) return demoCartService.createCart();
    const session = await this.getSession();

    try {
      const response = await session
        .me()
        .carts()
        .post({
          body: cartDraft,
          queryArgs: {
            expand: 'discountCodes[*].discountCode',
          },
        })
        .execute();

      appLogger.log('CartService: Cart created via /me', response.body);
      return response.body;
    } catch (error) {
      appLogger.error('CartService: Failed to create cart via /me', error);
      throw parseError(error);
    }
  }

  public async deleteCart(cart: Cart): Promise<void> {
    if (isDemoMode) return demoCartService.deleteCart(cart);
    const session = await this.getSession();

    try {
      await session
        .me()
        .carts()
        .withId({ ID: cart.id })
        .delete({ queryArgs: { version: cart.version } })
        .execute();

      appLogger.log(`CartService: Cart deleted via /me (id: ${cart.id})`);
    } catch (error) {
      appLogger.error('CartService: Failed to delete cart via /me', error);
      throw parseError(error);
    }
  }

  public async updateCart(
    cartId: string,
    version: number,
    actions: MyCartUpdateAction[],
  ): Promise<Cart> {
    if (isDemoMode) {
      return demoCartService.updateCart(cartId, version, actions);
    }
    const session = await this.getSession();

    try {
      const response = await session
        .me()
        .carts()
        .withId({ ID: cartId })
        .post({
          body: { version, actions },
          queryArgs: {
            expand: 'discountCodes[*].discountCode',
          },
        })
        .execute();

      appLogger.log(
        `CartService: Cart updated via /me (id: ${cartId})`,
        response.body,
      );
      return response.body;
    } catch (error) {
      appLogger.error('CartService: Failed to update cart via /me', error);
      throw parseError(error);
    }
  }

  public async addLineItemToCart(
    productId: string,
    variantId: number,
    quantity = 1,
  ): Promise<Cart> {
    if (isDemoMode) {
      return demoCartService.addLineItemToCart(productId, variantId, quantity);
    }
    let cart = await this.getActiveCart();
    if (!cart) {
      cart = await this.createCart();
    }

    const actions: MyCartUpdateAction[] = [
      {
        action: 'addLineItem',
        productId,
        variantId,
        quantity,
      },
    ];

    return this.updateCart(cart.id, cart.version, actions);
  }

  public async applyDiscountCode(
    cartId: string,
    cartVersion: number,
    code: string,
  ): Promise<Cart> {
    if (isDemoMode) {
      return demoCartService.applyDiscountCode(cartId, cartVersion, code);
    }
    appLogger.log('CartService: Applying discount code:', { cartId, code });
    const action: MyCartUpdateAction = { action: 'addDiscountCode', code };
    return this.updateCart(cartId, cartVersion, [action]);
  }

  public async removeDiscountCode(
    cartId: string,
    cartVersion: number,
    discountCode: DiscountCodeReference,
  ): Promise<Cart> {
    if (isDemoMode) {
      return demoCartService.removeDiscountCode(
        cartId,
        cartVersion,
        discountCode,
      );
    }
    appLogger.log('CartService: Removing discount code:', {
      cartId,
      discountCodeId: discountCode.id,
    });
    const action: MyCartUpdateAction = {
      action: 'removeDiscountCode',
      discountCode,
    };
    return this.updateCart(cartId, cartVersion, [action]);
  }
}

export const cartService = new CartService();
