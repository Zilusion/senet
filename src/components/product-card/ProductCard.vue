<script setup lang="ts">
import Card from 'primevue/card';
import { Button } from 'primevue';
import type { ProductProjection } from '@commercetools/platform-sdk';
import { useUserPreferencesStore } from '@/stores/userPreferencesStore';
import { useRouter } from 'vue-router';
import { useCartStore } from '@/stores/cartStore';

import { computed } from 'vue';
import appLogger from '@/utils/logger';
import { showSuccessToast, showErrorToast } from '@/utils/toaster';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();

const props = defineProps<{
  productInfo: ProductProjection;
  currentCategory?: string;
}>();

const router = useRouter();
const userPreferencesStore = useUserPreferencesStore();
const cartStore = useCartStore();

const isInCart = computed(() =>
  cartStore.cart?.lineItems.some(
    (item) =>
      item.productId === props.productInfo.id &&
      item.variant.id === props.productInfo.masterVariant.id,
  ),
);

function convertCardInfo(productInfo: ProductProjection) {
  const prices = productInfo.masterVariant.prices;

  if (!prices) {
    return;
  }

  const language = userPreferencesStore.currentLanguage;
  const currencyCode = language === 'ru' ? 'RUB' : 'EUR';
  const selectedPrice =
    prices.find((price) => price.value.currencyCode === currencyCode) ||
    prices[0];
  const formatter = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: selectedPrice.value.currencyCode,
  });
  const price = formatter.format(selectedPrice.value.centAmount / 100);
  const discounted = selectedPrice.discounted;

  let newPrice;

  if (discounted) {
    newPrice = formatter.format(discounted.value.centAmount / 100);
  }

  const cardInfo = {
    image: productInfo.masterVariant.images
      ? productInfo.masterVariant.images[0].url
      : '/images/no-image.png',
    name:
      productInfo.name[language] || productInfo.name.en || productInfo.name.ru,
    description: productInfo.description
      ? productInfo.description[language] ||
        productInfo.description.en ||
        productInfo.description.ru
      : 'No description',
    identifier: productInfo.slug?.en || productInfo.key || productInfo.id,
    price: price,
    discountedPrice: newPrice ? newPrice : false,
  };

  return cardInfo;
}

function navigate(identifier: string) {
  router.push({
    name: 'Product',
    params: { identifier },
    query: { category: props.currentCategory },
  });
}

const cardInfo = computed(() => convertCardInfo(props.productInfo));

async function addToCart() {
  try {
    await cartStore.addLineItem(
      props.productInfo.id,
      props.productInfo.masterVariant.id,
      1,
    );
    showSuccessToast(t('productPage.addSuccess'));
  } catch (e) {
    appLogger.error('Failed to add to cart:', e);
    showErrorToast(t('productPage.addError'));
  }
}
</script>

<template>
  <div
    v-if="cardInfo"
    class="relative cursor-pointer hover:scale-102 transition duration-300 easy-in-out"
    @click="navigate(cardInfo.identifier)"
  >
    <Card
      class="w-80"
      pt:title:class="min-h-14 flex items-end"
      pt:header:class="min-h-77"
    >
      <template #header>
        <img alt="product image" :src="cardInfo.image" class="p-5 w-full" />
      </template>
      <template #title>
        <h2 class="text-lg font-semibold text-(--p-primary-color) line-clamp-2">
          {{ cardInfo.name }}
        </h2>
      </template>
      <template #subtitle>
        <h4 class="text-xs line-clamp-2">
          {{ cardInfo.description }}
        </h4>
      </template>
      <template #content>
        <div v-if="cardInfo.discountedPrice" class="flex gap-x-2">
          <p class="text-xl font-bold py-2 line-through opacity-40">
            {{ cardInfo.price }}
          </p>
          <p class="text-xl font-bold py-2 text-(--p-orange-500)">
            {{ cardInfo.discountedPrice }}
          </p>
        </div>
        <p v-else class="text-xl font-bold py-2">
          {{ cardInfo.price }}
        </p>
      </template>
      <template #footer>
        <Button
          v-if="cardInfo"
          :label="isInCart ? 'In cart' : 'Add to cart'"
          severity="primary"
          outlined
          class="w-full"
          :disabled="isInCart"
          @click.stop="addToCart"
        />
        <Button
          v-else
          label="Add to cart"
          severity="secondary"
          outlined
          class="w-full"
          disabled
        />
      </template>
    </Card>
  </div>
</template>
