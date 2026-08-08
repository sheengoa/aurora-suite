Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/index/index', text: '点餐', icon: 'cuIcon-fork' },
      { pagePath: 'pages/recharge/recharge', text: '充值', icon: 'cuIcon-moneybagfill' },
      { pagePath: 'pages/myorder/myorder', text: '订单', icon: 'cuIcon-formfill' },
      { pagePath: 'pages/myhome/myhome', text: '我的', icon: 'cuIcon-myfill' }
    ]
  },

  pageLifetimes: {
    show() {
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
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item || index === this.data.selected) return

      this.setData({ selected: index })
      wx.switchTab({
        url: `/${item.pagePath}`
      })
    }
  }
})
