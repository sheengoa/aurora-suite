const CART_STORAGE_KEY = 'dishCart'

function getStoredCart() {
  try {
    const cart = wx.getStorageSync(CART_STORAGE_KEY)
    if (cart && typeof cart === 'object' && !Array.isArray(cart)) {
      return cart
    }
  } catch (err) {
    console.error('读取购物车失败', err)
  }

  return {}
}

function saveStoredCart(cart) {
  try {
    wx.setStorageSync(CART_STORAGE_KEY, cart || {})
  } catch (err) {
    console.error('保存购物车失败', err)
  }
}

function generateCartKey(dishId, skuId, tags) {
  const tagKeys = tags ? Object.keys(tags) : []
  if (tagKeys.length === 0) {
    return `${dishId}_${skuId}`
  }

  const tagStr = tagKeys.sort().map(key => {
    const value = tags[key]
    const normalizedValue = Array.isArray(value)
      ? value.slice().sort().join(',')
      : value
    return `${key}:${normalizedValue}`
  }).join('|')

  return `${dishId}_${skuId}_${tagStr}`
}

function addCartItem(cart, goods, sku, tags, tagLabels, count = 1) {
  const nextCart = {
    ...(cart || {})
  }
  const cartKey = generateCartKey(goods._id, sku.id, tags)

  if (nextCart[cartKey]) {
    nextCart[cartKey] = {
      ...nextCart[cartKey],
      count: Number(nextCart[cartKey].count || 0) + count
    }
  } else {
    nextCart[cartKey] = {
      info: goods,
      sku: {
        id: sku.id,
        name: sku.name,
        price: sku.price
      },
      count,
      tags: JSON.parse(JSON.stringify(tags || {})),
      tagLabels: (tagLabels || []).slice(),
      dishId: goods._id
    }
  }

  return nextCart
}

function getCartSummary(cart) {
  let count = 0
  let totalPrice = 0

  Object.keys(cart || {}).forEach(cartKey => {
    const item = cart[cartKey]
    if (!item || !item.count) {
      return
    }

    const unitPrice = item.sku ? Number(item.sku.price) : Number(item.info.price)
    count += Number(item.count)
    totalPrice += (Number.isNaN(unitPrice) ? 0 : unitPrice) * Number(item.count)
  })

  return {
    count,
    totalPrice,
    totalPriceText: totalPrice.toFixed(2)
  }
}

module.exports = {
  addCartItem,
  generateCartKey,
  getCartSummary,
  getStoredCart,
  saveStoredCart
}
