// pages/admin/order/order.js
const db = require('../../../utils/adminDb')
const { callAdminApi, callAdminFunction } = require('../../../utils/adminAuth')
const { ORDER_STATUS, getStatusText, normalizeStatus } = require('../../../utils/orderState')

function maskPhone(phone) {
  const value = String(phone || '')
  return /^1\d{10}$/.test(value) ? `${value.slice(0, 3)}****${value.slice(7)}` : value
}

Page({
  data: {
    orders: [],
    orderType: 0, // 0: 全部, 1: 充值订单, 2: 点餐订单
    typeOptions: [
      { text: '全部订单', value: 0 },
      { text: '充值订单', value: 1 },
      { text: '点餐订单', value: 2 }
    ],
    // 分页相关
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false,
    orderStatus: 'all',
    statusOptions: [
      { text: '全部状态', value: 'all' },
      { text: '待接单', value: 0 },
      { text: '制作中', value: 1 },
      { text: '待取餐', value: 4 },
      { text: '已完成', value: 2 },
      { text: '已取消', value: 3 }
    ],
    updatingOrderId: '',
    reprintingOrderId: ''
  },

  onShow() {
    this.startAutoRefresh()
  },

  onHide() {
    this.clearAutoRefresh()
  },

  onUnload() {
    this.clearAutoRefresh()
  },

  // 加载订单列表
  async loadOrders(append = false, silent = false) {
    let loadFailed = false
    let loadSucceeded = false

    if (append && this.data.loadingOrders) {
      return false
    }

    const requestId = (this.orderRequestId || 0) + 1
    this.orderRequestId = requestId
    const orderType = Number(this.data.orderType) || 0

    if (!append && !silent) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingOrders: true })

    try {
      let where = {
        pay_status: true // 只获取已支付成功的订单
      }
      
      // 按类型筛选
      if (orderType === 1) {
        where.type = 'recharge'
      } else if (orderType === 2) {
        where.type = 'order'
      }
      if (this.data.orderStatus !== 'all') {
        where.type = 'order'
        where.status = Number(this.data.orderStatus)
      }
      
      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize
      
      const res = await db.collection('order')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      if (requestId !== this.orderRequestId || orderType !== Number(this.data.orderType)) {
        return false
      }

      // 格式化时间，避免界面显示 [object Object]
      const formatTime = (time) => {
        if (!time) return ''
        const date = time instanceof Date ? time : new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : n)
        const y = date.getFullYear()
        const m = pad(date.getMonth() + 1)
        const d = pad(date.getDate())
        const hh = pad(date.getHours())
        const mm = pad(date.getMinutes())
        return `${y}-${m}-${d} ${hh}:${mm}`
      }

      // 处理订单数据，格式化时间并处理标签显示
      const list = (res.data || []).map(order => {
        const status = normalizeStatus(order)
        const orderData = {
          ...order,
          status,
          statusText: order.type === 'recharge' ? '已到账' : getStatusText(status),
          statusClass: status === ORDER_STATUS.COMPLETED ? 'completed' : status === ORDER_STATUS.CANCELLED ? 'cancelled' : status === ORDER_STATUS.PENDING_ACCEPT ? 'pending' : 'processing',
          maskedPhone: maskPhone(order.userPhone),
          createTimeText: order.createTime ? formatTime(order.createTime) : '',
          canAdvance: order.type === 'order' && [ORDER_STATUS.PENDING_ACCEPT, ORDER_STATUS.PREPARING, ORDER_STATUS.READY].includes(status),
          nextStatus: status === ORDER_STATUS.PENDING_ACCEPT ? ORDER_STATUS.PREPARING : status === ORDER_STATUS.PREPARING ? ORDER_STATUS.READY : ORDER_STATUS.COMPLETED,
          nextActionText: status === ORDER_STATUS.PENDING_ACCEPT ? '接单' : status === ORDER_STATUS.PREPARING ? '标记出餐' : '完成订单',
          canCancel: order.type === 'order' && [ORDER_STATUS.PENDING_ACCEPT, ORDER_STATUS.PREPARING, ORDER_STATUS.READY].includes(status)
        }

        // tags 现在直接是字符串数组，不需要额外处理

        return orderData
      })

      const newOrders = append ? this.data.orders.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        orders: newOrders,
        orderPage: page,
        orderHasMore: hasMore
      })
      loadSucceeded = true
    } catch (err) {
      console.error('加载订单失败', err)
      if (!append && requestId === this.orderRequestId) {
        loadFailed = true
      }
    } finally {
      if (requestId === this.orderRequestId && !append && !silent) {
        wx.hideLoading()
      }
      if (requestId === this.orderRequestId) {
        this.setData({ loadingOrders: false })
      }
    }

    if (requestId === this.orderRequestId && loadFailed && !silent) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    return loadSucceeded
  },

  // 订单类型切换（tabs）
  onChange(e) {
    const index = e.detail.index
    this.setData({
      orderType: index,
      // 重置分页状态
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.loadOrders()
    })
  },

  selectStatus(e) {
    const value = e.currentTarget.dataset.value
    if (String(value) === String(this.data.orderStatus)) return
    this.setData({ orderStatus: value, orderPage: 0, orderHasMore: true, orders: [] }, () => this.loadOrders())
  },

  // 手动刷新
  async refreshOrders() {
    const refreshed = await this.loadOrders()
    if (refreshed) {
      wx.showToast({
        title: '已刷新',
        icon: 'none'
      })
    }
  },

  // 启动自动刷新
  startAutoRefresh() {
    this.clearAutoRefresh()
    // 立即加载一次
    this.loadOrders().then(() => this.checkForNewOrders(true))
    // 每 10 秒刷新一次
    this.refreshTimer = setInterval(() => {
      this.loadOrders(false, true)
      this.checkForNewOrders(false)
    }, 10000)
  },

  async checkForNewOrders(seedOnly = false) {
    if (this.checkingNewOrders) return
    this.checkingNewOrders = true
    try {
      const res = await db.collection('order')
        .where({ type: 'order', pay_status: true, status: ORDER_STATUS.PENDING_ACCEPT })
        .orderBy('createTime', 'desc')
        .limit(30)
        .get()
      const ids = (res.data || []).map(item => item._id).filter(Boolean)
      if (!this.seenPendingOrderIds || seedOnly) {
        this.seenPendingOrderIds = new Set(ids)
        return
      }
      const newIds = ids.filter(id => !this.seenPendingOrderIds.has(id))
      this.seenPendingOrderIds = new Set(ids)
      if (newIds.length === 0) return
      try {
        wx.vibrateShort({ type: 'medium' })
      } catch (err) {
        console.warn('新订单振动提醒不可用', err)
      }
      wx.showToast({
        title: newIds.length > 1 ? `${newIds.length}个新订单待接单` : '有新订单待接单',
        icon: 'none',
        duration: 2600
      })
    } catch (err) {
      console.error('检查新订单失败', err)
    } finally {
      this.checkingNewOrders = false
    }
  },

  // 清除自动刷新
  clearAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    this.checkingNewOrders = false
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },


  // 阻止冒泡
  stopPropagation() {},

  onOrderImageError(e) {
    const data = e.currentTarget.dataset || {}
    const orderIndex = Number(data.orderIndex)
    if (Number.isNaN(orderIndex)) return
    if (data.scope === 'avatar') {
      this.setData({ [`orders[${orderIndex}].avatarLoadFailed`]: true })
      return
    }
    const goodsIndex = Number(data.goodsIndex)
    if (!Number.isNaN(goodsIndex)) {
      this.setData({ [`orders[${orderIndex}].goods[${goodsIndex}].imageLoadFailed`]: true })
    }
  },

  advanceOrder(e) {
    const order = e.currentTarget.dataset.order
    if (!order || this.data.updatingOrderId) return
    wx.showModal({
      title: order.nextActionText,
      content: `确认将订单更新为“${getStatusText(Number(order.nextStatus))}”吗？`,
      success: async res => {
        if (res.confirm) await this.transitionOrder(order, Number(order.nextStatus), '')
      }
    })
  },

  cancelBusinessOrder(e) {
    const order = e.currentTarget.dataset.order
    if (!order || this.data.updatingOrderId) return
    wx.showModal({
      title: '取消订单',
      editable: true,
      placeholderText: '请填写取消原因',
      confirmColor: '#b3261e',
      success: async res => {
        if (!res.confirm) return
        const reason = String(res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写取消原因', icon: 'none' })
          return
        }
        await this.transitionOrder(order, ORDER_STATUS.CANCELLED, reason)
      }
    })
  },

  async transitionOrder(order, targetStatus, reason) {
    this.setData({ updatingOrderId: order._id })
    wx.showLoading({ title: '更新订单中...' })
    try {
      await callAdminApi('transitionOrder', { orderId: order._id, targetStatus, reason })
      wx.showToast({ title: targetStatus === ORDER_STATUS.CANCELLED ? '订单已取消' : '订单状态已更新', icon: 'success' })
      await this.loadOrders(false, true)
    } catch (err) {
      wx.showToast({ title: err.message || '订单更新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ updatingOrderId: '' })
    }
  },

  async reprintOrder(e) {
    const order = e.currentTarget.dataset.order
    if (!order || this.data.reprintingOrderId) return
    this.setData({ reprintingOrderId: order._id })
    wx.showLoading({ title: '提交打印中...' })
    try {
      const res = await callAdminFunction('printManage', { $url: 'reprintOrder', orderId: order._id })
      if (!res.result || !res.result.success) throw new Error(res.result?.error || '重打失败')
      wx.showToast({ title: '已提交重打', icon: 'success' })
      await this.loadOrders(false, true)
    } catch (err) {
      wx.showToast({ title: err.message || '重打失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ reprintingOrderId: '' })
    }
  },
  
  // 删除订单
  deleteOrder(e) {
    const order = e.currentTarget.dataset.order

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('order').doc(order._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadOrders()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})
