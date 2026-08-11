// pages/myorder/myorder.js
const app = getApp()
const db = wx.cloud.database()
const { getStatusText, normalizeStatus } = require('../../utils/orderState')
const {
  isPaymentCancelled,
  requestOrderPayment
} = require('../../utils/payment')

function formatTime(time) {
  if (!time) return ''
  const date = time instanceof Date ? time : new Date(time)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatMoney(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function formatOrderNo(order = {}) {
  if (order.orderNo) return String(order.orderNo)
  const date = order.createTime instanceof Date ? order.createTime : new Date(order.createTime)
  const datePart = Number.isNaN(date.getTime())
    ? '000000000000'
    : [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0')
    ].join('')
  const suffix = String(order._id || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-4)
    .toUpperCase()
    .padStart(4, '0')
  return `${order.type === 'recharge' ? 'R' : 'D'}${datePart}${suffix}`
}

function normalizeDetailGoods(goods = []) {
  return goods.map(item => {
    const count = Number(item.count || 0)
    const price = Number(item.price || 0)
    const skuName = String(item.skuName || '').trim()
    return {
      ...item,
      dishName: item.dishName || item.goodsName || '未知菜品',
      count,
      priceText: formatMoney(price),
      subtotalText: formatMoney(price * count),
      tagsText: Array.isArray(item.tags) ? item.tags.join(' · ') : '',
      showSkuName: Boolean(skuName && skuName !== '默认规格' && skuName !== '标准份')
    }
  })
}

Page({
  data: {
    tabs: ['全部', '进行中', '已完成'],
    currentTab: 0,
    orderList: [], // 订单列表
    // 分页相关
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false,
    hasLoadedOrders: false,
    orderLoadError: false,
    showOrderDetail: false,
    selectedOrder: null,
    cancellingOrder: false,
    payingOrderId: ''
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 2, interactionLocked: false })
    this.loadUserInfo()
    this.loadOrders()
  },

  onHide() {
    this.closeOrderDetail()
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
          userInfo: user
        })
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },
  // 切换标签
  switchTab(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentTab: index,
      // 重置分页状态
      orderPage: 0,
      orderHasMore: true,
      orderList: []
    }, () => this.loadOrders())
  },

  // 加载订单列表
  async loadOrders(append = false) {
    let loadFailed = false

    if (append && this.data.loadingOrders) {
      return
    }

    const requestId = (this.orderRequestId || 0) + 1
    this.orderRequestId = requestId
    const currentTab = Number(this.data.currentTab) || 0

    if (!append) {
      wx.showLoading({ title: '加载中...' })
      this.setData({ orderLoadError: false })
    }
    
    try {
      this.setData({ loadingOrders: true })

      const openid = app.globalData.openid
      const _ = db.command
      
      let query = { _openid: openid }
      
      // 根据标签筛选
      if (currentTab === 1) {
        query = _.and([
          query,
          _.or([
            { paymentStatus: 'pending' },
            _.and([
              { type: 'order' },
              { pay_status: true },
              { status: _.nin([2, 3]) }
            ])
          ])
        ])
      } else if (currentTab === 2) {
        query = _.and([
          query,
          _.or([
            { paymentStatus: 'cancelled' },
            _.and([{ type: 'recharge' }, { pay_status: true }]),
            _.and([{ type: 'order' }, { pay_status: true }, { status: _.in([2, 3]) }])
          ])
        ])
      }
      
      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize
      
      const res = await db.collection('order')
        .where(query)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      if (requestId !== this.orderRequestId || currentTab !== Number(this.data.currentTab)) {
        return
      }

      const list = (res.data || []).map(order => {
        const isRecharge = order.type === 'recharge'
        const isPaid = order.pay_status === true || order.paymentStatus === 'paid'
        const isPendingPayment = !isPaid && order.paymentStatus === 'pending'
        const isPaymentCancelled = !isPaid && ['cancelled', 'closed', 'expired'].includes(order.paymentStatus)
        const goods = Array.isArray(order.goods) ? order.goods : []
        const detailGoods = normalizeDetailGoods(goods)
        const firstGoods = goods[0] || {}
        const totalCount = goods.reduce((sum, item) => sum + Number(item.count || 0), 0)
        const orderStatus = normalizeStatus(order)
        const statusText = isPendingPayment
          ? '待支付'
          : isPaymentCancelled
            ? '已取消'
            : isRecharge
              ? '已到账'
              : getStatusText(orderStatus)
        const payText = order.payMethod === 'balance' ? '余额支付' : '微信支付'
        const sceneText = order.orderType === 'takeOut'
          ? '打包/自取'
          : order.tableNumber
            ? `${order.tableNumber} 号桌`
            : '堂食'
        const firstName = firstGoods.dishName || firstGoods.goodsName || '点餐商品'

        return {
          ...order,
          displayOrderLabel: isRecharge ? '充值' : '订单',
          displayOrderNo: formatOrderNo(order),
          statusText,
          statusClass: isPendingPayment ? 'pending-payment' : isRecharge || orderStatus === 2 ? 'success' : orderStatus === 3 || isPaymentCancelled ? 'cancelled' : '',
          statusIcon: isPendingPayment ? 'cuIcon-pay' : isRecharge || orderStatus === 2 ? 'cuIcon-roundcheck' : orderStatus === 3 || isPaymentCancelled ? 'cuIcon-roundclose' : 'cuIcon-time',
          goodsSummary: isRecharge
            ? `会员储值 ¥${formatMoney(order.amount)}`
            : `${firstName}${totalCount > 1 ? `等 ${totalCount} 件商品` : ''}`,
          goodsMeta: isRecharge
            ? `赠送 ¥${formatMoney(order.giveAmount)} · 到账 ¥${formatMoney(order.totalGet || Number(order.amount || 0) + Number(order.giveAmount || 0))}`
            : `${sceneText} · ${payText}`,
          primaryGoodsImage: isRecharge ? '' : (firstGoods.dishImage || firstGoods.image || ''),
          amountText: formatMoney(isRecharge ? order.amount : (order.finalPrice || order.totalPrice)),
          totalPriceText: formatMoney(order.totalPrice),
          finalPriceText: formatMoney(order.finalPrice || order.totalPrice),
          giveAmountText: formatMoney(order.giveAmount),
          totalGetText: formatMoney(order.totalGet || Number(order.amount || 0) + Number(order.giveAmount || 0)),
          createTimeText: formatTime(order.createTime),
          detailGoods,
          sceneText,
          payText,
          isPaid,
          isPendingPayment,
          refundText: order.refundStatus === 'requested' ? '退款申请待商家处理' : order.refundStatus === 'refunded' ? '已退款' : order.refundStatus === 'failed' ? '退款失败，请联系商家' : '',
          canPay: isPendingPayment,
          canCancel: isPendingPayment || (!isRecharge && isPaid && orderStatus === 0)
        }
      })
      
      const newList = append ? this.data.orderList.concat(list) : list
      const hasMore = list.length === pageSize
      
      this.setData({
        orderList: newList,
        orderPage: page,
        orderHasMore: hasMore,
        hasLoadedOrders: true,
        orderLoadError: false
      })
    } catch (err) {
      console.error('加载订单失败', err)
      if (!append && requestId === this.orderRequestId) {
        loadFailed = true
        this.setData({
          hasLoadedOrders: true,
          orderLoadError: this.data.orderList.length === 0
        })
      }
    } finally {
      if (requestId === this.orderRequestId && !append) {
        wx.hideLoading()
      }
      if (requestId === this.orderRequestId) {
        this.setData({ loadingOrders: false })
      }
    }

    if (requestId === this.orderRequestId && loadFailed) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },

  onOrderImageError(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isNaN(index)) {
      this.setData({ [`orderList[${index}].imageLoadFailed`]: true })
    }
  },

  retryLoadOrders() {
    this.loadOrders()
  },

  // 查看订单详情
  viewOrderDetail(e) {
    const index = Number(e.currentTarget.dataset.index)
    const order = this.data.orderList[index]
    if (!order) return
    this.setData({
      selectedOrder: order,
      showOrderDetail: true
    }, () => this.setTabBarInteractionLocked(true))
  },

  closeOrderDetail() {
    if (!this.data.showOrderDetail && !this.data.selectedOrder) return
    this.setData({
      showOrderDetail: false,
      selectedOrder: null
    }, () => this.setTabBarInteractionLocked(false))
  },

  setTabBarInteractionLocked(locked) {
    const tabBar = this.getTabBar && this.getTabBar()
    const interactionLocked = Boolean(locked)
    if (tabBar && tabBar.data.interactionLocked !== interactionLocked) {
      tabBar.setData({ interactionLocked })
    }
  },

  stopPropagation() {},

  stopTouchMove() {},

  continuePayment(e) {
    const index = Number(e.currentTarget.dataset.index)
    const order = this.data.orderList[index]
    if (order) this.payOrder(order)
  },

  continueSelectedPayment() {
    if (this.data.selectedOrder) this.payOrder(this.data.selectedOrder)
  },

  async payOrder(order) {
    if (!order || !order.canPay || this.data.payingOrderId) return
    this.setData({ payingOrderId: order._id })
    wx.showLoading({ title: '确认支付中...' })
    try {
      const result = await requestOrderPayment({
        db,
        orderId: order._id,
        mockMode: app.globalData.mockMode
      })
      wx.hideLoading()
      if (!result.confirmed) {
        wx.showModal({
          title: '支付结果确认中',
          content: '订单已保留，稍后刷新即可查看最终结果。',
          showCancel: false
        })
        return
      }
      await this.loadUserInfo()
      await this.loadOrders()
      this.closeOrderDetail()
      wx.showToast({ title: order.type === 'recharge' ? '充值已到账' : '支付成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: isPaymentCancelled(err) ? '已取消支付，订单已保留' : (err.message || '支付失败，请重试'),
        icon: 'none'
      })
    } finally {
      this.setData({ payingOrderId: '' })
    }
  },

  cancelSelectedOrder() {
    const order = this.data.selectedOrder
    if (!order || this.data.cancellingOrder) return
    
    if (!order.canCancel) {
      wx.showToast({ title: '该订单无法取消', icon: 'none' })
      return
    }

    const isPendingPayment = order.isPendingPayment
    const isWechatRefund = order.isPaid && order.payMethod !== 'balance'
    
    wx.showModal({
      title: '确认取消',
      content: isPendingPayment
        ? '确定取消这个待支付订单吗？'
        : isWechatRefund
          ? '取消后将提交退款申请，需由商家完成原路退款。'
          : '确定取消这个订单吗？余额将原路退回。',
      success: async (res) => {
        if (res.confirm) {
          await this.doCancelOrder(order)
        }
      }
    })
  },

  // 执行取消订单
  async doCancelOrder(order) {
    if (this.data.cancellingOrder) return
    this.setData({ cancellingOrder: true })
    wx.showLoading({ title: '处理中...' })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'cancelOrder',
        data: {
          orderId: order._id
        }
      })
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '取消失败')
      }
      
      const refundRequested = res.result.refundRequested === true
      wx.showToast({ title: refundRequested ? '退款申请已提交' : '订单已取消', icon: 'success' })
      this.closeOrderDetail()
      await this.loadUserInfo()
      
      // 刷新订单列表
      setTimeout(() => {
        this.loadOrders()
      }, 1500)
      
    } catch (err) {
      console.error('取消订单失败', err)
      wx.showToast({ title: err.message || '取消失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ cancellingOrder: false })
    }
  }
})
