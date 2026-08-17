import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const sourceRoot =
  process.env.SENET_SOURCE_ROOT || 'H:\\Проекты\\NodeJs\\Extractionator';
const sourceCatalogPath = path.join(
  sourceRoot,
  'games_processed_for_ct_v5.json',
);
const sourceCategoriesPath = path.join(sourceRoot, 'categories_for_import.csv');
const sourceImagesPath = path.join(sourceRoot, 'downloaded_images');
const outputRoot = path.join(repositoryRoot, 'public', 'demo');
const outputImagesPath = path.join(outputRoot, 'products');
const outputCatalogPath = path.join(outputRoot, 'catalog.json');
const productLimit = 200;

for (const requiredPath of [
  sourceCatalogPath,
  sourceCategoriesPath,
  sourceImagesPath,
]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`Required demo source is missing: ${requiredPath}`);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, cells[index] || '']),
    ),
  );
}

function localized(value = {}) {
  const en = value.en?.trim() || value.ru?.trim() || '';
  const ru = value.ru?.trim() || value.en?.trim() || '';
  return { en, ru };
}

function filenameFromUrl(url) {
  return decodeURIComponent(new URL(url).pathname.split('/').pop());
}

function createMoney(currencyCode, centAmount) {
  return {
    type: 'centPrecision',
    currencyCode,
    centAmount,
    fractionDigits: 2,
  };
}

const attributeLabels = {
  'players-min': { en: 'Minimum players', ru: 'Минимум игроков' },
  'players-max': { en: 'Maximum players', ru: 'Максимум игроков' },
  'playing-time-min': { en: 'Minimum play time', ru: 'Минимальное время игры' },
  'playing-time-max': {
    en: 'Maximum play time',
    ru: 'Максимальное время игры',
  },
  'age-recommended': { en: 'Recommended age', ru: 'Рекомендуемый возраст' },
  publisher: { en: 'Publisher', ru: 'Издатель' },
  'country-of-origin': { en: 'Country of origin', ru: 'Страна производства' },
  weight: { en: 'Weight, kg', ru: 'Вес, кг' },
};

const productType = {
  typeId: 'product-type',
  id: 'demo-board-game',
  obj: {
    id: 'demo-board-game',
    version: 1,
    name: 'Board game',
    description: 'Board games and accessories',
    classifier: 'Complex',
    createdAt: '2025-05-01T00:00:00.000Z',
    lastModifiedAt: '2025-05-01T00:00:00.000Z',
    attributes: Object.entries(attributeLabels).map(([name, label]) => ({
      type: {
        name:
          name === 'publisher' || name === 'country-of-origin'
            ? 'ltext'
            : 'number',
      },
      name,
      label,
      isRequired: false,
      attributeConstraint: 'None',
      inputHint: 'SingleLine',
      isSearchable: true,
    })),
  },
};

const rawProducts = JSON.parse(fs.readFileSync(sourceCatalogPath, 'utf8'));
const rawCategories = parseCsv(fs.readFileSync(sourceCategoriesPath, 'utf8'));

const selectedProducts = [];
for (const product of rawProducts) {
  if (!product.mainImageUrl || !product.price?.rub) continue;
  const mainImage = path.join(
    sourceImagesPath,
    filenameFromUrl(product.mainImageUrl),
  );
  if (!fs.existsSync(mainImage)) continue;

  selectedProducts.push(product);
  if (selectedProducts.length === productLimit) break;
}

if (selectedProducts.length !== productLimit) {
  throw new Error(
    `Expected ${productLimit} products with local images, found ${selectedProducts.length}`,
  );
}

const requiredCategoryKeys = new Set(['board-games']);
for (const product of selectedProducts) {
  for (const key of product.categoryKeysCt || []) requiredCategoryKeys.add(key);
  if (product.mainCategoryKeyCt)
    requiredCategoryKeys.add(product.mainCategoryKeyCt);
}

let changed = true;
while (changed) {
  changed = false;
  for (const category of rawCategories) {
    if (
      requiredCategoryKeys.has(category.key) &&
      category['parent.key'] &&
      !requiredCategoryKeys.has(category['parent.key'])
    ) {
      requiredCategoryKeys.add(category['parent.key']);
      changed = true;
    }
  }
}

const categoryRows = rawCategories.filter((category) =>
  requiredCategoryKeys.has(category.key),
);
const categoryObjects = new Map();

for (const category of categoryRows.filter((item) => !item['parent.key'])) {
  categoryObjects.set(category.key, {
    id: `demo-category-${category.key}`,
    version: 1,
    key: category.key,
    name: localized({ en: category['name.en'], ru: category['name.ru'] }),
    slug: localized({ en: category['slug.en'], ru: category['slug.en'] }),
    description: localized({
      en: category['description.en'],
      ru: category['description.ru'],
    }),
    orderHint: category.orderHint || '0.01',
    ancestors: [],
    createdAt: '2025-05-01T00:00:00.000Z',
    lastModifiedAt: '2025-05-01T00:00:00.000Z',
  });
}

for (const category of categoryRows.filter((item) => item['parent.key'])) {
  const parent = categoryObjects.get(category['parent.key']);
  if (!parent) continue;
  categoryObjects.set(category.key, {
    id: `demo-category-${category.key}`,
    version: 1,
    key: category.key,
    name: localized({ en: category['name.en'], ru: category['name.ru'] }),
    slug: localized({ en: category['slug.en'], ru: category['slug.en'] }),
    description: localized({
      en: category['description.en'],
      ru: category['description.ru'],
    }),
    orderHint: category.orderHint || '0.01',
    ancestors: [{ typeId: 'category', id: parent.id, obj: parent }],
    parent: { typeId: 'category', id: parent.id, obj: parent },
    createdAt: '2025-05-01T00:00:00.000Z',
    lastModifiedAt: '2025-05-01T00:00:00.000Z',
  });
}

fs.rmSync(outputImagesPath, { recursive: true, force: true });
fs.mkdirSync(outputImagesPath, { recursive: true });

let copiedImageBytes = 0;
const products = selectedProducts.map((source, index) => {
  const imageUrls = [
    source.mainImageUrl,
    ...(source.additionalImages || []).slice(0, 2),
  ];
  const images = [];

  for (const imageUrl of imageUrls) {
    const filename = filenameFromUrl(imageUrl);
    const sourceImage = path.join(sourceImagesPath, filename);
    if (!fs.existsSync(sourceImage)) continue;
    const outputImage = path.join(outputImagesPath, filename);
    if (!fs.existsSync(outputImage)) {
      fs.copyFileSync(sourceImage, outputImage);
      copiedImageBytes += fs.statSync(sourceImage).size;
    }
    images.push({
      url: `/demo/products/${encodeURIComponent(filename)}`,
      label: localized(source.name).en,
    });
  }

  const rubles = Number(source.price.rub);
  const amounts = {
    EUR: Math.round(rubles),
    RUB: Math.round(rubles * 100),
    USD: Math.round((rubles / 90) * 100),
  };
  const hasDiscount = index % 7 === 0;
  const prices = Object.entries(amounts).map(([currencyCode, centAmount]) => ({
    id: `demo-price-${source.key}-${currencyCode.toLowerCase()}`,
    value: createMoney(currencyCode, centAmount),
    ...(hasDiscount
      ? {
          discounted: {
            value: createMoney(currencyCode, Math.round(centAmount * 0.85)),
            discount: {
              typeId: 'product-discount',
              id: 'demo-product-discount',
            },
          },
        }
      : {}),
  }));

  const categoryKeys = [
    ...(source.categoryKeysCt || []),
    source.mainCategoryKeyCt,
  ].filter(Boolean);
  const categories = [...new Set(categoryKeys)]
    .map((key) => categoryObjects.get(key))
    .filter(Boolean)
    .map((category) => ({
      typeId: 'category',
      id: category.id,
      obj: category,
    }));
  const fallbackCategory = categoryObjects.get('board-games');

  const attributes = Object.entries(source.attributes || {})
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    )
    .map(([name, value]) => ({
      name,
      value:
        typeof value === 'object' && !Array.isArray(value)
          ? localized(value)
          : value,
    }));
  const createdAt = new Date(Date.UTC(2025, 4, 1, 0, 0, index)).toISOString();

  return {
    id: `demo-product-${source.key}`,
    version: 1,
    key: source.key,
    productType,
    name: localized(source.name),
    slug: localized(source.slug),
    description: localized(source.description),
    categories:
      categories.length > 0
        ? categories
        : [
            {
              typeId: 'category',
              id: fallbackCategory.id,
              obj: fallbackCategory,
            },
          ],
    categoryOrderHints: {},
    masterVariant: {
      id: 1,
      sku: source.sku || source.variantKey || `${source.key}-1`,
      key: source.variantKey || `${source.key}-1`,
      prices,
      images,
      attributes,
      assets: [],
    },
    variants: [],
    searchKeywords: {},
    hasStagedChanges: false,
    published: true,
    createdAt,
    lastModifiedAt: createdAt,
  };
});

const categories = [...categoryObjects.values()].sort((left, right) =>
  left.orderHint.localeCompare(right.orderHint),
);
const output = {
  metadata: {
    mode: 'portfolio-demo',
    productCount: products.length,
    generatedAt: new Date().toISOString(),
  },
  categories,
  products,
};

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(outputCatalogPath, JSON.stringify(output));

console.log(
  JSON.stringify(
    {
      catalog: outputCatalogPath,
      products: products.length,
      categories: categories.length,
      images: fs.readdirSync(outputImagesPath).length,
      imageMegabytes: Number((copiedImageBytes / 1024 / 1024).toFixed(1)),
    },
    null,
    2,
  ),
);
