// pages/myorder/myorder.js
const app = getApp()
const db = wx.cloud.database()
Page({
  data: {
    tabs: ['全部', '进行中', '已完成'],
    currentTab: 0,
    orderList: [], // 订单列表
    // 分页相关
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 2 })
    this.loadUserInfo()
    this.loadOrders()
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
    })
    this.loadOrders()
  },

  // 加载订单列表
  async loadOrders(append = false) {
    if (this.data.loadingOrders) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }
    
    try {
      this.setData({ loadingOrders: true })

      const openid = app.globalData.openid
      const _ = db.command
      
      let query = {
        _openid: openid,
        pay_status: true // 只展示已支付成功的订单
      }
      
      // 根据标签筛选
      if (this.data.currentTab === 1) {
        query = _.and([
          query,
          { type: 'order' },
          { status: _.nin([2, 3]) }
        ])
      } else if (this.data.currentTab === 2) {
        query = _.and([
          query,
          _.or([
            { type: 'recharge' },
            { status: _.in([2, 3]) }
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

      const formatMoney = (value) => Number(value || 0).toFixed(2)
      const list = (res.data || []).map(order => {
        const isRecharge = order.type === 'recharge'
        const goods = Array.isArray(order.goods) ? order.goods : []
        const firstGoods = goods[0] || {}
        const totalCount = goods.reduce((sum, item) => sum + Number(item.count || 0), 0)
        const orderCompleted = isRecharge || order.status === 2 || order.status === 3
        const statusText = isRecharge
          ? '已到账'
          : order.status === 2
            ? '已完成'
            : order.status === 3
              ? '已取消'
              : '制作中'
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
          displayOrderNo: order.orderNo || order._id || '',
          statusText,
          statusClass: orderCompleted ? 'success' : '',
          statusIcon: orderCompleted ? 'cuIcon-roundcheck' : 'cuIcon-time',
          goodsSummary: isRecharge
            ? `会员储值 ¥${formatMoney(order.amount)}`
            : `${firstName}${totalCount > 1 ? `等 ${totalCount} 件商品` : ''}`,
          goodsMeta: isRecharge
            ? `赠送 ¥${formatMoney(order.giveAmount)} · 到账 ¥${formatMoney(order.totalGet || Number(order.amount || 0) + Number(order.giveAmount || 0))}`
            : `${sceneText} · ${payText}`,
          primaryGoodsImage: isRecharge ? '' : (firstGoods.dishImage || firstGoods.image || ''),
          amountText: formatMoney(isRecharge ? order.amount : (order.finalPrice || order.totalPrice)),
          createTimeText: order.createTime ? formatTime(order.createTime) : ''
        }
      })
      
      const newList = append ? this.data.orderList.concat(list) : list
      const hasMore = list.length === pageSize
      
      this.setData({
        orderList: newList,
        orderPage: page,
        orderHasMore: hasMore
      })
    } catch (err) {
      console.error('加载订单失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loadingOrders: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },

  // 获取订单状态文本
  getOrderStatusText(order) {
    // 简化状态展示：只区分已完成 / 已取消，其它统称处理中
    if (order.type === 'recharge') {
      return '已完成'
    }
    if (order.status === 2) {
      return '已完成'
    }
    if (order.status === 3) {
      return '已取消'
    }
    return '处理中'
  },

  // 查看订单详情
  viewOrderDetail(e) {
    const order = e.currentTarget.dataset.order
    
    if (order.type === 'recharge') {
      // 充值订单详情
      wx.showModal({
        title: '充值订单详情',
        content: `充值金额：¥${order.amount}\n赠送金额：¥${order.giveAmount}\n到账金额：¥${order.totalGet}\n状态：已完成`,
        showCancel: false
      })
    } else {
      // 点餐订单详情
      let goodsInfo = ''
      order.goods.forEach(item => {
        const skuName = item.skuName && item.skuName !== '默认规格' ? `（${item.skuName}）` : ''
        goodsInfo += `${item.dishName || item.goodsName || '未知菜品'}${skuName} x${item.count} ¥${item.price}\n`
      })
      
      let content = `订单商品：\n${goodsInfo}\n合计：¥${order.totalPrice}`
      content += `\n实付：¥${order.finalPrice}\n状态：${this.getOrderStatusText(order)}`
      if (order.remark) {
        content += `\n备注：${order.remark}`
      }
      
      wx.showModal({
        title: '订单详情',
        content: content,
        showCancel: false
      })
    }
  },

  // 取消订单
  cancelOrder(e) {
    const order = e.currentTarget.dataset.order
    
    if (order.type === 'recharge') {
      wx.showToast({ title: '充值订单无法取消', icon: 'none' })
      return
    }
    
    if (order.status !== 0) {
      wx.showToast({ title: '该订单无法取消', icon: 'none' })
      return
    }

    if (order.payMethod !== 'balance') {
      wx.showToast({ title: '微信支付订单请联系商家退款', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？余额将原路退回',
      success: async (res) => {
        if (res.confirm) {
          await this.doCancelOrder(order)
        }
      }
    })
  },

  // 执行取消订单
  async doCancelOrder(order) {
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
      
      wx.hideLoading()
      wx.showToast({ title: '订单已取消', icon: 'success' })
      
      // 刷新订单列表
      setTimeout(() => {
        this.loadOrders()
      }, 1500)
      
    } catch (err) {
      console.error('取消订单失败', err)
      wx.hideLoading()
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  }
})
