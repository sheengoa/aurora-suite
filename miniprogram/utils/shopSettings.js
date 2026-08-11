const DEFAULT_SHOP_SETTINGS = {
  shopName: '小店点餐',
  welcomeText: '欢迎光临本店，很高兴为您服务。',
  isOpen: true
}

function normalizeText(value, fallback, maxLength) {
  const text = String(value || '').trim()
  return (text || fallback).slice(0, maxLength)
}

function normalizeShopSettings(settings = {}) {
  return {
    shopName: normalizeText(
      settings.shopName,
      DEFAULT_SHOP_SETTINGS.shopName,
      20
    ),
    welcomeText: normalizeText(
      settings.welcomeText,
      DEFAULT_SHOP_SETTINGS.welcomeText,
      48
    ),
    isOpen: settings.isOpen !== false
  }
}

async function loadShopSettings(db) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'getShopSettings'
    })
    return normalizeShopSettings(res.result && res.result.success ? res.result.data : {})
  } catch (err) {
    console.warn('读取店铺设置失败，使用默认配置', err)
    return { ...DEFAULT_SHOP_SETTINGS }
  }
}

async function saveShopSettings(db, settings) {
  const normalized = normalizeShopSettings(settings)
  const res = await db.collection('admin').limit(1).get()
  const admin = (res.data || [])[0]

  if (!admin || !admin._id) {
    throw new Error('管理员配置不存在')
  }

  await db.collection('admin').doc(admin._id).update({
    data: {
      ...normalized,
      updateTime: db.serverDate()
    }
  })

  return normalized
}

module.exports = {
  DEFAULT_SHOP_SETTINGS,
  normalizeShopSettings,
  loadShopSettings,
  saveShopSettings
}
