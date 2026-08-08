// pages/recharge/recharge.js
const app = getApp()
const db = wx.cloud.database()
const {
  DEFAULT_SHOP_SETTINGS,
  loadShopSettings
} = require('../../utils/shopSettings')

function formatMoney(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

Page({
  data: {
    rechargeList: [], // 充值套餐列表
    userInfo: null, // 用户信息
    balanceText: '0.00',
    shopName: DEFAULT_SHOP_SETTINGS.shopName,
    welcomeText: DEFAULT_SHOP_SETTINGS.welcomeText,
    selectedRechargeId: '',
    selectedRecharge: null,
    pendingRecharge: null,
    showAuthModal: false, // 显示授权弹窗
    // 分页相关
    rechargePage: 0,
    rechargePageSize: 20,
    rechargeHasMore: true,
    loadingRecharge: false
  },

  onLoad() {
    this.loadRechargeList()
    this.loadUserInfo()
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 1 })
    this.loadUserInfo()
    this.loadShopSettings()
  },

  async loadShopSettings() {
    const settings = await loadShopSettings(db)
    this.setData(settings)
  },

  // 加载用户信息
  async loadUserInfo() {
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
          balanceText: formatMoney(user.balance)
        })
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },

  // 加载充值套餐列表
  async loadRechargeList(append = false) {
    let loadFailed = false

    if (this.data.loadingRecharge) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingRecharge: true })

    try {
      const pageSize = this.data.rechargePageSize
      const page = append ? this.data.rechargePage + 1 : 0
      const skip = page * pageSize

      const res = await db.collection('rechargeOptions')
        .where({
          status: 1 // 1表示启用
        })
        .orderBy('amount', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()
      
      const list = res.data || []
      const newList = append ? this.data.rechargeList.concat(list) : list
      const hasMore = list.length === pageSize
      const currentSelection = newList.find(item => item._id === this.data.selectedRechargeId)
      const selectedRecharge = currentSelection ||
        newList.find(item => item.isRecommend) ||
        newList[0] ||
        null

      this.setData({
        rechargeList: newList,
        rechargePage: page,
        rechargeHasMore: hasMore,
        selectedRecharge,
        selectedRechargeId: selectedRecharge ? selectedRecharge._id : ''
      })
    } catch (err) {
      console.error('加载充值套餐失败', err)
      if (!append) {
        loadFailed = true
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingRecharge: false })
    }

    if (loadFailed) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.rechargeHasMore && !this.data.loadingRecharge) {
      this.loadRechargeList(true)
    }
  },


  selectRecharge(e) {
    const recharge = e.currentTarget.dataset.recharge
    if (!recharge || !recharge._id) {
      return
    }

    this.setData({
      selectedRechargeId: recharge._id,
      selectedRecharge: recharge
    })
  },

  confirmSelectedRecharge() {
    this.startRecharge(this.data.selectedRecharge)
  },

  // 兼容原有直接充值入口
  confirmRecharge(e) {
    const recharge = e.currentTarget.dataset.recharge
    this.startRecharge(recharge)
  },

  startRecharge(recharge) {
    if (!recharge) {
      wx.showToast({ title: '请选择充值套餐', icon: 'none' })
      return
    }

    // 检查用户信息完整性
    const userInfo = this.data.userInfo
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      this.setData({
        showAuthModal: true,
        pendingRecharge: recharge // 保存待充值的套餐
      })
      return
    }

    const totalGet = recharge.amount + recharge.giveAmount
    let content = `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`

    wx.showModal({
      title: '确认充值',
      content: content,
      success: async (res) => {
        if (res.confirm) {
          await this.doRecharge(recharge)
        }
      }
    })
  },

  // 执行充值
  async doRecharge(recharge) {
    wx.showLoading({ title: '拉起支付中...' })

    try {   
      const orderRes = await wx.cloud.callFunction({
        name: 'createRechargeOrder',
        data: {
          rechargeId: recharge._id
        }
      })
      if (!orderRes.result || !orderRes.result.success) {
        throw new Error(orderRes.result?.error || '创建充值订单失败')
      }

      const outTradeNo = orderRes.result.orderId

      // 生成随机字符串
      const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)

      // 调用云函数统一下单
      const payRes = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          outTradeNo: outTradeNo,
          nonceStr
        }
      })

      const payment = payRes.result && payRes.result.payment ? payRes.result.payment : payRes.result

      wx.hideLoading()

      // 调起微信支付
      await wx.requestPayment(payment)

      wx.showToast({ title: '支付成功，余额更新中...', icon: 'success' })

      // 支付成功后，pay_success 云函数会更新订单状态并增加余额
      // 这里稍等一会儿再刷新用户信息
      setTimeout(() => {
        this.loadUserInfo()
      }, 2000)

    } catch (err) {
      console.error('充值失败或已取消', err)
      wx.hideLoading()
      if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        wx.showToast({ title: '支付失败，请重试', icon: 'none' })
      }
    }
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: `${this.data.shopName}充值优惠`,
      path: '/pages/recharge/recharge',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: `${this.data.shopName}充值优惠`,
      query: '',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 处理用户授权（组件已经保存了用户信息，这里只需要刷新并继续充值）
  async handleUserAuth(e) {
    try {
      // 组件已经保存了用户信息，这里只需要重新加载用户信息
      await this.loadUserInfo()
      
      this.setData({
        showAuthModal: false
      })
      
      // 授权成功后，如果有待充值套餐，直接执行充值（不再检查用户信息）
      if (this.data.pendingRecharge) {
        const recharge = this.data.pendingRecharge
        this.setData({ pendingRecharge: null })
        
        // 直接执行充值，不再检查用户信息
        setTimeout(() => {
          const totalGet = recharge.amount + recharge.giveAmount
          let content = `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`

          wx.showModal({
            title: '确认充值',
            content: content,
            success: async (res) => {
              if (res.confirm) {
                await this.doRecharge(recharge)
              }
            }
          })
        }, 500)
      }
      
    } catch (err) {
      console.error('处理授权失败', err)
      wx.showToast({
        title: '处理失败，请重试',
        icon: 'none'
      })
    }
  }
})
