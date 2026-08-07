// pages/settle/settle.js
const app = getApp()
const db = wx.cloud.database()
const {
  isScanCancelled,
  normalizeTableNumber,
  scanTableCodeFromCamera
} = require('../../utils/tableCode')

Page({
  data: {
    orderGoods: [],
    totalPrice: 0,
    finalPrice: 0,
    orderType: 'dineIn',
    tableNumber: '',
    remark: '',
    payMethod: 'balance',
    userInfo: null,
    userBalance: 0,
    submitting: false,
    canSubmit: false,
    showAuthModal: false,
    savedPayMethod: null
  },

  onLoad() {
    this.loadCartData()
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
    this.updateCanSubmit()
  },

  loadCartData() {
    try {
      const cartData = wx.getStorageSync('settleCartData')
      if (!cartData) {
        wx.showToast({
          title: '购物车为空',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }

      const goodsList = []
      for (let cartKey in cartData.cart) {
        const item = cartData.cart[cartKey]
        let tagsArray = []

        if (item.tagLabels && Array.isArray(item.tagLabels)) {
          tagsArray = item.tagLabels
        } else if (item.tags && typeof item.tags === 'object') {
          Object.keys(item.tags).forEach(tagId => {
            const value = item.tags[tagId]
            if (Array.isArray(value)) {
              tagsArray.push(...value)
            } else if (value) {
              tagsArray.push(value)
            }
          })
        }

        const sku = item.sku || {
          id: 'default',
          name: '默认规格',
          price: item.info.price
        }
        const unitPrice = Number(sku.price || item.info.price || 0)
        const count = Number(item.count || 0)
        const subtotal = (unitPrice * count).toFixed(2)

        goodsList.push({
          cartKey,
          dishId: item.dishId || item.info._id,
          dishName: item.info.name,
          dishImage: item.info.image,
          skuId: sku.id || 'default',
          skuName: sku.name || '默认规格',
          price: unitPrice,
          count,
          tags: tagsArray,
          subtotal
        })
      }

      const tableNumber = normalizeTableNumber(cartData.tableNumber)
      const totalPrice = Number(cartData.totalPrice) || 0

      this.setData({
        orderGoods: goodsList,
        totalPrice,
        finalPrice: totalPrice,
        tableNumber,
        orderType: 'dineIn'
      })

      wx.removeStorageSync('settleCartData')
      this.updateCanSubmit()
      this.updatePayMethod()

      if (!tableNumber) {
        this.requestTableCode()
      }
    } catch (err) {
      console.error('加载购物车数据失败', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async loadUserInfo() {
    try {
      const userInfo = app.globalData.userInfo
      if (userInfo) {
        this.setData({
          userInfo,
          userBalance: userInfo.balance || 0
        })
        this.updatePayMethod()
        this.updateCanSubmit()
      } else {
        await this.loadUserInfoFromDB()
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  },

  async loadUserInfoFromDB(options = {}) {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({
        _openid: openid
      }).get()

      if (res.data && res.data.length > 0) {
        const user = res.data[0]
        if (typeof user.balance === 'undefined') {
          user.balance = 0
        }

        this.setData({
          userInfo: user,
          userBalance: user.balance || 0
        })

        app.globalData.userInfo = user

        if (!options.skipUpdatePayMethod) {
          this.updatePayMethod()
        }
        this.updateCanSubmit()
      }
    } catch (err) {
      console.error('从数据库加载用户信息失败', err)
    }
  },

  selectOrderType(e) {
    const orderType = e.currentTarget.dataset.value
    this.setData({ orderType })
    this.updateCanSubmit()
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  requestTableCode() {
    wx.showModal({
      title: '请先扫描桌码',
      content: '每笔订单都需要绑定桌码，扫码后才能提交订单。',
      confirmText: '去扫码',
      cancelText: '稍后',
      success: (result) => {
        if (result.confirm) {
          this.scanTableCode()
        }
      }
    })
  },

  async scanTableCode() {
    try {
      const tableNumber = await scanTableCodeFromCamera()

      this.setData({
        tableNumber
      }, () => {
        this.syncTableNumberToSourcePages(tableNumber)
        this.updateCanSubmit()
        wx.showToast({
          title: `已绑定${tableNumber}号桌`,
          icon: 'success'
        })
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

  syncTableNumberToSourcePages(tableNumber) {
    const pages = getCurrentPages()

    pages.forEach(page => {
      if (
        page &&
        typeof page.setData === 'function' &&
        (page.route === 'pages/index/index' || page.route === 'pages/dish-detail/dish-detail')
      ) {
        page.setData({
          tableNumber
        })
      }
    })
  },

  selectPayMethod(e) {
    const payMethod = e.currentTarget.dataset.value

    if (payMethod === 'balance' && this.data.userBalance < this.data.totalPrice) {
      wx.showToast({
        title: '余额不足，已切换为微信支付',
        icon: 'none',
        duration: 2000
      })
      this.updateFinalPrice('wechat')
      return
    }

    this.updateFinalPrice(payMethod)
  },

  updateFinalPrice(payMethod) {
    this.setData({
      payMethod,
      finalPrice: Number(this.data.totalPrice) || 0
    })
  },

  updatePayMethod() {
    const { userBalance, totalPrice } = this.data
    if (userBalance >= totalPrice) {
      this.updateFinalPrice('balance')
    } else {
      this.updateFinalPrice('wechat')
    }
  },

  updateCanSubmit() {
    const { tableNumber, orderGoods } = this.data
    let canSubmit = true

    if (!orderGoods || orderGoods.length === 0) {
      canSubmit = false
    }

    if (!tableNumber) {
      canSubmit = false
    }

    this.setData({ canSubmit })
  },

  async submitOrder() {
    if (this.data.submitting) {
      return
    }

    if (!this.data.tableNumber) {
      this.requestTableCode()
      return
    }

    if (!this.data.canSubmit) {
      return
    }

    try {
      await this.loadUserInfoFromDB()
    } catch (err) {
      console.error('加载用户信息失败', err)
    }

    const userInfo = this.data.userInfo
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      this.setData({
        showAuthModal: true,
        savedPayMethod: this.data.payMethod
      })
      return
    }

    if (!this.data.tableNumber) {
      wx.showToast({
        title: '请先扫描桌码',
        icon: 'none'
      })
      return
    }

    const payMethod = this.data.payMethod
    const actualFinalPrice = Number(this.data.finalPrice) || 0
    const payWithBalance = payMethod === 'balance'

    if (payWithBalance && this.data.userBalance < actualFinalPrice) {
      wx.showToast({
        title: '余额不足，请使用微信支付',
        icon: 'none'
      })
      this.updateFinalPrice('wechat')
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '下单中...' })

    try {
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods: this.data.orderGoods,
          totalPrice: this.data.totalPrice,
          finalPrice: actualFinalPrice,
          payWithBalance,
          tableNumber: this.data.tableNumber,
          orderType: this.data.orderType,
          remark: this.data.remark || ''
        }
      })

      if (!doBuyRes.result || !doBuyRes.result.success) {
        const errorMsg = doBuyRes.result?.error || '下单失败'
        throw new Error(errorMsg)
      }

      const orderId = doBuyRes.result.orderId

      if (payWithBalance) {
        wx.hideLoading()
        wx.showToast({ title: '下单成功', icon: 'success' })
        this.clearCart()

        setTimeout(() => {
          wx.switchTab({
            url: '/pages/myorder/myorder'
          })
        }, 1500)
        return
      }

      wx.hideLoading()
      wx.showLoading({ title: '拉起支付中...' })

      const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)

      const payRes = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          outTradeNo: orderId,
          nonceStr
        }
      })

      const payment = payRes.result && payRes.result.payment ? payRes.result.payment : payRes.result

      wx.hideLoading()
      await wx.requestPayment(payment)

      wx.showToast({ title: '支付成功', icon: 'success' })
      this.clearCart()

      setTimeout(() => {
        wx.switchTab({
          url: '/pages/myorder/myorder'
        })
      }, 1500)
    } catch (err) {
      console.error('创建订单失败', err)
      wx.hideLoading()
      wx.showToast({
        title: err.message || '下单失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  editOrder() {
    wx.navigateBack()
  },

  clearCart() {
    const pages = getCurrentPages()
    const indexPage = pages.find(page => page.route === 'pages/index/index')
    if (indexPage) {
      indexPage.updateCart({})
    }
  },

  async onUserInfoSaved() {
    const savedPayMethod = this.data.savedPayMethod || this.data.payMethod

    this.setData({
      showAuthModal: false
    })

    try {
      await this.loadUserInfoFromDB({ skipUpdatePayMethod: true })
    } catch (err) {
      console.error('刷新用户信息失败', err)
    }

    if (savedPayMethod) {
      this.updateFinalPrice(savedPayMethod)
    }

    this.setData({
      savedPayMethod: null
    })

    setTimeout(() => {
      this.submitOrder()
    }, 300)
  }
})
