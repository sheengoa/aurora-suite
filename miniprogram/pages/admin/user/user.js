// pages/admin/user/user.js
const db = require('../../../utils/adminDb')
const { callAdminFunction } = require('../../../utils/adminAuth')

Page({
  data: {
    users: [],
    searchKeyword: '',
    showBalanceModal: false,
    currentUser: null,
    editBalance: 0,
    isMember: false,
    // 分页相关
    userPage: 0,
    userPageSize: 20,
    userHasMore: true,
    loadingUsers: false
  },

  onLoad() {
    this.loadUsers()
  },

  onShow() {
    this.loadUsers()
  },

  // 加载用户列表
  async loadUsers(append = false) {
    if (this.data.loadingUsers) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingUsers: true })

    try {
      const keyword = this.data.searchKeyword.trim()
      const pageSize = this.data.userPageSize
      const page = append ? this.data.userPage + 1 : 0
      
      // 调用云函数获取用户列表（使用聚合查询）
      const res = await callAdminFunction('getUserList', {
        keyword,
        page,
        pageSize
      })
      
      if (res.result && res.result.success) {
        const { list, hasMore } = res.result.data
        
        const newUsers = append ? this.data.users.concat(list) : list

        this.setData({
          users: newUsers,
          userPage: page,
          userHasMore: hasMore
        })
      } else {
        throw new Error(res.result?.error || '获取用户列表失败')
      }
    } catch (err) {
      console.error('加载用户失败', err)
      if (!append) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingUsers: false })
    }
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
      editBalance: user.balance || 0
    })
  },

  // 关闭余额弹窗
  closeBalanceModal() {
    this.setData({
      showBalanceModal: false,
      currentUser: null
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

  // 保存余额
  async saveBalance() {
    const { currentUser, editBalance } = this.data

    if (editBalance < 0) {
      wx.showToast({
        title: '余额不能为负数',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      await db.collection('user').doc(currentUser._id).update({
        data: {
          balance: editBalance
        }
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
        title: '保存失败',
        icon: 'none'
      })
    }
  }
})
