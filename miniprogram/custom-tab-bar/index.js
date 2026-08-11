Component({
  data: {
    selected: 0,
    interactionLocked: false,
    list: [
      { pagePath: 'pages/index/index', text: '点餐', icon: '/images/tabBar/buy.png', iconActive: '/images/tabBar/buy-active.png' },
      { pagePath: 'pages/recharge/recharge', text: '充值', icon: '/images/tabBar/recharge.png', iconActive: '/images/tabBar/recharge-active.png' },
      { pagePath: 'pages/myorder/myorder', text: '订单', icon: '/images/tabBar/myOrder.png', iconActive: '/images/tabBar/myOrder-active.png' },
      { pagePath: 'pages/myhome/myhome', text: '我的', icon: '/images/tabBar/me.png', iconActive: '/images/tabBar/me-active.png' }
    ]
  },

  pageLifetimes: {
    show() {
      this.switching = false
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentPath = currentPage && currentPage.route
      const selected = this.data.list.findIndex(item => item.pagePath === currentPath)
      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected })
      }
    }
  },

  methods: {
    switchTab(e) {
      if (this.data.interactionLocked || this.switching) return
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item || index === this.data.selected) return

      const previous = this.data.selected
      this.switching = true
      this.setData({ selected: index }, () => {
        wx.switchTab({
          url: `/${item.pagePath}`,
          fail: () => this.setData({ selected: previous }),
          complete: () => {
            this.switching = false
          }
        })
      })
    }
  }
})
