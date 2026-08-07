function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const num = Number(value)
  return Number.isNaN(num) ? fallback : num
}

function normalizeSkus(dish = {}) {
  const source = Array.isArray(dish.skus) && dish.skus.length > 0
    ? dish.skus
    : [{
      id: 'default',
      name: '默认规格',
      price: dish.price,
      status: 1,
      sort: 0
    }]

  return source.map((sku, index) => {
    const price = normalizeNumber(sku.price, normalizeNumber(dish.price, 0))

    return {
      id: sku.id || `sku_${index + 1}`,
      name: sku.name || (index === 0 ? '默认规格' : `规格${index + 1}`),
      price,
      priceText: price.toFixed(2),
      status: sku.status === 0 ? 0 : 1,
      sort: Number(sku.sort) || index
    }
  }).sort((a, b) => a.sort - b.sort)
}

function normalizeImages(dish = {}) {
  const images = []
  const source = []

  if (dish.image) {
    source.push(dish.image)
  }
  if (Array.isArray(dish.images)) {
    source.push(...dish.images)
  }

  source.forEach(image => {
    if (typeof image === 'string' && image.trim() && !images.includes(image)) {
      images.push(image)
    }
  })

  return images.slice(0, 9)
}

function normalizeDish(dish = {}) {
  const skus = normalizeSkus(dish)
  const images = normalizeImages(dish)
  const enabledSkus = skus.filter(sku => sku.status === 1)
  const saleSkus = enabledSkus.length > 0 ? enabledSkus : skus
  const baseSku = saleSkus.slice().sort((a, b) => a.price - b.price)[0] || {
    id: 'default',
    name: '默认规格',
    price: normalizeNumber(dish.price, 0),
    status: 1,
    sort: 0
  }

  return {
    ...dish,
    images,
    image: images[0] || '',
    skus,
    enabledSkus,
    price: baseSku.price,
    priceText: Number(baseSku.price).toFixed(2),
    skuSummary: enabledSkus.length > 1
      ? `${enabledSkus.length}个规格`
      : (enabledSkus[0] ? enabledSkus[0].name : '暂无可售规格'),
    hasMultipleSkus: enabledSkus.length > 1,
    hasSaleSku: enabledSkus.length > 0
  }
}

module.exports = {
  normalizeDish,
  normalizeImages,
  normalizeNumber,
  normalizeSkus
}
