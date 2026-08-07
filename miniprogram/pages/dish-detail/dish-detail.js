const db = wx.cloud.database()
const { normalizeDish } = require('../../utils/dish')
const {
  addCartItem,
  getCartSummary,
  getStoredCart,
  saveStoredCart
} = require('../../utils/cart')
const {
  isScanCancelled,
  normalizeTableNumber,
  scanTableCodeFromCamera
} = require('../../utils/tableCode')

function clone(data) {
  return JSON.parse(JSON.stringify(data || {}))
}

Page({
  data: {
    dishId: '',
    dish: null,
    loading: true,
    errorMessage: '',
    selectedSkuId: '',
    selectedTags: {},
    quantity: 1,
    currentPriceText: '0.00',
    totalPriceText: '0.00',
    tableNumber: '',
    shareImageUrl: '',
    statusBarHeight: 20,
    navBarHeight: 44
  },

  onLoad(options) {
    this.initNavigationLayout()

    const dishId = decodeURIComponent(options.id || options.dishId || '').trim()
    const tableNumber = normalizeTableNumber(options.tableNumber)

    wx.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    })

    this.setData({
      dishId,
      tableNumber
    })

    if (!dishId) {
      this.setData({
        loading: false,
        errorMessage: '没有找到这道菜'
      })
      return
    }

    this.loadDish()
  },

  initNavigationLayout() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    let navBarHeight = 44

    try {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.height) {
        navBarHeight = Math.max(
          44,
          (menuButton.top - statusBarHeight) * 2 + menuButton.height
        )
      }
    } catch (err) {
      console.warn('获取胶囊位置失败，使用默认导航尺寸', err)
    }

    this.setData({
      statusBarHeight,
      navBarHeight
    })
  },

  async loadDish() {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    try {
      const res = await db.collection('dish').doc(this.data.dishId).get()
      const dish = normalizeDish(res.data || {})

      if (!dish._id || dish.status !== 1) {
        this.setData({
          loading: false,
          errorMessage: '这道菜暂时无法购买'
        })
        return
      }

      const selectedSku = dish.enabledSkus[0] || null
      const selectedTags = this.buildInitialTags(dish)
      const currentPrice = selectedSku ? selectedSku.price : dish.price

      this.setData({
        dish,
        loading: false,
        selectedSkuId: selectedSku ? selectedSku.id : '',
        selectedTags,
        quantity: 1,
        currentPriceText: Number(currentPrice).toFixed(2),
        totalPriceText: Number(currentPrice).toFixed(2)
      })

      wx.setNavigationBarTitle({
        title: dish.name || '菜品详情'
      })
      this.prepareShareImage(dish.image)
    } catch (err) {
      console.error('加载菜品详情失败', err)
      this.setData({
        loading: false,
        errorMessage: '菜品加载失败，请稍后重试'
      })
    }
  },

  buildInitialTags(dish) {
    const selectedTags = {}

    ;(dish.tags || []).forEach(tag => {
      if (tag.type === 'multiple') {
        selectedTags[tag.id] = []
      }
    })

    return selectedTags
  },

  async prepareShareImage(imageUrl) {
    if (!imageUrl) {
      return
    }

    if (!imageUrl.startsWith('cloud://')) {
      this.setData({
        shareImageUrl: imageUrl
      })
      return
    }

    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: [imageUrl]
      })
      const file = res.fileList && res.fileList[0]
      if (file && file.tempFileURL) {
        this.setData({
          shareImageUrl: file.tempFileURL
        })
      }
    } catch (err) {
      console.error('准备分享图片失败', err)
    }
  },

  retryLoad() {
    this.loadDish()
  },

  previewImage(e) {
    const dish = this.data.dish || {}
    const images = Array.isArray(dish.images) && dish.images.length > 0
      ? dish.images
      : (dish.image ? [dish.image] : [])
    const imageUrl = e && e.currentTarget
      ? e.currentTarget.dataset.src
      : images[0]

    if (!imageUrl || images.length === 0) {
      return
    }

    wx.previewImage({
      current: imageUrl,
      urls: images
    })
  },

  selectSku(e) {
    const skuId = e.currentTarget.dataset.id
    const sku = (this.data.dish.enabledSkus || []).find(item => item.id === skuId)
    if (!sku) {
      return
    }

    this.setData({
      selectedSkuId: skuId,
      currentPriceText: sku.priceText,
      totalPriceText: (sku.price * this.data.quantity).toFixed(2)
    })
  },

  selectSingleTag(e) {
    const { tagId, option } = e.currentTarget.dataset
    this.setData({
      [`selectedTags.${tagId}`]: option
    })
  },

  toggleMultipleTag(e) {
    const { tagId, option } = e.currentTarget.dataset
    const selectedTags = clone(this.data.selectedTags)
    const values = Array.isArray(selectedTags[tagId])
      ? selectedTags[tagId].slice()
      : []
    const optionIndex = values.indexOf(option)

    if (optionIndex > -1) {
      values.splice(optionIndex, 1)
    } else {
      values.push(option)
    }

    selectedTags[tagId] = values
    this.setData({
      selectedTags
    })
  },

  updateQuantity(quantity) {
    const sku = (this.data.dish.enabledSkus || [])
      .find(item => item.id === this.data.selectedSkuId)
    const price = sku ? sku.price : 0

    this.setData({
      quantity,
      totalPriceText: (price * quantity).toFixed(2)
    })
  },

  decreaseQuantity() {
    if (this.data.quantity > 1) {
      this.updateQuantity(this.data.quantity - 1)
    }
  },

  increaseQuantity() {
    this.updateQuantity(this.data.quantity + 1)
  },

  getTagLabels() {
    const labels = []

    ;(this.data.dish.tags || []).forEach(tag => {
      const value = this.data.selectedTags[tag.id]
      if (Array.isArray(value)) {
        labels.push(...value)
      } else if (value) {
        labels.push(value)
      }
    })

    return labels
  },

  validateSelection() {
    const selectedSku = (this.data.dish.enabledSkus || [])
      .find(item => item.id === this.data.selectedSkuId)

    if (!selectedSku) {
      wx.showToast({
        title: '请选择规格',
        icon: 'none'
      })
      return null
    }

    const missingTag = (this.data.dish.tags || []).find(tag => {
      if (!tag.required) {
        return false
      }

      const value = this.data.selectedTags[tag.id]
      return !value || (Array.isArray(value) && value.length === 0)
    })

    if (missingTag) {
      wx.showToast({
        title: `请选择${missingTag.name}`,
        icon: 'none'
      })
      return null
    }

    return selectedSku
  },

  addToCart() {
    const selectedSku = this.validateSelection()
    if (!selectedSku) {
      return
    }

    const cart = addCartItem(
      getStoredCart(),
      this.data.dish,
      selectedSku,
      this.data.selectedTags,
      this.getTagLabels(),
      this.data.quantity
    )

    saveStoredCart(cart)

    wx.showToast({
      title: '已加入购物车',
      icon: 'success',
      duration: 900
    })

    setTimeout(() => {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      })
    }, 500)
  },

  buyNow() {
    const selectedSku = this.validateSelection()
    if (!selectedSku) {
      return
    }

    const cart = addCartItem(
      {},
      this.data.dish,
      selectedSku,
      this.data.selectedTags,
      this.getTagLabels(),
      this.data.quantity
    )
    const summary = getCartSummary(cart)

    if (!this.data.tableNumber) {
      this.requestTableCodeForCheckout(cart, summary)
      return
    }

    this.navigateToSettle(cart, summary)
  },

  requestTableCodeForCheckout(cart, summary) {
    wx.showModal({
      title: '请先扫描桌码',
      content: '订单需要绑定当前桌码，扫码成功后才能进入订单确认。',
      confirmText: '去扫码',
      cancelText: '暂不购买',
      success: (result) => {
        if (result.confirm) {
          this.scanTableCodeForCheckout(cart, summary)
        }
      }
    })
  },

  async scanTableCodeForCheckout(cart, summary) {
    try {
      const tableNumber = await scanTableCodeFromCamera()

      this.setData({
        tableNumber
      }, () => {
        wx.showToast({
          title: `已绑定${tableNumber}号桌`,
          icon: 'success'
        })
        this.navigateToSettle(cart, summary)
      })
    } catch (err) {
      if (isScanCancelled(err)) {
        return
      }

      console.error('扫码失败', err)
      wx.showToast({
        title: err && err.code === 'INVALID_TABLE_CODE' ? '未能识别桌码' : '扫码失败',
        icon: 'none'
      })
    }
  },

  navigateToSettle(cart, summary) {
    if (!this.data.tableNumber) {
      this.requestTableCodeForCheckout(cart, summary)
      return
    }

    try {
      wx.setStorageSync('settleCartData', {
        cart,
        totalPrice: summary.totalPrice,
        tableNumber: this.data.tableNumber
      })

      wx.navigateTo({
        url: '/pages/settle/settle',
        fail: (err) => {
          console.error('打开结算页失败', err)
          wx.removeStorageSync('settleCartData')
          wx.showToast({
            title: '打开结算页失败',
            icon: 'none'
          })
        }
      })
    } catch (err) {
      console.error('立即购买失败', err)
      wx.showToast({
        title: '打开结算页失败',
        icon: 'none'
      })
    }
  },

  goToMenu() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        this.goToMenu()
      }
    })
  },

  onShareAppMessage() {
    const dish = this.data.dish

    if (!dish) {
      return {
        title: '发现一道好菜',
        path: '/pages/index/index'
      }
    }

    return {
      title: `${dish.name}｜${dish.hasMultipleSkus ? `${dish.priceText}元起` : `${dish.priceText}元`}`,
      path: `/pages/dish-detail/dish-detail?id=${encodeURIComponent(dish._id)}`,
      imageUrl: this.data.shareImageUrl || dish.image || ''
    }
  },

  onShareTimeline() {
    const dish = this.data.dish

    if (!dish) {
      return {
        title: '发现一道好菜',
        query: ''
      }
    }

    return {
      title: `${dish.name}｜${dish.hasMultipleSkus ? `${dish.priceText}元起` : `${dish.priceText}元`}`,
      query: `id=${encodeURIComponent(dish._id)}`,
      imageUrl: this.data.shareImageUrl || dish.image || ''
    }
  }
})
