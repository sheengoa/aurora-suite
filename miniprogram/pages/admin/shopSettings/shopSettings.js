const db = require('../../../utils/adminDb')
const {
  DEFAULT_SHOP_SETTINGS,
  loadShopSettings,
  saveShopSettings
} = require('../../../utils/shopSettings')

Page({
  data: {
    shopName: DEFAULT_SHOP_SETTINGS.shopName,
    welcomeText: DEFAULT_SHOP_SETTINGS.welcomeText,
    isOpen: DEFAULT_SHOP_SETTINGS.isOpen,
    loading: false,
    saving: false
  },

  onLoad() {
    this.loadSettings()
  },

  async loadSettings() {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const settings = await loadShopSettings(db)
      this.setData(settings)
    } finally {
      this.setData({ loading: false })
    }
  },

  onShopNameInput(e) {
    this.setData({
      shopName: e.detail.value
    })
  },

  onWelcomeTextInput(e) {
    this.setData({
      welcomeText: e.detail.value
    })
  },

  onOpenChange(e) {
    this.setData({ isOpen: Boolean(e.detail.value) })
  },

  async saveSettings() {
    if (this.data.saving) {
      return
    }

    const shopName = String(this.data.shopName || '').trim()
    const welcomeText = String(this.data.welcomeText || '').trim()

    if (!shopName) {
      wx.showToast({
        title: '请输入店铺名称',
        icon: 'none'
      })
      return
    }

    if (!welcomeText) {
      wx.showToast({
        title: '请输入欢迎词',
        icon: 'none'
      })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    try {
      const settings = await saveShopSettings(db, {
        shopName,
        welcomeText,
        isOpen: this.data.isOpen
      })

      this.setData(settings)
      wx.showToast({
        title: '店铺设置已保存',
        icon: 'success'
      })
    } catch (err) {
      console.error('保存店铺设置失败', err)
      wx.showToast({
        title: err.message || '保存失败，请重试',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  }
})
