// pages/admin/admin.js
const { callAdminApi, verifyAdminSession } = require('../../utils/adminAuth')

Page({
  data: {
    showPasswordModal: false,
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    statusBarHeight: 0,
    navBarHeight: 44,
    navSideWidth: 52
  },

  onLoad(options) {
    verifyAdminSession().then(valid => {
      if (!valid) {
        wx.showToast({ title: '管理员登录已失效', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 500)
      }
    })

    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    let navBarHeight = 44
    let navSideWidth = 52

    try {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.height) {
        navBarHeight = Math.max(
          44,
          (menuButton.top - statusBarHeight) * 2 + menuButton.height
        )
        navSideWidth = Math.max(
          52,
          windowInfo.windowWidth - menuButton.left + 8
        )
      }
    } catch (err) {
      console.warn('获取胶囊位置失败，使用默认导航尺寸', err)
    }

    this.setData({
      statusBarHeight,
      navBarHeight,
      navSideWidth
    })

    // 如果需要修改密码
    if (options.changePassword === 'true') {
      setTimeout(() => {
        this.showChangePassword()
      }, 500)
    }
  },

  // 菜品管理
  goToDish() {
    wx.navigateTo({
      url: '/pages/admin/dish/dish'
    })
  },

  // 用户管理
  goToUser() {
    wx.navigateTo({
      url: '/pages/admin/user/user'
    })
  },

  // 订单管理
  goToOrder() {
    wx.navigateTo({
      url: '/pages/admin/order/order'
    })
  },

  // 充值选项管理
  goToRechargeOptions() {
    wx.navigateTo({
      url: '/pages/admin/rechargeOptions/rechargeOptions'
    })
  },

  // 桌码管理
  goToTableCode() {
    wx.navigateTo({
      url: '/pages/admin/tableCode/tableCode'
    })
  },

  // 店铺设置
  goToShopSettings() {
    wx.navigateTo({
      url: '/pages/admin/shopSettings/shopSettings'
    })
  },

  // 打印机管理
  goToPrinter() {
    wx.navigateTo({
      url: '/pages/admin/printer/printer'
    })
  },

  // 显示修改密码弹窗
  showChangePassword() {
    this.setData({
      showPasswordModal: true,
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
  },

  // 关闭密码弹窗
  closePasswordModal() {
    this.setData({
      showPasswordModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入旧密码
  onOldPasswordInput(e) {
    this.setData({
      oldPassword: e.detail.value
    })
  },

  // 输入新密码
  onNewPasswordInput(e) {
    this.setData({
      newPassword: e.detail.value
    })
  },

  // 输入确认密码
  onConfirmPasswordInput(e) {
    this.setData({
      confirmPassword: e.detail.value
    })
  },

  // 确认修改密码
  async confirmChangePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data

    if (!oldPassword) {
      wx.showToast({
        title: '请输入原密码',
        icon: 'none'
      })
      return
    }

    if (!newPassword) {
      wx.showToast({
        title: '请输入新密码',
        icon: 'none'
      })
      return
    }

    if (newPassword.length < 6) {
      wx.showToast({
        title: '新密码长度不能少于6位',
        icon: 'none'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({
        title: '两次密码输入不一致',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '修改中...' })
      
      await callAdminApi('changePassword', {
        oldPassword,
        newPassword
      })

      wx.hideLoading()
      wx.showToast({
        title: '密码修改成功',
        icon: 'success'
      })
      
      this.closePasswordModal()
    } catch (err) {
      wx.hideLoading()
      console.error('修改密码失败', err)
      wx.showToast({
        title: '修改失败，请重试',
        icon: 'none'
      })
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})
