// pages/admin/user/user.js
const db = require('../../../utils/adminDb')
const { callAdminFunction } = require('../../../utils/adminAuth')

function maskPhone(phone) {
  const value = String(phone || '')
  return /^1\d{10}$/.test(value) ? `${value.slice(0, 3)}****${value.slice(7)}` : value
}

Page({
  data: {
    users: [],
    searchKeyword: '',
    showBalanceModal: false,
    currentUser: null,
    currentUserAvatarLoadFailed: false,
    editBalance: 0,
    balanceReason: '',
    balanceLogs: [],
    loadingBalanceLogs: false,
    savingBalance: false,
    isMember: false,
    // 分页相关
    userPage: 0,
    userPageSize: 20,
    userHasMore: true,
    loadingUsers: false
  },

  onShow() {
    this.loadUsers()
  },

  // 加载用户列表
  async loadUsers(append = false) {
    let loadFailed = false

    if (append && this.data.loadingUsers) {
      return false
    }

    const requestId = (this.userRequestId || 0) + 1
    this.userRequestId = requestId
    const keyword = this.data.searchKeyword.trim()

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingUsers: true })

    try {
      const pageSize = this.data.userPageSize
      const page = append ? this.data.userPage + 1 : 0
      
      // 调用云函数获取用户列表（使用聚合查询）
      const res = await callAdminFunction('getUserList', {
        keyword,
        page,
        pageSize
      })

      if (requestId !== this.userRequestId || keyword !== this.data.searchKeyword.trim()) {
        return false
      }
      
      if (res.result && res.result.success) {
        const { list, hasMore } = res.result.data
        const displayList = (list || []).map(user => ({
          ...user,
          maskedPhone: user.maskedPhone || maskPhone(user.phoneNumber)
        }))
        
        const newUsers = append ? this.data.users.concat(displayList) : displayList

        this.setData({
          users: newUsers,
          userPage: page,
          userHasMore: hasMore
        })
        return true
      } else {
        throw new Error(res.result?.error || '获取用户列表失败')
      }
    } catch (err) {
      console.error('加载用户失败', err)
      if (!append && requestId === this.userRequestId) {
        loadFailed = true
      }
    } finally {
      if (requestId === this.userRequestId && !append) {
        wx.hideLoading()
      }
      if (requestId === this.userRequestId) {
        this.setData({ loadingUsers: false })
      }
    }

    if (requestId === this.userRequestId && loadFailed) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    return false
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.userHasMore && !this.data.loadingUsers) {
      this.loadUsers(true)
    }
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  // 执行搜索
  doSearch() {
    this.loadUsers()
  },

  // 清空搜索
  clearSearch() {
    this.setData({
      searchKeyword: '',
      // 重置分页状态
      userPage: 0,
      userHasMore: true,
      users: []
    }, () => {
      this.loadUsers()
    })
  },

  // 显示编辑余额弹窗
  showEditBalanceModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showBalanceModal: true,
      currentUser: user,
      currentUserAvatarLoadFailed: false,
      editBalance: user.balance || 0,
      balanceReason: '',
      balanceLogs: []
    }, () => this.loadBalanceLogs(user._id))
  },

  onUserAvatarError(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isNaN(index)) {
      this.setData({ [`users[${index}].avatarLoadFailed`]: true })
    }
  },

  onCurrentUserAvatarError() {
    this.setData({ currentUserAvatarLoadFailed: true })
  },

  // 关闭余额弹窗
  closeBalanceModal() {
    this.setData({
      showBalanceModal: false,
      currentUser: null,
      balanceReason: '',
      balanceLogs: []
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入余额
  onBalanceInput(e) {
    this.setData({
      editBalance: parseFloat(e.detail.value) || 0
    })
  },

  onBalanceReasonInput(e) {
    this.setData({ balanceReason: e.detail.value })
  },

  async loadBalanceLogs(userId) {
    if (!userId) return
    this.setData({ loadingBalanceLogs: true })
    try {
      const result = await callAdminFunction('adminApi', {
        action: 'listBalanceLogs',
        userId
      })
      if (!result.result || !result.result.success) {
        throw new Error(result.result?.error || '读取余额流水失败')
      }
      const logs = (result.result.data || []).slice(0, 10).map(item => ({
        ...item,
        amountText: `${Number(item.amount || 0) >= 0 ? '+' : ''}${Number(item.amount || 0).toFixed(2)}`,
        changeText: `¥${Number(item.before || 0).toFixed(2)} → ¥${Number(item.after || 0).toFixed(2)}`
      }))
      this.setData({ balanceLogs: logs })
    } catch (err) {
      console.error('读取余额流水失败', err)
      wx.showToast({ title: err.message || '流水加载失败', icon: 'none' })
    } finally {
      this.setData({ loadingBalanceLogs: false })
    }
  },

  // 保存余额
  async saveBalance() {
    const { currentUser, editBalance } = this.data
    const balanceReason = String(this.data.balanceReason || '').trim()

    if (this.data.savingBalance) return

    if (editBalance < 0) {
      wx.showToast({
        title: '余额不能为负数',
        icon: 'none'
      })
      return
    }

    if (!balanceReason) {
      wx.showToast({ title: '请填写调账原因', icon: 'none' })
      return
    }

    try {
      this.setData({ savingBalance: true })
      wx.showLoading({ title: '保存中...' })

      await callAdminFunction('adminApi', {
        action: 'adjustBalance',
        userId: currentUser._id,
        balance: Number(editBalance),
        reason: balanceReason
      })

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeBalanceModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ savingBalance: false })
    }
  }
})
