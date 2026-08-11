// app.js
const MOCK_ENV_ID = '填写你的环境ID'

App({
  onLaunch: async function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {

      const mockMode = MOCK_ENV_ID.indexOf('填写') > -1
      this.globalData = {
        openid: '',
        openidReady: false,
        openidPromise: null, // 用于存储获取openid的Promise对象
        userInfo: null, // 用户信息
        userInfoReady: false,
        userInfoPromise: null, // 用于存储获取用户信息的Promise对象
        mockMode
      }
      this.userInfoListeners = []

      wx.cloud.init({
        env: mockMode ? 'aurora-suite-demo' : MOCK_ENV_ID,
        traceUser: true,
      })

      if (mockMode) {
        this.installMockRuntime()
      }
      
      // 启动时立即获取openid
      this.getOpenidPromise();
      
      // 重写Page方法，实现全局拦截
      this.overridePage();
      
      // 检查小程序更新
      this.checkForUpdate();
    }
  },

  installMockRuntime() {
    const mockDb = require('./utils/mockDb')
    this._mockDb = mockDb
    wx.cloud.database = () => mockDb
    wx.cloud.callFunction = options => this.mockCallFunction(options)
    wx.cloud.getTempFileURL = ({ fileList = [] } = {}) => Promise.resolve({ fileList: fileList.map(fileID => ({ fileID, tempFileURL: fileID })) })
    wx.setStorageSync('adminSessionToken', 'aurora-demo-admin')
  },

  async mockCallFunction(options = {}) {
    const mockDb = this._mockDb || require('./utils/mockDb')
    const name = options.name
    const data = options.data || {}
    const ok = (result = {}) => Promise.resolve({ result: { success: true, ...result } })
    const now = () => new Date()
    const user = () => mockDb._state.user.find(item => item._openid === 'demo-openid') || mockDb._state.user[0]
    const addBalanceLog = ({ userId, orderId = '', type, amount, before, after, reason }) => {
      mockDb._state.balanceLog = mockDb._state.balanceLog || []
      mockDb._state.balanceLog.push({
        _id: `balance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        orderId,
        type,
        amount,
        before,
        after,
        reason,
        createTime: now()
      })
      mockDb._persist()
    }
    const findOrder = orderId => mockDb._state.order.find(item => item._id === orderId)

    if (name === 'login') return Promise.resolve({ result: { openid: 'demo-openid' } })
    if (name === 'userProfile') {
      const user = mockDb._state.user[0]
      if (data.updateData && Object.keys(data.updateData).length) Object.assign(user, data.updateData)
      return ok({ data: mockDb._clone(user) })
    }
    if (name === 'getCategory') return ok({ data: mockDb._clone(mockDb._state.dishCategory) })
    if (name === 'getShopSettings') {
      const settings = mockDb._state.admin[0] || {}
      return ok({ data: { shopName: settings.shopName, welcomeText: settings.welcomeText, isOpen: settings.isOpen !== false } })
    }
    if (name === 'getPhoneNumber') return ok({ phoneNumber: '' })
    if (name === 'get_code') return Promise.resolve({ result: '/images/mock-table-code.png' })
    if (name === 'createRechargeOrder') {
      const option = mockDb._state.rechargeOptions.find(item => item._id === data.rechargeId && item.status === 1)
      const currentUser = user()
      if (!option || !currentUser) return ok({ success: false, error: '充值套餐不可用' })
      const orderId = mockDb._createId('recharge')
      mockDb._state.order.push({
        _id: orderId,
        orderNo: `R${Date.now()}${orderId.slice(-3)}`,
        _openid: 'demo-openid',
        type: 'recharge',
        rechargeId: option._id,
        amount: Number(option.amount),
        giveAmount: Number(option.giveAmount || 0),
        totalGet: Number(option.amount) + Number(option.giveAmount || 0),
        pay_status: false,
        paymentStatus: 'pending',
        status: 0,
        createTime: now()
      })
      mockDb._persist()
      return ok({ orderId })
    }
    if (name === 'doBuy') {
      const currentUser = user()
      const orderGoods = Array.isArray(data.orderGoods) ? data.orderGoods : []
      const orderType = data.orderType === 'takeOut' ? 'takeOut' : 'dineIn'
      const tableNumber = orderType === 'dineIn' ? String(data.tableNumber || '').trim() : ''
      const settings = mockDb._state.admin[0] || {}
      if (settings.isOpen === false) return ok({ success: false, error: '店铺已打烊，暂不接单' })
      if (!currentUser || !orderGoods.length) return ok({ success: false, error: '订单商品不能为空' })
      if (orderType === 'dineIn' && !mockDb._state.tableCode.some(item => item.tableNumber === tableNumber && item.status !== 0)) {
        return ok({ success: false, error: '桌码无效，请重新扫描' })
      }
      let total = 0
      const goods = []
      for (const item of orderGoods) {
        const dish = mockDb._state.dish.find(value => value._id === item.dishId && value.status === 1)
        if (!dish) return ok({ success: false, error: '部分菜品已下架，请重新选择' })
        const count = Math.floor(Number(item.count) || 0)
        if (count < 1) return ok({ success: false, error: '订单商品数量无效' })
        const skus = Array.isArray(dish.skus) && dish.skus.length ? dish.skus : [{ id: 'default', name: '默认规格', price: dish.price, status: 1 }]
        const sku = skus.find(value => value.id === (item.skuId || 'default') && value.status !== 0) || skus.find(value => value.status !== 0)
        if (!sku) return ok({ success: false, error: '菜品规格不可用' })
        const price = Number(sku.price || dish.price || 0)
        total += price * count
        goods.push({ ...item, dishId: dish._id, dishName: dish.name, dishImage: dish.image || '', skuId: sku.id, skuName: sku.name, price, count, subtotal: price * count })
      }
      total = Math.round(total * 100) / 100
      if (Math.abs(total - Number(data.finalPrice || data.totalPrice || 0)) > 0.01) return ok({ success: false, error: '菜品价格已更新，请重新确认' })
      const payWithBalance = data.payWithBalance === true
      if (payWithBalance && Number(currentUser.balance || 0) < total) return ok({ success: false, error: '余额不足' })
      const before = Number(currentUser.balance || 0)
      if (payWithBalance) {
        currentUser.balance = Math.round((before - total) * 100) / 100
      }
      const orderId = mockDb._createId('order')
      const order = {
        _id: orderId,
        orderNo: `D${Date.now()}${orderId.slice(-3)}`,
        _openid: 'demo-openid',
        type: 'order',
        orderType,
        goods,
        totalPrice: total,
        finalPrice: total,
        status: payWithBalance ? 0 : 0,
        fulfillmentStatus: 'pending_accept',
        pay_status: payWithBalance,
        paymentStatus: payWithBalance ? 'paid' : 'pending',
        payMethod: payWithBalance ? 'balance' : 'wechat',
        tableNumber,
        remark: String(data.remark || '').trim().slice(0, 120),
        createTime: now()
      }
      mockDb._state.order.push(order)
      if (payWithBalance) addBalanceLog({ userId: currentUser._id, orderId, type: 'consume', amount: -total, before, after: currentUser.balance, reason: '余额支付点餐' })
      mockDb._persist()
      return ok({ orderId, order: mockDb._clone(order), paymentRequired: !payWithBalance })
    }
    if (name === 'pay') {
      const order = findOrder(data.outTradeNo)
      const currentUser = user()
      if (!order || order._openid !== 'demo-openid' || order.pay_status || order.paymentStatus !== 'pending') {
        return ok({ success: false, error: '订单不存在、已支付或已关闭' })
      }
      order.pay_status = true
      order.paymentStatus = 'paid'
      order.payTime = now()
      if (order.type === 'recharge' && currentUser) {
        const before = Number(currentUser.balance || 0)
        const amount = Number(order.totalGet || 0)
        currentUser.balance = Math.round((before + amount) * 100) / 100
        addBalanceLog({ userId: currentUser._id, orderId: order._id, type: 'recharge', amount, before, after: currentUser.balance, reason: 'mock 充值到账' })
      }
      mockDb._persist()
      return ok({ payment: null, paid: true, confirmed: true, order: mockDb._clone(order) })
    }
    if (name === 'cancelOrder') {
      const order = findOrder(data.orderId)
      const currentUser = user()
      if (!order || order._openid !== 'demo-openid') return ok({ success: false, error: '订单不存在' })
      if (order.paymentStatus === 'pending' && !order.pay_status) {
        order.paymentStatus = 'cancelled'
        order.status = 3
        order.fulfillmentStatus = 'cancelled'
      } else if (order.type === 'order' && order.status === 0 && order.payMethod === 'balance' && currentUser) {
        order.status = 3
        order.fulfillmentStatus = 'cancelled'
        order.refundStatus = 'refunded'
        const before = Number(currentUser.balance || 0)
        const amount = Number(order.finalPrice || 0)
        currentUser.balance = Math.round((before + amount) * 100) / 100
        addBalanceLog({ userId: currentUser._id, orderId: order._id, type: 'refund', amount, before, after: currentUser.balance, reason: '余额订单取消退款' })
      } else {
        return ok({ success: false, error: '该订单当前不可取消' })
      }
      mockDb._persist()
      return ok({ cancelled: true, order: mockDb._clone(order) })
    }
    if (name === 'printManage') {
      return Promise.resolve({
        result: {
          success: false,
          code: 'PRINT_NOT_CONFIGURED',
          error: '打印服务未配置，请先填写打印平台凭证'
        }
      })
    }

    if (name === 'getUserList') {
      const list = mockDb._state.user.map(item => {
        const phoneNumber = String(item.phoneNumber || '')
        const maskedPhone = /^1\d{10}$/.test(phoneNumber)
          ? `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(7)}`
          : ''
        const { phoneNumber: _phoneNumber, ...safeUser } = item
        return { ...safeUser, maskedPhone }
      })
      return ok({ data: { list: mockDb._clone(list), hasMore: false } })
    }
    if (name === 'adminApi') {
      const action = data.action
      if (action === 'verify' || action === 'status' || action === 'setup' || action === 'login' || action === 'changePassword') {
        return ok({ adminToken: 'aurora-demo-admin', status: { configured: true } })
      }
      if (action === 'list') {
        const list = await mockDb._query(data)
        return ok({ data: list.data, hasMore: false })
      }
      if (action === 'transitionOrder') {
        const { canTransition, getFulfillmentStatus, getStatusText, normalizeStatus } = require('./utils/orderState')
        const order = findOrder(data.orderId)
        const targetStatus = Number(data.targetStatus)
        const currentStatus = normalizeStatus(order)
        if (!order || order.type !== 'order' || !order.pay_status) return ok({ success: false, error: '订单不存在或尚未支付' })
        if (!canTransition(currentStatus, targetStatus)) return ok({ success: false, error: `订单无法从${getStatusText(currentStatus)}变为${getStatusText(targetStatus)}` })
        const reason = String(data.reason || '').trim().slice(0, 80)
        if (targetStatus === 3 && !reason) return ok({ success: false, error: '取消订单必须填写原因' })
        if (targetStatus === 3 && order.payMethod === 'balance') {
          const currentUser = mockDb._state.user.find(item => item._openid === order._openid)
          if (!currentUser) return ok({ success: false, error: '会员不存在，无法完成退款' })
          const before = Number(currentUser.balance || 0)
          const amount = Number(order.finalPrice || 0)
          currentUser.balance = Math.round((before + amount) * 100) / 100
          order.refundStatus = 'refunded'
          addBalanceLog({
            userId: currentUser._id,
            orderId: order._id,
            type: 'refund',
            amount,
            before,
            after: currentUser.balance,
            reason
          })
        } else if (targetStatus === 3 && order.payMethod === 'wechat') {
          order.refundStatus = 'requested'
          order.refundRequestTime = now()
        }
        order.status = targetStatus
        order.fulfillmentStatus = getFulfillmentStatus(targetStatus)
        order.statusUpdateTime = now()
        order.statusHistory = (order.statusHistory || []).concat({
          from: currentStatus,
          to: targetStatus,
          reason,
          operator: 'mock-admin',
          createTime: now()
        })
        if (targetStatus === 2) order.completeTime = now()
        if (targetStatus === 3) order.cancelTime = now()
        mockDb._persist()
        return ok({ order: mockDb._clone(order) })
      }
      if (action === 'adjustBalance') {
        const currentUser = mockDb._state.user.find(item => item._id === data.userId)
        const targetBalance = Math.round(Number(data.balance) * 100) / 100
        const reason = String(data.reason || '').trim().slice(0, 80)
        if (!currentUser || !Number.isFinite(targetBalance) || targetBalance < 0) return ok({ success: false, error: '余额参数无效' })
        if (!reason) return ok({ success: false, error: '请填写调账原因' })
        const before = Number(currentUser.balance || 0)
        currentUser.balance = targetBalance
        addBalanceLog({ userId: currentUser._id, type: 'admin_adjustment', amount: targetBalance - before, before, after: targetBalance, reason })
        mockDb._persist()
        return ok({ balance: targetBalance })
      }
      if (action === 'listBalanceLogs') {
        const logs = (mockDb._state.balanceLog || []).filter(item => !data.userId || item.userId === data.userId)
        return ok({ data: mockDb._clone(logs.slice().reverse()) })
      }
      if (action === 'add') {
        const added = await mockDb.collection(data.collectionName).add({ data: data.data })
        return ok({ _id: added._id })
      }
      if (action === 'update') {
        await mockDb.collection(data.collectionName).doc(data.documentId).update({ data: data.data })
        return ok({ updated: 1 })
      }
      if (action === 'remove') {
        if (
          data.collectionName === 'dishCategory' &&
          mockDb._state.dish.some(item => item.categoryId === data.documentId)
        ) {
          return Promise.resolve({
            result: {
              success: false,
              code: 'CATEGORY_NOT_EMPTY',
              error: '该分类下仍有菜品，请先移动或删除菜品'
            }
          })
        }
        await mockDb.collection(data.collectionName).doc(data.documentId).remove()
        return ok({ deleted: 1 })
      }
      return ok()
    }
    return ok({ data: {} })
  },
  
  // 重写Page方法，拦截所有页面的onLoad
  overridePage: function() {
    const originalPage = Page;
    const that = this;
    
    // 替换全局的Page方法
    Page = function(pageConfig) {
      // 保存原来的onLoad方法
      const originalOnLoad = pageConfig.onLoad;
      
      // 重写onLoad方法
      pageConfig.onLoad = async function(options) {
        try {
          // 等待openid获取完成
          await that.checkOpenid();
        } catch (error) {
          console.error('获取用户信息失败', error);
        } finally {
          // 云初始化失败时也继续渲染页面，让页面自身显示空态或错误态。
          if (originalOnLoad) {
            originalOnLoad.call(this, options);
          }
        }
      }
      
      // 调用原始的Page构造函数
      return originalPage(pageConfig);
    };
  },
  
  // 将获取openid封装为Promise，方便页面等待openid加载完成
  getOpenidPromise: function() {
    // 如果已经获取过openid，直接返回
    if (this.globalData.openidReady && this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    
    // 如果已经有一个正在进行的Promise，直接返回该Promise
    if (this.globalData.openidPromise) {
      return this.globalData.openidPromise;
    }
    
    if (this.globalData.mockMode) {
      this.globalData.openid = 'demo-openid'
      this.globalData.openidReady = true
      this.globalData.userInfoReady = true
      this.setUserInfo(require('./utils/mockDb')._clone(require('./utils/mockDb')._state.user[0]))
      return Promise.resolve(this.globalData.openid)
    }

    // 创建新的Promise并保存
    let that = this;
    
    this.globalData.openidPromise = new Promise(async (resolve, reject) => {
      try {
        const res = await wx.cloud.callFunction({
          name: 'login'
        });
        const openid = res.result && res.result.openid;
        if (!openid) {
          throw new Error('获取openid失败')
        }
        that.globalData.openid = openid;
        await that.syncUserRecord()
        
        // 标记openid已准备好
        that.globalData.openidReady = true;
        that.globalData.userInfoReady = true;
        resolve(openid);
      } catch (error) {
        console.error('获取openid失败', error);
        that.globalData.openidPromise = null;
        reject(error);
      }
    });
    
    return this.globalData.openidPromise;
  },
  
  // 检查openid是否已获取，供页面使用
  checkOpenid: function() {
    return this.getOpenidPromise();
  },

  syncUserRecord: function(updateData = {}) {
    const previousTask = this.globalData.userInfoPromise || Promise.resolve()
    const task = previousTask.catch(() => {}).then(async () => {
      const res = await wx.cloud.callFunction({
        name: 'userProfile',
        data: {
          updateData
        }
      })
      if (!res.result || !res.result.success || !res.result.data) {
        throw new Error(res.result?.error || '同步用户信息失败')
      }
      this.setUserInfo(res.result.data)
      return this.globalData.userInfo
    })

    const trackedTask = task.finally(() => {
      if (this.globalData.userInfoPromise === trackedTask) {
        this.globalData.userInfoPromise = null
      }
    })
    this.globalData.userInfoPromise = trackedTask
    return trackedTask
  },

  saveUserProfile: async function(updateData = {}) {
    const openid = await this.checkOpenid()
    if (!openid) {
      throw new Error('获取openid失败')
    }

    return this.syncUserRecord(updateData)
  },

  setUserInfo: function(userInfo) {
    this.globalData.userInfo = {
      ...(this.globalData.userInfo || {}),
      ...(userInfo || {})
    }
    this.globalData.userInfoReady = true

    const listeners = this.userInfoListeners || []
    listeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener(this.globalData.userInfo)
      }
    })
  },

  onUserInfoChange: function(listener) {
    if (!this.userInfoListeners) {
      this.userInfoListeners = []
    }
    if (typeof listener === 'function') {
      this.userInfoListeners.push(listener)
    }
  },

  offUserInfoChange: function(listener) {
    if (!this.userInfoListeners || typeof listener !== 'function') {
      return
    }
    this.userInfoListeners = this.userInfoListeners.filter(item => item !== listener)
  },

  // 检查小程序更新
  checkForUpdate: function() {
    // 判断是否支持更新API
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()

      // 检查更新
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          console.log('发现新版本')
        }
      })

      // 更新下载完成
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          showCancel: true,
          confirmText: '立即更新',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              // 应用新版本
              updateManager.applyUpdate()
            }
          }
        })
      })

      // 更新失败
      updateManager.onUpdateFailed(() => {
        wx.showModal({
          title: '更新失败',
          content: '新版本下载失败，请删除小程序后重新打开',
          showCancel: false
        })
      })
    } else {
      // 不支持更新API，静默处理，不打扰用户
      console.log('当前微信版本不支持更新API')
    }
  }
})
