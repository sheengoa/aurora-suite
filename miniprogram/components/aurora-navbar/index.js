Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    variant: {
      type: String,
      value: 'default'
    },
    overlay: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    navSideWidth: 76,
    titleRightSpace: 64
  },

  lifetimes: {
    attached() {
      this.updateLayout()
    }
  },

  methods: {
    updateLayout() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      const screenWidth = windowInfo.screenWidth || windowInfo.windowWidth || 375
      let navBarHeight = 44
      let titleRightSpace = 64

      try {
        const menuButton = wx.getMenuButtonBoundingClientRect()
        if (menuButton && menuButton.height) {
          navBarHeight = Math.max(
            44,
            (menuButton.top - statusBarHeight) * 2 + menuButton.height
          )
          titleRightSpace = Math.max(
            64,
            screenWidth - menuButton.left + 8
          )
        }
      } catch (err) {
        console.warn('获取胶囊位置失败，使用默认导航尺寸', err)
      }

      this.setData({
        statusBarHeight,
        navBarHeight,
        navSideWidth: screenWidth <= 360 ? 72 : 76,
        titleRightSpace
      })
    },

    handleBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    }
  }
})
