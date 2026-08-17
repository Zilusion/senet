<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useCartStore } from '@/stores/cartStore';
import { useProductDetailStore } from '@/stores/productsStore';
import { useProjectSettingsStore } from '@/stores/projectSettingsStore';
import { ref, onMounted, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Galleria from 'primevue/galleria';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import Breadcrumb from 'primevue/breadcrumb';
import Tag from 'primevue/tag';
import SelectButton from 'primevue/selectbutton';
import appLogger from '@/utils/logger';
import type {
  Attribute,
  Category,
  Image as CtImage,
  LineItem,
  LocalizedString,
} from '@commercetools/platform-sdk';

const props = defineProps<{
  identifier: string;
}>();

const route = useRoute();
const productStore = useProductDetailStore();
const projectSettingsStore = useProjectSettingsStore();
const cartStore = useCartStore();
const { t, locale } = useI18n();

const displayModalGallery = ref(false);
const currentImageIndex = ref(0);

const selectedCurrency = ref<string>(
  localStorage.getItem('selectedCurrency') || 'USD',
);

const product = computed(() => productStore.getProduct);
const isLoading = computed(() => productStore.getIsLoading);
const errorMessage = computed(() => productStore.getError);
const currentLocale = computed(() => locale.value);

const productName = computed(() => {
  const name = product.value?.name;
  return (
    name?.[currentLocale.value] ||
    name?.en ||
    t('productPage.unknownName', 'Unknown Product')
  );
});

const productDescription = computed(() => {
  const description = product.value?.description;
  return (
    description?.[currentLocale.value] ||
    description?.en ||
    t(
      'productPage.unknownDescription',
      'No description available for this product.',
    )
  );
});

const productLineItem = computed<LineItem | undefined>(() => {
  if (!product.value || !cartStore.cart?.lineItems) {
    return undefined;
  }
  return cartStore.cart.lineItems.find(
    (item) => item.productId === product.value?.id,
  );
});

const galleryImages = computed(() => {
  const p = product.value;
  if (!p || !p.masterVariant?.images?.length) return [];
  return p.masterVariant.images.map((img: CtImage) => ({
    itemImageSrc: img.url,
    thumbnailImageSrc: img.url,
    alt:
      img.label ||
      productName.value ||
      t('productPage.imageAlt', 'Product Image'),
    title: productName.value || t('productPage.imageTitle', 'Product Image'),
  }));
});

const productHasMultipleImages = computed(() => galleryImages.value.length > 1);

interface DisplayPrice {
  originalFormatted: string;
  saleFormatted?: string;
  currencySymbol: string;
  hasSale: boolean;
}

const formatCurrency = (amount: number, currencyCode: string): string => {
  return new Intl.NumberFormat(currentLocale.value, {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
};

const currentDisplayPrice = computed((): DisplayPrice | null => {
  const p = product.value;
  const currentCurrencyCode = selectedCurrency.value;
  if (!p || !p.masterVariant?.prices?.length || !currentCurrencyCode)
    return null;

  const priceData = p.masterVariant.prices.find(
    (price) => price.value.currencyCode === currentCurrencyCode,
  );
  if (!priceData?.value) return null;

  const originalAmount = priceData.value.centAmount / 100;
  const displayPrice: DisplayPrice = {
    originalFormatted: formatCurrency(originalAmount, currentCurrencyCode),
    currencySymbol: priceData.value.currencyCode,
    hasSale: !!priceData.discounted,
  };

  if (priceData.discounted) {
    const saleAmount = priceData.discounted.value.centAmount / 100;
    displayPrice.saleFormatted = formatCurrency(
      saleAmount,
      currentCurrencyCode,
    );
  }
  return displayPrice;
});

const productAttributes = computed(() => {
  const p = product.value;
  if (!p || !p.masterVariant?.attributes?.length) return [];

  const attributeDefinitions = p.productType?.obj?.attributes;

  return p.masterVariant.attributes
    .map((attr: Attribute) => {
      const definition = attributeDefinitions?.find(
        (def) => def.name === attr.name,
      );
      const label =
        definition?.label?.[currentLocale.value] ||
        definition?.label?.en ||
        t(
          `productPage.attributes.${attr.name}`,
          attr.name.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        );

      let valueDisplay: string | string[];
      const attrValue = attr.value;

      if (
        typeof attrValue === 'object' &&
        attrValue !== null &&
        !Array.isArray(attrValue)
      ) {
        const localizedValue = attrValue as LocalizedString;
        valueDisplay =
          localizedValue[currentLocale.value] ||
          localizedValue.en ||
          Object.values(localizedValue)[0] ||
          t('productPage.valueNotAvailable', 'N/A');
      } else if (Array.isArray(attrValue)) {
        valueDisplay = attrValue.map((item) => {
          if (
            typeof item === 'object' &&
            item !== null &&
            item.label &&
            typeof item.label === 'object'
          ) {
            const itemLabel = item.label as LocalizedString;
            return (
              itemLabel[currentLocale.value] ||
              itemLabel.en ||
              Object.values(itemLabel)[0] ||
              item.key ||
              t('productPage.valueNotAvailable', 'N/A')
            );
          }
          return String(item);
        });
      } else {
        valueDisplay = String(attrValue);
      }
      return {
        name: attr.name,
        label: label,
        value: valueDisplay,
      };
    })
    .filter(
      (attr) =>
        attr.value !== null &&
        attr.value !== undefined &&
        String(attr.value).trim() !== '' &&
        String(attr.value).trim() !== t('productPage.valueNotAvailable', 'N/A'),
    );
});

import type { MenuItem } from 'primevue/menuitem';
import { showErrorToast, showSuccessToast } from '@/utils/toaster';
const sourceCategoryId = computed(
  () => route.query.category as string | undefined,
);

const breadcrumbs = computed(() => {
  const homeItem: MenuItem = {
    label: t('breadcrumb.home'),
    to: { name: 'Home' },
  };
  const pathItems: MenuItem[] = [];
  const p = product.value;
  const currentLang = currentLocale.value;

  if (p?.categories?.length) {
    let displayCategoryData: Category | undefined;

    if (sourceCategoryId.value) {
      const foundCategory = p.categories.find(
        (catRef) =>
          catRef.obj?.slug?.[currentLang] === sourceCategoryId.value ||
          catRef.obj?.slug?.en === sourceCategoryId.value ||
          catRef.id === sourceCategoryId.value,
      );
      if (foundCategory?.obj) {
        displayCategoryData = foundCategory.obj as Category;
      }
    }

    if (!displayCategoryData && p.categories[0]?.obj) {
      displayCategoryData = p.categories[0].obj as Category;
    }

    if (displayCategoryData) {
      const categoryStack: Category[] = [];
      let currentCatForPath: Category | undefined = displayCategoryData;

      while (currentCatForPath) {
        categoryStack.unshift(currentCatForPath);
        currentCatForPath = currentCatForPath.parent?.obj as
          | Category
          | undefined;
      }

      categoryStack.forEach((catInPath, index) => {
        if (index === 0) {
          pathItems.push({
            label: 'All Categories',
            to: {
              name: 'CatalogCategory',
              params: { category: 'all-categories' },
            },
          });
          return;
        }
        const slug =
          catInPath.slug?.[currentLang] || catInPath.slug?.en || catInPath.id;
        pathItems.push({
          label: catInPath.name[currentLang] || catInPath.name.en || 'Category',
          to: { name: 'CatalogCategory', params: { category: slug } },
        });
      });
    }
  }

  if (p) {
    pathItems.push({ label: productName.value, disabled: true });
  }
  return { home: homeItem, items: pathItems };
});

const availableCurrenciesForSelect = computed(() => {
  return projectSettingsStore.getAvailableCurrencies.map((code) => ({
    name: code,
    code,
  }));
});

watch(selectedCurrency, (newCurrency) => {
  if (newCurrency) localStorage.setItem('selectedCurrency', newCurrency);
});

watch(
  projectSettingsStore.getAvailableCurrencies,
  (newCurrencies) => {
    if (
      newCurrencies.length > 0 &&
      !newCurrencies.includes(selectedCurrency.value || '')
    ) {
      selectedCurrency.value = newCurrencies[0];
    }
  },
  { immediate: true },
);

function openModalGallery(index: number) {
  currentImageIndex.value = index;
  displayModalGallery.value = true;
}

async function handleAddToCart() {
  if (!product.value) return;
  const { id: productId, masterVariant } = product.value;

  try {
    await cartStore.addLineItem(productId, masterVariant.id, 1);
    showSuccessToast(t('productPage.addSuccess'));
  } catch (err) {
    appLogger.error('Failed to add item to cart', err);
    showErrorToast(t('productPage.addError'));
  }
}

async function handleRemoveFromCart() {
  if (!productLineItem.value) return;

  try {
    await cartStore.removeLineItem(productLineItem.value.id);
    showSuccessToast(t('productPage.removeSuccess'));
  } catch (err) {
    appLogger.error('Failed to remove item from cart', err);
    showErrorToast(t('productPage.removeError'));
  }
}

const isActionDisabled = computed(() => {
  return productStore.getIsLoading || cartStore.isLoading;
});

async function loadProductData() {
  productStore.clearError();
  const identifierValue =
    props.identifier || (route.params.identifier as string);

  if (!identifierValue) {
    appLogger.error('ProductDetailPage: No product identifier found.');
    return;
  }

  let fetchType: 'id' | 'key' | 'slug' = 'slug';
  const valueToFetch = identifierValue;

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifierValue,
    )
  ) {
    fetchType = 'id';
  } else if (/^\d{4}$/.test(identifierValue)) {
    fetchType = 'key';
  }

  appLogger.log(
    `ProductDetailPage: Determined fetch type: ${fetchType} for identifier: ${valueToFetch}`,
  );

  await productStore.fetchProduct(
    { type: fetchType, value: valueToFetch },
    { expand: ['categories[*]', 'categories[*].parent'] },
  );
}

onMounted(async () => {
  if (projectSettingsStore.getAvailableCurrencies.length === 0) {
    await projectSettingsStore.fetchProjectSettings();
  }
  loadProductData();
});

watch(
  () => props.identifier,
  (newIdentifier) => {
    if (
      newIdentifier &&
      newIdentifier !== product.value?.id &&
      newIdentifier !== product.value?.key &&
      newIdentifier !== product.value?.slug[currentLocale.value]
    ) {
      loadProductData();
    }
  },
);

const modalResponsiveOptions = ref([
  { breakpoint: '1024px', numVisible: 5 },
  { breakpoint: '768px', numVisible: 3 },
  { breakpoint: '560px', numVisible: 1 },
]);
</script>

<template>
  <div class="product-detail-page container mx-auto px-4 mb-15 flex flex-col">
    <ProgressSpinner v-if="isLoading" aria-label="Loading product" />

    <Message
      v-else-if="errorMessage"
      severity="error"
      :closable="false"
      class="p-4"
      :pt="{
        root: {
          class: 'self-center',
        },
        content: {
          class: 'justify-center',
        },
      }"
      >{{ errorMessage }}</Message
    >

    <div v-else-if="product" class="product-content">
      <Breadcrumb
        :home="breadcrumbs.home"
        :model="breadcrumbs.items"
        class="text-md overflow-hidden text-(--p-breadcrumb-item-color)"
        :pt="{
          list: {
            style: {
              'flex-wrap': 'wrap',
            },
          },
        }"
      >
        <template #item="slotProps">
          <router-link
            v-if="slotProps.item.to && !slotProps.item.disabled"
            v-slot="{ href, navigate, isActive, isExactActive }"
            :to="slotProps.item.to"
            custom
          >
            <a
              :href="href"
              v-bind="slotProps.item.action"
              :class="[
                'p-menuitem-link inline-flex items-center',
                {
                  'router-link-active': isActive,
                  'router-link-exact-active': isExactActive,
                },
              ]"
              @click="navigate"
            >
              <span
                v-if="slotProps.item.icon"
                :class="['p-menuitem-icon', slotProps.item.icon]"
              ></span>
              <span class="p-menuitem-text whitespace-nowrap truncate">{{
                slotProps.item.label
              }}</span>
            </a>
          </router-link>
          <span
            v-else
            :class="[
              'p-menuitem-link',
              'inline-flex items-center',
              { 'text-gray-500 cursor-default': slotProps.item.disabled },
            ]"
          >
            <span
              v-if="slotProps.item.icon"
              :class="['p-menuitem-icon', slotProps.item.icon, 'mr-1']"
            ></span>

            <span class="p-menuitem-text whitespace-nowrap truncate">{{
              slotProps.item.label
            }}</span>
          </span>
        </template>
      </Breadcrumb>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
        <div class="product-images">
          <Galleria
            v-if="galleryImages.length"
            v-model:active-index="currentImageIndex"
            :value="galleryImages"
            :num-visible="productHasMultipleImages ? 4 : 1"
            :show-thumbnails="productHasMultipleImages"
            :show-item-navigators="productHasMultipleImages"
            :show-indicators="
              !productHasMultipleImages && galleryImages.length > 1
            "
            :show-item-navigators-on-hover="productHasMultipleImages"
            :circular="productHasMultipleImages"
            :pt="{
              itemsContainer: 'relative',
              item: 'rounded-lg overflow-hidden shadow-md',
              thumbnailContent:
                'p-0 mt-2 bg-transparent flex justify-center gap-2',
              thumbnailItem:
                'p-1 rounded cursor-pointer opacity-70 hover:opacity-100 transition-opacity',
              thumbnailItemActive: '!opacity-100',
              prevButton: {
                class:
                  '!bg-white/50 hover:!bg-white/80 !text-gray-700 hover:!text-gray-900 rounded-full',
              },
              prevIcon: 'text-xl',
              nextButton: {
                class:
                  '!bg-white/50 hover:!bg-white/80 !text-gray-700 hover:!text-gray-900 rounded-full',
              },
              nextIcon: 'text-xl',
            }"
          >
            <template #item="slotProps">
              <img
                :src="slotProps.item.itemImageSrc"
                :alt="slotProps.item.alt"
                class="w-full max-w-140 h-auto aspect-square object-contain block cursor-pointer"
                @click="
                  openModalGallery(
                    galleryImages.findIndex(
                      (img) => img.itemImageSrc === slotProps.item.itemImageSrc,
                    ),
                  )
                "
              />
            </template>
            <template #thumbnail="slotProps">
              <img
                :src="slotProps.item.thumbnailImageSrc"
                :alt="slotProps.item.alt"
                class="w-20 h-20 object-contain block"
              />
            </template>
          </Galleria>
          <div
            v-else
            class="rounded-lg p-4 text-center text-gray-500 h-64 flex items-center justify-center"
          >
            {{ t('productPage.noImages') }}
          </div>
        </div>

        <div class="product-info">
          <h1
            class="text-3xl lg:text-4xl font-bold mb-3 text-(--p-primary-color)"
          >
            {{ productName }}
          </h1>

          <div class="product-price my-4 text-3xl">
            <template v-if="currentDisplayPrice">
              <span
                v-if="currentDisplayPrice.hasSale"
                class="text-gray-500 line-through mr-3 text-xl"
              >
                {{ currentDisplayPrice.originalFormatted }}
              </span>
              <span
                :class="{
                  'text-(--p-orange-500) font-bold':
                    currentDisplayPrice.hasSale,
                  'text-gray-900 font-bold': !currentDisplayPrice.hasSale,
                }"
              >
                {{
                  currentDisplayPrice.saleFormatted ||
                  currentDisplayPrice.originalFormatted
                }}
              </span>
              <Tag
                v-if="currentDisplayPrice.hasSale"
                :value="t('productPage.saleTag')"
                severity="danger"
                class="ml-3 align-middle"
                :pt="{
                  root: {
                    class: '!text-(--p-orange-600) !bg-(--p-orange-500)/20',
                  },
                }"
              ></Tag>
            </template>
            <span v-else class="text-gray-500">{{
              t('productPage.priceUnavailable')
            }}</span>
          </div>

          <div v-if="availableCurrenciesForSelect.length > 1" class="my-4">
            <label
              for="currency-select"
              class="block text-sm font-medium text-gray-700 mb-1"
              >{{ t('productPage.currencyLabel') }}</label
            >
            <SelectButton
              v-model="selectedCurrency"
              :options="availableCurrenciesForSelect"
              option-label="name"
              option-value="code"
              aria-labelledby="currency-select"
              :allow-empty="false"
              pt:button:class="px-3 py-2 text-sm"
            />
          </div>

          <div v-if="productDescription" class="my-6">
            <h2 class="text-xl font-semibold mb-2 text-gray-800">
              {{ t('productPage.descriptionTitle') }}
            </h2>
            <div
              class="prose max-w-none text-gray-700 leading-relaxed"
              v-html="productDescription"
            ></div>
          </div>

          <div v-if="productAttributes.length" class="my-6">
            <h3 class="text-xl font-semibold mb-4 text-gray-800">
              {{ t('productPage.detailsTitle') }}
            </h3>
            <dl class="divide-y divide-gray-200">
              <div
                v-for="attr in productAttributes"
                :key="attr.name"
                class="py-3 grid grid-cols-[1fr_2fr] gap-4 items-center"
              >
                <dt class="text-sm font-medium text-gray-600">
                  {{ attr.label }}
                </dt>
                <dd class="text-sm text-gray-800">
                  <template v-if="Array.isArray(attr.value)">
                    <div class="flex flex-wrap gap-1">
                      <Tag
                        v-for="(val, index) in attr.value"
                        :key="index"
                        :value="val"
                        severity="info"
                        class="text-xs"
                      ></Tag>
                    </div>
                  </template>
                  <template v-else>
                    {{ attr.value }}
                  </template>
                </dd>
              </div>
            </dl>
          </div>

          <div class="mt-6">
            <Button
              v-if="!productLineItem"
              :label="t('productPage.addToCartButton')"
              icon="pi pi-shopping-cart"
              class="w-full md:w-auto p-button-lg p-button-raised"
              :loading="cartStore.isLoading"
              :disabled="isActionDisabled"
              @click="handleAddToCart"
            />

            <Button
              v-else
              :label="t('productPage.removeFromCartButton')"
              icon="pi pi-trash"
              class="w-full md:w-auto p-button-lg p-button-raised p-button-danger"
              :loading="cartStore.isLoading"
              :disabled="isActionDisabled"
              @click="handleRemoveFromCart"
            />
          </div>
        </div>
      </div>
    </div>

    <Galleria
      v-model:active-index="currentImageIndex"
      v-model:visible="displayModalGallery"
      :value="galleryImages"
      :num-visible="5"
      :responsive-options="modalResponsiveOptions"
      :circular="productHasMultipleImages"
      :full-screen="true"
      :show-item-navigators="productHasMultipleImages"
      :show-thumbnails="false"
      :pt="{
        itemsContainer: 'flex justify-center items-center',
        item: 'flex justify-center items-center h-full',
        closeIcon: 'text-white hover:text-gray-300 text-2xl',
        closeButton:
          'absolute top-4 right-4 z-10 bg-black/30 hover:bg-black/50 rounded-full w-10 h-10 flex items-center justify-center',
        prevButton: {
          class:
            '!bg-white/50 hover:!bg-white/80 !text-gray-700 hover:!text-gray-900 rounded-full',
        },
        prevIcon: 'text-xl',
        nextButton: {
          class:
            '!bg-white/50 hover:!bg-white/80 !text-gray-700 hover:!text-gray-900 rounded-full',
        },
        nextIcon: 'text-xl',
      }"
    >
      <template #item="slotProps">
        <img :src="slotProps.item.itemImageSrc" :alt="slotProps.item.alt" />
      </template>
    </Galleria>
  </div>
</template>
