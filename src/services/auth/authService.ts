import appLogger from '@/utils/logger';
import {
  type Customer,
  type MyCustomerDraft,
  type CustomerSignInResult,
  type MyCustomerSignin,
  type BaseAddress,
} from '@commercetools/platform-sdk';
import { userTokenCache } from '@/api/localStorageTokenCache';
import { CtpClientFactory } from '@/api/ctpClientBuilderFactory';
import { type LoginData, type RegistrationData } from '@/stores/authStore';
import { AuthError, parseError } from '../appErrors';
import { loginSchema } from '@/schemas/loginSchema';
import { registrationSchema } from '@/schemas/registrationSchema';
import { AuthMessageKey } from '@/localization/i18nKeys';
import { authUrl, clientId, clientSecret } from '@/api/ctpConfig';
import AnonymousSessionService from './anonymousSessionService';
import { validateData } from '@/utils/validationUtils';
import type { CustomerAddressData } from './types/customerAddressData';
import type { MyCustomerUpdateAction } from '@commercetools/platform-sdk';
import { isDemoMode } from '@/demo/config';
import { demoAuthService } from '@/demo/authService';

class AuthService {
  /**
   * Attempt to log in a user using the provided login data.
   * @param data - The login data containing email and password.
   * @returns The logged-in customer information.
   */
  public async login(data: LoginData): Promise<Customer> {
    appLogger.log('AuthService: Attempting login with /me/login strategy...');

    await validateData(loginSchema, data, 'Login Data');

    if (isDemoMode) return demoAuthService.login(data);

    const anonymousSession = await AnonymousSessionService.ensureSession();
    if (!anonymousSession) {
      throw new AuthError(AuthMessageKey.UnknownError, {
        details: 'Failed to ensure anonymous session for login.',
      });
    }

    userTokenCache.clear();

    try {
      const signInBody: MyCustomerSignin = {
        email: data.email,
        password: data.password,
        activeCartSignInMode: 'MergeWithExistingCustomerCart',
        updateProductData: true,
      };
      appLogger.log(
        'AuthService: Calling /me/login with anonymous token and body:',
        signInBody,
      );
      const meLoginResponse = await anonymousSession.apiRoot
        .me()
        .login()
        .post({ body: signInBody })
        .execute();
      const signInResult = meLoginResponse.body as CustomerSignInResult;
      appLogger.log(
        'AuthService: Login successful, customer data obtained. Cart (if any):',
        signInResult.cart,
      );

      AnonymousSessionService.clearData();

      appLogger.log(
        'AuthService: Performing Password Flow to get user tokens...',
      );
      userTokenCache.clear();
      const userApiRoot = CtpClientFactory.createPasswordFlowApiRoot({
        email: data.email,
        password: data.password,
      });

      await userApiRoot.me().get().execute();
      return signInResult.customer;
    } catch (error) {
      appLogger.error('AuthService Login Error:', error);
      userTokenCache.clear();
      throw parseError(error);
    }
  }

  /**
   * Register a new user with the provided registration data.
   * @param data - The registration data containing user details.
   * @returns The result of the customer sign-in.
   */
  public async register(data: RegistrationData): Promise<CustomerSignInResult> {
    appLogger.log('AuthService: Attempting registration...');

    await validateData(registrationSchema, data, 'Registration Data');

    if (isDemoMode) return demoAuthService.register(data);

    const anonymousSession = await AnonymousSessionService.ensureSession();
    if (!anonymousSession) {
      throw new AuthError(AuthMessageKey.UnknownError, {
        details: 'Failed to ensure anonymous session for registration.',
      });
    }

    try {
      const addresses: BaseAddress[] = [];

      const shippingAddr: BaseAddress = { ...data.shippingAddress };
      addresses.push(shippingAddr);

      let billingAddr: BaseAddress = shippingAddr;
      if (!data.sameAsShipping && data.billingAddress) {
        billingAddr = { ...data.billingAddress };
        addresses.push(billingAddr);
      }

      let defaultShippingAddressIndex: number | undefined = undefined;
      let defaultBillingAddressIndex: number | undefined = undefined;

      if (data.shippingAddress.isDefaultShipping) {
        defaultShippingAddressIndex = addresses.indexOf(shippingAddr);
      }

      if (data.sameAsShipping && data.shippingAddress.isDefaultBilling) {
        defaultBillingAddressIndex = addresses.indexOf(shippingAddr);
      } else if (
        !data.sameAsShipping &&
        data.billingAddress?.isDefaultBilling
      ) {
        defaultBillingAddressIndex = addresses.indexOf(billingAddr);
      }

      const myCustomerDraft: MyCustomerDraft = {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        addresses: addresses,
        ...(defaultShippingAddressIndex !== undefined && {
          defaultShippingAddress: defaultShippingAddressIndex,
        }),
        ...(defaultBillingAddressIndex !== undefined && {
          defaultBillingAddress: defaultBillingAddressIndex,
        }),
      };

      const response = await anonymousSession.apiRoot
        .me()
        .signup()
        .post({ body: myCustomerDraft })
        .execute();
      appLogger.log(
        'AuthService: Registration part successful. Attempting auto-login...',
      );
      AnonymousSessionService.clearData();

      return response.body;
    } catch (error) {
      appLogger.error('AuthService Register Error:', error);
      throw parseError(error);
    }
  }

  /**
   * Log out the current user and revoke their session token.
   */
  public async logout(): Promise<void> {
    if (isDemoMode) return demoAuthService.logout();
    appLogger.log('AuthService: Logging out...');
    const tokenCache = userTokenCache;
    const currentTokens = tokenCache.get();
    const tokenToRevoke = currentTokens.refreshToken || currentTokens.token;

    tokenCache.clear();
    AnonymousSessionService.clearData();

    if (tokenToRevoke) {
      try {
        const revokeUrl = `${authUrl}/oauth/token/revoke`;
        const credentials = btoa(`${clientId}:${clientSecret}`);
        await fetch(revokeUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `token=${encodeURIComponent(tokenToRevoke)}`,
        });
        appLogger.log('AuthService: Token revocation attempted.');
      } catch (error) {
        appLogger.error(
          'AuthService: Token revocation failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Restore the user session if a valid refresh token is available.
   * @returns The restored customer information or null if restoration fails.
   */
  public async restoreSession(): Promise<Customer | null> {
    if (isDemoMode) return demoAuthService.restoreSession();
    appLogger.log('AuthService: Checking auth and refreshing token...');
    const initialTokenState = userTokenCache.get();

    if (!initialTokenState.refreshToken) {
      appLogger.log('AuthService: No refresh token found.');
      return null;
    }

    try {
      const refreshApiRoot = CtpClientFactory.createRefreshTokenFlowApiRoot(
        initialTokenState.refreshToken,
        userTokenCache,
      );
      const meResponse = await refreshApiRoot.me().get().execute();
      appLogger.log('AuthService: Session restored/refreshed successfully.');
      return meResponse.body as Customer;
    } catch (error: unknown) {
      appLogger.error('AuthService: Failed to refresh session:', error);
      userTokenCache.clear();
      return null;
    }
  }

  public async updatePersonalInfo(data: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<Customer> {
    if (isDemoMode) return demoAuthService.updatePersonalInfo(data);
    appLogger.log('AuthService: Updating personal information...');

    try {
      const apiRoot = CtpClientFactory.createApiRootWithUserSession();
      const current = await apiRoot.me().get().execute();

      const actions: import('@commercetools/platform-sdk').MyCustomerUpdateAction[] =
        [];

      if (data.email !== current.body.email) {
        actions.push({ action: 'changeEmail', email: data.email });
      }
      if (data.firstName !== current.body.firstName) {
        actions.push({ action: 'setFirstName', firstName: data.firstName });
      }
      if (data.lastName !== current.body.lastName) {
        actions.push({ action: 'setLastName', lastName: data.lastName });
      }
      if (data.dateOfBirth !== current.body.dateOfBirth) {
        actions.push({
          action: 'setDateOfBirth',
          dateOfBirth: data.dateOfBirth,
        });
      }

      if (actions.length === 0) {
        appLogger.log('AuthService: No changes to update.');
        return current.body;
      }

      const updated = await apiRoot
        .me()
        .post({
          body: {
            version: current.body.version,
            actions,
          },
        })
        .execute();

      appLogger.log('AuthService: Personal information updated.');
      return updated.body;
    } catch (error) {
      appLogger.error('AuthService: Failed to update personal info:', error);
      throw parseError(error);
    }
  }

  public async updatePassword(data: {
    id: string;
    version: number;
    currentPassword: string;
    newPassword: string;
  }): Promise<Customer> {
    if (isDemoMode) {
      return demoAuthService.updatePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
    }
    appLogger.log('AuthService: Updating password...');

    try {
      const apiRoot = CtpClientFactory.createApiRootWithUserSession();
      const response = await apiRoot
        .me()
        .password()
        .post({
          body: {
            version: data.version,
            currentPassword: data.currentPassword,
            newPassword: data.newPassword,
          },
        })
        .execute();

      appLogger.log('AuthService: Password updated, re-authenticating...');

      const userApiRoot = CtpClientFactory.createPasswordFlowApiRoot({
        email: response.body.email,
        password: data.newPassword,
      });

      await userApiRoot.me().get().execute();

      appLogger.log(
        'AuthService: Re-authentication successful after password change.',
      );
      return response.body;
    } catch (error) {
      appLogger.error('AuthService: Failed to update password:', error);
      throw parseError(error);
    }
  }

  public async setDefaultAddress(
    addressId: string,
    type: 'shipping' | 'billing',
  ): Promise<Customer> {
    if (isDemoMode) {
      return demoAuthService.setDefaultAddress(addressId, type);
    }
    appLogger.log(
      `AuthService: Setting default ${type} address to ID: ${addressId}`,
    );

    try {
      const apiRoot = CtpClientFactory.createApiRootWithUserSession();
      const current = await apiRoot.me().get().execute();

      const action: import('@commercetools/platform-sdk').MyCustomerUpdateAction =
        type === 'shipping'
          ? { action: 'setDefaultShippingAddress' as const, addressId }
          : { action: 'setDefaultBillingAddress' as const, addressId };

      const updated = await apiRoot
        .me()
        .post({
          body: {
            version: current.body.version,
            actions: [action],
          },
        })
        .execute();

      appLogger.log(`AuthService: Default ${type} address updated.`);
      return updated.body;
    } catch (error) {
      appLogger.error(
        `AuthService: Failed to set default ${type} address:`,
        error,
      );
      throw parseError(error);
    }
  }

  public async removeAddress(addressId: string): Promise<Customer> {
    if (isDemoMode) return demoAuthService.removeAddress(addressId);
    appLogger.log(`AuthService: Removing address with ID: ${addressId}`);

    try {
      const apiRoot = CtpClientFactory.createApiRootWithUserSession();
      const current = await apiRoot.me().get().execute();

      const action: import('@commercetools/platform-sdk').MyCustomerUpdateAction =
        {
          action: 'removeAddress',
          addressId,
        };

      const updated = await apiRoot
        .me()
        .post({
          body: {
            version: current.body.version,
            actions: [action],
          },
        })
        .execute();

      appLogger.log(`AuthService: Address removed.`);
      return updated.body;
    } catch (error) {
      appLogger.error(`AuthService: Failed to remove address:`, error);
      throw parseError(error);
    }
  }

  public async updateAddress(address: CustomerAddressData): Promise<Customer> {
    if (isDemoMode) return demoAuthService.updateAddress(address);
    appLogger.log('AuthService: Updating customer address...', address);
    const apiRoot = CtpClientFactory.createApiRootWithUserSession();
    const current = await apiRoot.me().get().execute();

    const actions: MyCustomerUpdateAction[] = [];
    let newAddressId: string | undefined;

    if (!address.id) {
      actions.push({
        action: 'addAddress',
        address: {
          streetName: address.streetName,
          city: address.city,
          postalCode: address.postalCode,
          country: address.country,
        },
      });
    } else {
      actions.push({
        action: 'changeAddress',
        addressId: address.id,
        address: {
          streetName: address.streetName,
          city: address.city,
          postalCode: address.postalCode,
          country: address.country,
        },
      });
    }

    if (actions.length === 0) {
      appLogger.warn('AuthService: No address changes detected.');
      throw new Error('No address changes to apply.');
    }

    let response = await apiRoot
      .me()
      .post({
        body: {
          version: current.body.version,
          actions,
        },
      })
      .execute();

    if (!address.id) {
      const addedAddress =
        response.body.addresses[response.body.addresses.length - 1];
      newAddressId = addedAddress.id;
      if (!newAddressId) {
        appLogger.error('AuthService: Failed to retrieve new address ID.');
        throw new Error('Failed to retrieve new address ID.');
      }
    }

    const followUpActions: MyCustomerUpdateAction[] = [];
    const addressId = address.id || newAddressId;

    if (!address.id && address.type) {
      if (address.type === 'shipping') {
        followUpActions.push({
          action: 'addShippingAddressId',
          addressId: newAddressId,
        });
      } else if (address.type === 'billing') {
        followUpActions.push({
          action: 'addBillingAddressId',
          addressId: newAddressId,
        });
      }
    }

    if (addressId && address.defaultShipping) {
      followUpActions.push({
        action: 'setDefaultShippingAddress',
        addressId,
      });
    }

    if (addressId && address.defaultBilling) {
      followUpActions.push({
        action: 'setDefaultBillingAddress',
        addressId,
      });
    }

    if (followUpActions.length > 0) {
      response = await apiRoot
        .me()
        .post({
          body: {
            version: response.body.version,
            actions: followUpActions,
          },
        })
        .execute();
    }

    appLogger.log('AuthService: Updated customer:', response.body);
    appLogger.log(
      'AuthService: Shipping address IDs:',
      response.body.shippingAddressIds,
    );
    appLogger.log(
      'AuthService: Billing address IDs:',
      response.body.billingAddressIds,
    );
    return response.body;
  }
}

export { AuthService };
export default new AuthService();
