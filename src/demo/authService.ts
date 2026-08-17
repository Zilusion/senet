import type {
  BaseAddress,
  Customer,
  CustomerSignInResult,
} from '@commercetools/platform-sdk';
import type { LoginData, RegistrationData } from '@/stores/authStore';
import type { CustomerAddressData } from '@/services/auth/types/customerAddressData';

const accountStorageKey = 'senet-demo-account-v1';
const sessionStorageKey = 'senet-demo-session-v1';

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableAddress = Mutable<BaseAddress>;
type MutableCustomer = Omit<
  Mutable<Customer>,
  'addresses' | 'shippingAddressIds' | 'billingAddressIds'
> & {
  addresses: MutableAddress[];
  shippingAddressIds?: string[];
  billingAddressIds?: string[];
};

interface StoredAccount {
  customer: MutableCustomer;
}

function createId(prefix: string) {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function cloneCustomer(customer: Customer | MutableCustomer): MutableCustomer {
  return JSON.parse(JSON.stringify(customer)) as MutableCustomer;
}

function readAccount(): StoredAccount | null {
  const serialized = localStorage.getItem(accountStorageKey);
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as StoredAccount;
  } catch {
    localStorage.removeItem(accountStorageKey);
    return null;
  }
}

function saveAccount(account: StoredAccount): Customer {
  const customer = cloneCustomer(account.customer);
  customer.version += 1;
  customer.lastModifiedAt = new Date().toISOString();
  account.customer = customer;
  localStorage.setItem(accountStorageKey, JSON.stringify(account));
  localStorage.setItem(sessionStorageKey, 'active');
  return cloneCustomer(customer) as unknown as Customer;
}

function createAddress(address: Partial<BaseAddress>): MutableAddress {
  return {
    id: createId('demo-address'),
    firstName: address.firstName,
    lastName: address.lastName,
    streetName: address.streetName || 'Meeple Street',
    streetNumber: address.streetNumber,
    postalCode: address.postalCode || '10115',
    city: address.city || 'Berlin',
    country: address.country || 'DE',
  };
}

function createCustomer(
  email: string,
  firstName = 'Demo',
  lastName = 'Player',
  dateOfBirth = '1995-05-25',
  addresses?: MutableAddress[],
): MutableCustomer {
  const now = new Date().toISOString();
  const customerAddresses =
    addresses && addresses.length > 0
      ? addresses
      : [createAddress({ firstName, lastName })];
  const defaultAddressId = customerAddresses[0]?.id;

  return {
    id: createId('demo-customer'),
    version: 1,
    createdAt: now,
    lastModifiedAt: now,
    email,
    firstName,
    lastName,
    dateOfBirth,
    addresses: customerAddresses,
    shippingAddressIds: defaultAddressId ? [defaultAddressId] : [],
    billingAddressIds: defaultAddressId ? [defaultAddressId] : [],
    defaultShippingAddressId: defaultAddressId,
    defaultBillingAddressId: defaultAddressId,
    isEmailVerified: true,
    stores: [],
    authenticationMode: 'Password',
  } as MutableCustomer;
}

function getRequiredAccount(): StoredAccount {
  const account = readAccount();
  if (!account) throw new Error('Demo session is not active');
  return account;
}

class DemoAuthService {
  async login(data: LoginData): Promise<Customer> {
    void data.password;
    let account = readAccount();
    if (!account || account.customer.email !== data.email) {
      const guessedName = data.email.split('@')[0] || 'Demo';
      account = {
        customer: createCustomer(data.email, guessedName, 'Player'),
      };
    }
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    localStorage.setItem(sessionStorageKey, 'active');
    return cloneCustomer(account.customer) as unknown as Customer;
  }

  async register(data: RegistrationData): Promise<CustomerSignInResult> {
    void data.password;
    const shippingAddress = createAddress({
      ...data.shippingAddress,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    const billingAddress = data.sameAsShipping
      ? shippingAddress
      : createAddress({
          ...data.billingAddress,
          firstName: data.firstName,
          lastName: data.lastName,
        });
    const addresses =
      shippingAddress.id === billingAddress.id
        ? [shippingAddress]
        : [shippingAddress, billingAddress];
    const customer = createCustomer(
      data.email,
      data.firstName,
      data.lastName,
      data.dateOfBirth,
      addresses,
    );
    customer.shippingAddressIds = shippingAddress.id
      ? [shippingAddress.id]
      : [];
    customer.billingAddressIds = billingAddress.id ? [billingAddress.id] : [];
    customer.defaultShippingAddressId = data.shippingAddress.isDefaultShipping
      ? shippingAddress.id
      : undefined;
    customer.defaultBillingAddressId = data.sameAsShipping
      ? data.shippingAddress.isDefaultBilling
        ? shippingAddress.id
        : undefined
      : data.billingAddress.isDefaultBilling
        ? billingAddress.id
        : undefined;

    const account = { customer };
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    localStorage.setItem(sessionStorageKey, 'active');
    return {
      customer: cloneCustomer(customer) as unknown as Customer,
    } as CustomerSignInResult;
  }

  async logout(): Promise<void> {
    localStorage.removeItem(sessionStorageKey);
  }

  async restoreSession(): Promise<Customer | null> {
    if (localStorage.getItem(sessionStorageKey) !== 'active') return null;
    return (readAccount()?.customer as unknown as Customer) || null;
  }

  async updatePersonalInfo(data: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<Customer> {
    const account = getRequiredAccount();
    Object.assign(account.customer, data);
    return saveAccount(account);
  }

  async updatePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<Customer> {
    void data;
    const account = getRequiredAccount();
    return saveAccount(account);
  }

  async setDefaultAddress(
    addressId: string,
    type: 'shipping' | 'billing',
  ): Promise<Customer> {
    const account = getRequiredAccount();
    const exists = account.customer.addresses.some(
      (address) => address.id === addressId,
    );
    if (!exists) throw new Error('Address not found');
    if (type === 'shipping') {
      account.customer.defaultShippingAddressId = addressId;
    } else {
      account.customer.defaultBillingAddressId = addressId;
    }
    return saveAccount(account);
  }

  async removeAddress(addressId: string): Promise<Customer> {
    const account = getRequiredAccount();
    account.customer.addresses = account.customer.addresses.filter(
      (address) => address.id !== addressId,
    );
    account.customer.shippingAddressIds =
      account.customer.shippingAddressIds?.filter((id) => id !== addressId);
    account.customer.billingAddressIds =
      account.customer.billingAddressIds?.filter((id) => id !== addressId);
    if (account.customer.defaultShippingAddressId === addressId) {
      account.customer.defaultShippingAddressId = undefined;
    }
    if (account.customer.defaultBillingAddressId === addressId) {
      account.customer.defaultBillingAddressId = undefined;
    }
    return saveAccount(account);
  }

  async updateAddress(address: CustomerAddressData): Promise<Customer> {
    const account = getRequiredAccount();
    let addressId = address.id;
    const updatedAddress = createAddress(address);

    if (addressId) {
      updatedAddress.id = addressId;
      const index = account.customer.addresses.findIndex(
        (item) => item.id === addressId,
      );
      if (index < 0) throw new Error('Address not found');
      account.customer.addresses[index] = updatedAddress;
    } else {
      addressId = updatedAddress.id;
      account.customer.addresses.push(updatedAddress);
      if (address.type === 'shipping' && addressId) {
        account.customer.shippingAddressIds = [
          ...(account.customer.shippingAddressIds || []),
          addressId,
        ];
      }
      if (address.type === 'billing' && addressId) {
        account.customer.billingAddressIds = [
          ...(account.customer.billingAddressIds || []),
          addressId,
        ];
      }
    }

    if (address.defaultShipping && addressId) {
      account.customer.defaultShippingAddressId = addressId;
    }
    if (address.defaultBilling && addressId) {
      account.customer.defaultBillingAddressId = addressId;
    }
    return saveAccount(account);
  }
}

export const demoAuthService = new DemoAuthService();
