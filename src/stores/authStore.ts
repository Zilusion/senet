import { defineStore } from 'pinia';
import type { Customer } from '@commercetools/platform-sdk';
import AuthService from '@/services/auth/authService';
import { ref, computed } from 'vue';
import appLogger from '@/utils/logger';
import {
  showErrorToast,
  showInfoToast,
  showSuccessToast,
} from '@/utils/toaster';
import i18n from '@/plugins/i18n';
import { AuthMessageKey } from '@/localization/i18nKeys';
import { AuthError, ClientValidationError } from '@/services/appErrors';
import { router } from '@/router/router';
import { CtpClientFactory } from '@/api/ctpClientBuilderFactory';
import type { CustomerAddressData } from '@/services/auth/types/customerAddressData';
import { isDemoMode } from '@/demo/config';

interface AuthStoreErrorDetails {
  i18nKey: AuthMessageKey | string;
  i18nParams?: Record<string, unknown>;
  code?: string;
  details?: unknown;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export interface AddressFormData {
  firstName?: string;
  lastName?: string;
  streetName: string;
  streetNumber?: string;
  city: string;
  postalCode: string;
  country: string;
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  shippingAddress: AddressFormData;
  sameAsShipping: boolean;
  billingAddress: AddressFormData;
}

/**
 * The store for authentication and user session.
 */
export const useAuthStore = defineStore('auth', () => {
  // --- State ---
  const user = ref<Customer | null>(null);
  const isLoading = ref(false);
  const currentError = ref<AuthStoreErrorDetails | null>(null);

  // --- Getters ---
  const isUserLoggedIn = computed(() => !!user.value);
  const userProfile = computed(() => user.value);
  const authErrorDetails = computed(() => currentError.value);
  const authErrorMessage = computed(() => currentError.value);

  // --- Actions ---
  /**
   * Set the loading state of the store.
   * @param loadingState - A boolean indicating if loading is in progress.
   */
  const setLoading = (loadingState: boolean): void => {
    isLoading.value = loadingState;
  };

  /**
   * Set the current error in the store.
   * @param err - The error object or message to set as the current error.
   */
  const setError = (err: AuthError | Error | string | null): void => {
    if (!err) {
      currentError.value = null;
      return;
    }

    let errorPayload: AuthStoreErrorDetails;

    if (err instanceof ClientValidationError) {
      errorPayload = {
        i18nKey: err.i18nKey,
        i18nParams: err.i18nParams,
        code: err.ctpErrorCode || err.name,
        details: err.details,
        fieldErrors: err.yupErrors,
      };
      appLogger.warn(
        `AuthStore ClientValidation Error: (Key: ${err.i18nKey})`,
        err.yupErrors,
      );
    } else if (err instanceof AuthError) {
      errorPayload = {
        i18nKey: err.i18nKey,
        i18nParams: err.i18nParams,
        code: err.ctpErrorCode || err.name,
        details: err.details,
      };
      appLogger.error(
        `AuthStore Error: ${err.name} (Key: ${err.i18nKey}, Code: ${err.ctpErrorCode}) - ${err.message}`,
        err.details || '',
      );
    } else if (err instanceof Error) {
      errorPayload = {
        i18nKey: AuthMessageKey.UnknownError,
        i18nParams: { details: err.message },
        code: 'GenericError',
      };
      appLogger.error(`AuthStore Generic Error: ${err.message}`);
    } else if (typeof err === 'string') {
      errorPayload = {
        i18nKey: AuthMessageKey.UnknownError,
        i18nParams: { details: err },
        code: 'StringError',
      };
      appLogger.error(`AuthStore String Error: ${err}`);
    } else {
      errorPayload = {
        i18nKey: AuthMessageKey.UnknownError,
        message: 'An unknown error occurred.',
        code: 'UnknownErrorInStore',
      };
      appLogger.error('AuthStore Unknown Error Structure:', err);
    }
    currentError.value = errorPayload;
    showErrorToast(
      i18n.global.t(errorPayload.i18nKey, errorPayload.i18nParams || {}),
    );
  };

  /**
   * Clear the current error in the store.
   */
  const clearError = (): void => {
    currentError.value = null;
  };

  /**
   * Set the user session with provided user data.
   * @param userData - The customer data to set as the current user session.
   */
  const setUserSession = (userData: Customer): void => {
    user.value = userData;
    currentError.value = null;
    appLogger.log('AuthStore: User session established.', userData);
  };

  /**
   * Clear the current user session.
   */
  const clearUserSession = (): void => {
    user.value = null;
    currentError.value = null;
    appLogger.log('AuthStore: User session cleared.');
  };

  /**
   * Log in a user with the provided credentials.
   * @param credentials - The login data containing user email and password.
   * @returns A promise that resolves to a boolean indicating login success.
   */
  async function login(credentials: LoginData): Promise<boolean> {
    setLoading(true);
    clearError();
    try {
      const loggedInUserData = await AuthService.login(credentials);
      setUserSession(loggedInUserData);
      showSuccessToast(i18n.global.t(AuthMessageKey.LoginSuccess));
      router.push({ name: 'Home' });
      return true;
    } catch (error) {
      if (error instanceof AuthError) setError(error);
      else
        setError(
          new AuthError(AuthMessageKey.LoginFailed, {
            details: error instanceof Error ? error.message : String(error),
          }),
        );
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Register a new user with the provided registration data.
   * @param data - The registration data containing user details.
   * @returns A promise that resolves to a boolean indicating registration success.
   */
  async function register(data: RegistrationData): Promise<boolean> {
    setLoading(true);
    clearError();
    try {
      const registrationResult = await AuthService.register(data);
      if (!registrationResult || !registrationResult.customer) {
        setError(
          new AuthError(
            'Registration succeeded, but failed to retrieve user data for auto-login.',
          ),
        );
        return false;
      }
      appLogger.log(
        'AuthStore: Registration successful. Proceeding to auto-login...',
      );
      const loggedInUserData = await AuthService.login({
        email: data.email,
        password: data.password,
      });
      setUserSession(loggedInUserData);
      showSuccessToast(i18n.global.t(AuthMessageKey.RegisterSuccess));
      appLogger.log('AuthStore: Login successful.');
      router.push({ name: 'Home' });
      return true;
    } catch (error) {
      if (error instanceof AuthError) setError(error);
      else
        setError(
          new AuthError(AuthMessageKey.RegisterFailed, {
            details: error instanceof Error ? error.message : String(error),
          }),
        );
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Log out the current user.
   * @returns A promise that resolves when logout is complete.
   */
  async function logout(): Promise<void> {
    setLoading(true);
    clearError();
    try {
      await AuthService.logout();
      clearUserSession();
      showInfoToast(i18n.global.t(AuthMessageKey.LogoutSuccess));
      router.push({ name: 'Login' });
    } catch (error) {
      appLogger.error('Error during logout process in store:', error);
      clearUserSession();
      if (error instanceof AuthError) setError(error);
      else
        setError(
          new AuthError(AuthMessageKey.LogoutFailed, {
            details: error instanceof Error ? error.message : String(error),
          }),
        );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Restore the user session on application load.
   */
  async function restoreUserSession() {
    appLogger.log('AuthStore: Attempting to restore session on load...');
    clearError();
    try {
      const userData = await AuthService.restoreSession();
      if (userData) {
        setUserSession(userData);
      } else {
        clearUserSession();
      }
    } catch (error) {
      appLogger.error('AuthStore: Failed to restore session.', error);
      clearUserSession();
    }
  }

  /**
   * Update personal profile information.
   * @param data - Object containing updated personal fields.
   * @returns A promise that resolves to a boolean indicating update success.
   */
  async function updateProfile(data: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<boolean> {
    setLoading(true);
    clearError();
    try {
      const updatedUser = await AuthService.updatePersonalInfo(data);
      setUserSession(updatedUser);
      showSuccessToast(
        i18n.global.t(AuthMessageKey.ProfileUpdateSuccess, {
          name: updatedUser.firstName,
        }),
      );

      return true;
    } catch (error) {
      appLogger.error('Failed to update profile in store:', error);

      setError(
        new AuthError(AuthMessageKey.ProfileUpdateFailed, {
          details: error instanceof Error ? error.message : String(error),
        }),
      );

      return false;
    } finally {
      setLoading(false);
    }
  }
  async function updatePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<boolean> {
    setLoading(true);
    clearError();
    try {
      let customerId: string;
      let customerVersion: number;

      if (isDemoMode) {
        if (!user.value) throw new Error('Demo session is not active');
        customerId = user.value.id;
        customerVersion = user.value.version;
      } else {
        const me = await CtpClientFactory.createApiRootWithUserSession()
          .me()
          .get()
          .execute();
        customerId = me.body.id;
        customerVersion = me.body.version;
      }

      const updatedUser = await AuthService.updatePassword({
        id: customerId,
        version: customerVersion,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setUserSession(updatedUser);
      showSuccessToast(
        i18n.global.t(AuthMessageKey.PasswordUpdateSuccess, {
          name: updatedUser.firstName,
        }),
      );
      return true;
    } catch (error) {
      appLogger.error('Failed to update password in store:', error);
      setError(
        new AuthError(AuthMessageKey.PasswordUpdateFailed, {
          details: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Update default shipping/billing address.
   * @param data - object with addressId and flags
   * @returns A promise that resolves to a boolean indicating success.
   */
  async function setDefaultAddress(
    addressId: string,
    type: 'shipping' | 'billing',
  ): Promise<boolean> {
    setLoading(true);
    clearError();
    try {
      const updatedUser = await AuthService.setDefaultAddress(addressId, type);
      setUserSession(updatedUser);

      showSuccessToast(
        i18n.global.t(AuthMessageKey.DefaultAddressUpdateSuccess),
      );
      return true;
    } catch (error) {
      appLogger.error(`Failed to set default ${type} address:`, error);
      setError(
        new AuthError(AuthMessageKey.DefaultAddressUpdateFailed, {
          details: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function removeAddress(addressId: string): Promise<Customer> {
    setLoading(true);
    clearError();
    try {
      const updatedUser = await AuthService.removeAddress(addressId);
      setUserSession(updatedUser);

      showSuccessToast(i18n.global.t(AuthMessageKey.AddressRemoveSuccess));

      return updatedUser;
    } catch (error) {
      appLogger.error(`Failed to remove address:`, error);
      setError(
        new AuthError(AuthMessageKey.AddressRemoveFailed, {
          details: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Add or update customer's address (and optionally set as default).
   * @param data - address form data +
   * @returns A promise that resolves to a boolean indicating success.
   */
  async function updateAddress(address: CustomerAddressData): Promise<boolean> {
    setLoading(true);
    clearError();

    try {
      const updatedUser = await AuthService.updateAddress(address);
      setUserSession(updatedUser);
      showSuccessToast(i18n.global.t(AuthMessageKey.AddressUpdateSuccess));
      return true;
    } catch (error) {
      appLogger.error('Failed to update/add address in store:', error);
      setError(
        new AuthError(AuthMessageKey.AddressUpdateFailed, {
          details: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    user,
    isLoading,
    currentError,

    isUserLoggedIn,
    userProfile,
    authErrorDetails,
    authErrorMessage,

    updateAddress,
    removeAddress,
    setDefaultAddress,
    updateProfile,
    updatePassword,
    login,
    register,
    logout,
    restoreUserSession,
    clearError,
  };
});
