// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()
const { normalizeDish: normalizeDishData } = require('../../utils/dish')
const {
  generateCartKey: createCartKey,
  getStoredCart,
  saveStoredCart
} = require('../../utils/cart')
const {
  isScanCancelled,
  normalizeTableNumber,
  scanTableCodeFromCamera
} = require('../../utils/tableCode')
const {
  DEFAULT_SHOP_SETTINGS,
  loadShopSettings: fetchShopSettings
} = require('../../utils/shopSettings')

const CATEGORY_SUBTITLES = {
  招牌面食: 'Signature Noodles',
  特惠套餐: 'Value Sets',
  热炒小菜: 'Hot Dishes',
  饮品甜点: 'Drinks & Desserts'
}
const WELCOME_COLLAPSE_DISTANCE = 260
const WELCOME_SNAP_THRESHOLD = 0.46
const WELCOME_PROJECTION_TIME = 0.14

function clone(data) {
  return JSON.parse(JSON.stringify(data || {}))
}

function getWelcomeLayout(windowHeight) {
  const height = Math.max(568, Math.min(844, Number(windowHeight) || 844))
  const ratio = (height - 568) / (844 - 568)
  return {
    cardTop: Math.round(210 + 142 * ratio),
    cardHeight: Math.round(96 + 16 * ratio),
    stageTop: Math.round(314 + 158 * ratio)
  }
}

Page({
  data: {
    menuList: [],
    currentMenuId: '',
    goodsSections: [],
    goodsScrollTop: 0,
    goodsScrollAnimation: true,
    menuScrollEnabled: false,
    menuAtTop: true,
    verticalNavTop: 0,
    sectionMetrics: [],
    hasMoreGoodsSections: false,
    allGoodsEmpty: false,
    menuLoadError: false,
    cart: {},
    cartCount: 0,
    cartTotalPrice: 0,
    cartTotalPriceText: '0.00',
    showCart: false,
    userInfo: null,
    shopName: DEFAULT_SHOP_SETTINGS.shopName,
    isOpen: DEFAULT_SHOP_SETTINGS.isOpen,
    welcomeNamePrimary: 'Aurora',
    welcomeNameSecondary: '小餐馆',
    welcomeText: DEFAULT_SHOP_SETTINGS.welcomeText,
    showTagModal: false,
    currentDish: null,
    modalSkus: [],
    modalTags: [],
    selectedSkuId: '',
    selectedTags: {},
    modalDishCount: 1,
    modalTotalPrice: 0,
    cartImageFailures: {},
    currentDishImageFailed: false,
    showAuthModal: false,
    statusBarHeight: 0,
    storefrontTop: 128,
    heroHeight: 506,
    welcomeProgress: 0,
    welcomeState: 'expanded',
    welcomeCardTop: 352,
    welcomeCardHeight: 112,
    welcomeCardInset: 24,
    welcomeCardRadius: 28,
    welcomeCardOffsetY: 280,
    welcomeExpandedCardTop: 352,
    welcomeExpandedCardHeight: 112,
    welcomeExpandedStageTop: 472,
    welcomeCollapsedCardTop: 72,
    welcomeCollapsedStageTop: 142,
    welcomeStageTop: 472,
    welcomeStageOffsetY: 330,
    welcomeCardContentOpacity: 1,
    welcomeCompactOpacity: 0,
    welcomeCopyOpacity: 1,
    welcomeCopyY: 0,
    welcomeHintOpacity: 1,
    welcomeSettleDuration: 320,
    tableNumber: '',
    goodsPageSize: 20,
    goodsLoading: false,
    loadingNextSection: false,
    prefetchingSections: false
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 0
    const windowHeight = systemInfo.windowHeight || 844
    const compactHeight = windowHeight < 680
    const storefrontTop = compactHeight
      ? Math.max(80, statusBarHeight + 60)
      : Math.max(104, statusBarHeight + 80)
    const welcomeLayout = getWelcomeLayout(windowHeight)
    let welcomeCollapsedCardTop = statusBarHeight + 52

    try {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      if (menuButton && menuButton.bottom) {
        welcomeCollapsedCardTop = menuButton.bottom + 8
      }
    } catch (err) {
      console.warn('获取胶囊位置失败，使用默认收起位置', err)
    }
    const welcomeCollapsedStageTop = welcomeCollapsedCardTop + 78
    this.setData({
      statusBarHeight,
      storefrontTop,
      heroHeight: Math.max(Math.round(windowHeight * 0.62), welcomeLayout.stageTop),
      welcomeCardTop: welcomeLayout.cardTop,
      welcomeCardHeight: welcomeLayout.cardHeight,
      welcomeCardOffsetY: welcomeLayout.cardTop - welcomeCollapsedCardTop,
      welcomeCardInset: 24,
      welcomeCardRadius: 28,
      welcomeStageTop: welcomeLayout.stageTop,
      welcomeStageOffsetY: welcomeLayout.stageTop - welcomeCollapsedStageTop,
      welcomeExpandedCardTop: welcomeLayout.cardTop,
      welcomeExpandedCardHeight: welcomeLayout.cardHeight,
      welcomeExpandedStageTop: welcomeLayout.stageTop,
      welcomeCollapsedCardTop,
      welcomeCollapsedStageTop,
      welcomeNamePrimary: this.getWelcomeNameParts(DEFAULT_SHOP_SETTINGS.shopName).primary,
      welcomeNameSecondary: this.getWelcomeNameParts(DEFAULT_SHOP_SETTINGS.shopName).secondary,
      tableNumber: app.globalData.mockMode ? '3' : ''
    }, () => this.updateWelcomeMotion(0, true))
    this.updateCart(getStoredCart())

    if (options.scene) {
      try {
        const scene = normalizeTableNumber(options.scene)
        if (scene) {
          this.setData({
            tableNumber: scene
          })
          wx.showToast({
            title: `桌码：${scene}`,
            icon: 'success',
            duration: 2000
          })
        }
      } catch (e) {
        console.error('解析scene参数失败', e)
      }
    }

    this.loadMenu()
    this.loadUserInfo()
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
    this.syncTabBarInteractionLock()
    this.updateCart(getStoredCart())
    this.loadUserInfo()
    this.loadShopSettings()
  },

  onHide() {
    if (this.pendingWelcomeTarget !== null && typeof this.pendingWelcomeTarget !== 'undefined') {
      this.commitWelcomePosition(this.pendingWelcomeTarget)
    }
    this.setTabBarInteractionLocked(false)
    if (this.welcomeMotionTimer) {
      clearTimeout(this.welcomeMotionTimer)
      this.welcomeMotionTimer = null
    }
    if (this.welcomeSettleTimer) {
      clearTimeout(this.welcomeSettleTimer)
      this.welcomeSettleTimer = null
    }
    if (this.welcomeSnapTimer) {
      clearTimeout(this.welcomeSnapTimer)
      this.welcomeSnapTimer = null
    }
  },

  onUnload() {
    if (this.welcomeMotionTimer) clearTimeout(this.welcomeMotionTimer)
    if (this.welcomeSettleTimer) clearTimeout(this.welcomeSettleTimer)
    if (this.welcomeSnapTimer) clearTimeout(this.welcomeSnapTimer)
    if (this.goodsScrollTimer) clearTimeout(this.goodsScrollTimer)
  },

  beginWelcomeSettle(payload = {}) {
    const target = Number(payload.target) >= 1 ? 1 : 0
    const duration = Math.max(0, Number(payload.duration) || 0)
    this.pendingWelcomeTarget = target
    if (this.welcomeSettleTimer) clearTimeout(this.welcomeSettleTimer)
    this.setData({
      welcomeState: 'settling',
      welcomeSettleDuration: duration
    }, () => this.updateWelcomeMotion(target, true, 'settling'))
    this.welcomeSettleTimer = setTimeout(() => {
      this.welcomeSettleTimer = null
      if (this.pendingWelcomeTarget === target) {
        this.commitWelcomePosition(target)
      }
    }, duration + 80)
  },

  lockMenuForWelcomeMotion() {
    if (!this.data.menuScrollEnabled) return
    this.setData({
      menuScrollEnabled: false,
      goodsScrollAnimation: false,
      goodsScrollTop: 0,
      menuAtTop: true
    })
  },

  updateWelcomeMotion(progress = 0, immediate = false, stateOverride = '') {
    const nextProgress = Math.max(0, Math.min(1, Number(progress) || 0))
    const visualProgress = nextProgress
    const expandedHeight = this.data.welcomeExpandedCardHeight || 112
    const visualHeight = expandedHeight + (68 - expandedHeight) * visualProgress
    const cardOffsetY = (this.data.welcomeExpandedCardTop - this.data.welcomeCollapsedCardTop) * (1 - visualProgress)
    const stageOffsetY = (this.data.welcomeExpandedStageTop - this.data.welcomeCollapsedStageTop) * (1 - visualProgress)
    // 收起态使用充值页白色卡片同级的 24rpx 固定圆角，不再缩放卡片表面。
    const visualRadius = 28 - 16 * visualProgress
    const state = nextProgress >= 0.985 ? 'collapsed' : nextProgress > 0.005 ? 'collapsing' : 'expanded'
    const next = {
      welcomeProgress: nextProgress,
      welcomeState: stateOverride || state,
      welcomeCardTop: this.data.welcomeCollapsedCardTop + cardOffsetY,
      welcomeCardHeight: visualHeight,
      welcomeCardInset: 24 - 14 * visualProgress,
      welcomeCardRadius: visualRadius,
      welcomeCardOffsetY: cardOffsetY,
      welcomeStageTop: this.data.welcomeCollapsedStageTop + stageOffsetY,
      welcomeStageOffsetY: stageOffsetY,
      welcomeCardContentOpacity: Math.max(0, Math.min(1, 1 - (visualProgress - 0.34) / 0.16)),
      welcomeCompactOpacity: Math.max(0, Math.min(1, (visualProgress - 0.50) / 0.16)),
      welcomeCopyOpacity: Math.max(0, 1 - visualProgress / 0.62),
      welcomeCopyY: -22 * visualProgress,
      welcomeHintOpacity: Math.max(0, 1 - visualProgress / 0.42)
    }
    if (immediate) {
      this.setData(next)
      return
    }
    if (this.welcomeMotionTimer) return
    this.welcomeMotionTimer = setTimeout(() => {
      this.welcomeMotionTimer = null
      this.setData(next)
    }, 16)
  },

  getWelcomeTouchY(event) {
    const touch = event && event.touches && event.touches[0]
      ? event.touches[0]
      : event && event.changedTouches && event.changedTouches[0]
    if (!touch) return null
    const value = typeof touch.clientY === 'undefined' ? touch.pageY : touch.clientY
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  },

  getWelcomeTouchTime(event, previous = 0) {
    const value = Number(event && event.timeStamp) || Date.now()
    return value > previous ? value : previous + 16
  },

  onWelcomeTouchStart(event) {
    if (this.pendingWelcomeTarget !== null && typeof this.pendingWelcomeTarget !== 'undefined') return
    const startY = this.getWelcomeTouchY(event)
    if (startY === null) return

    const dataset = event && event.currentTarget && event.currentTarget.dataset || {}
    const source = dataset.motionSource || 'viewport'
    const startProgress = Math.max(0, Math.min(1, Number(this.data.welcomeProgress) || 0))
    const menuAtTop = dataset.menuAtTop === true || dataset.menuAtTop === 'true' || this.data.menuAtTop
    if (source === 'menu' && startProgress >= 0.999 && !menuAtTop) return

    const startTime = this.getWelcomeTouchTime(event)
    this.welcomeTouchState = {
      source,
      handled: source === 'viewport' || startProgress < 0.999,
      moved: false,
      startY,
      lastY: startY,
      lastTime: startTime,
      startProgress,
      progress: startProgress,
      velocityY: 0
    }
  },

  onWelcomeTouchMove(event) {
    const state = this.welcomeTouchState
    const currentY = this.getWelcomeTouchY(event)
    if (!state || currentY === null) return

    const deltaY = currentY - state.startY
    const currentTime = this.getWelcomeTouchTime(event, state.lastTime)
    const elapsed = Math.max(8, currentTime - state.lastTime)
    const instantVelocity = (currentY - state.lastY) * 1000 / elapsed
    state.lastY = currentY
    state.lastTime = currentTime
    state.velocityY = state.velocityY * 0.65 + instantVelocity * 0.35
    state.moved = state.moved || Math.abs(deltaY) >= 3

    if (!state.handled) {
      if (state.startProgress >= 0.999 && deltaY > 2) {
        state.handled = true
        this.lockMenuForWelcomeMotion()
      } else {
        return
      }
    }

    const nextProgress = state.startProgress < 0.999
      ? state.startProgress - deltaY / WELCOME_COLLAPSE_DISTANCE
      : 1 - deltaY / WELCOME_COLLAPSE_DISTANCE
    const progress = Math.max(0, Math.min(1, nextProgress))
    if (Math.abs(progress - state.progress) < 0.001) return
    state.progress = progress
    this.updateWelcomeMotion(progress, true)
  },

  onWelcomeTouchEnd(event) {
    const state = this.welcomeTouchState
    this.welcomeTouchState = null
    if (!state || !state.handled || !state.moved) return

    const endTime = this.getWelcomeTouchTime(event, state.lastTime)
    const idleTime = Math.max(0, endTime - state.lastTime)
    const idleWeight = Math.max(0, Math.min(1, 1 - idleTime / 96))
    const velocity = Math.max(-2200, Math.min(2200, state.velocityY * idleWeight))
    const current = Math.max(0, Math.min(1, state.progress))
    const projected = Math.max(0, Math.min(1,
      current - velocity * WELCOME_PROJECTION_TIME / WELCOME_COLLAPSE_DISTANCE
    ))
    const target = projected >= WELCOME_SNAP_THRESHOLD ? 1 : 0
    const distance = Math.abs(target - current)

    if (distance < 0.002) {
      this.commitWelcomePosition(target)
      return
    }

    const speed = Math.min(1800, Math.abs(velocity))
    const duration = Math.round(Math.max(200, Math.min(390,
      260 + distance * 150 - speed * 0.035
    )))
    this.beginWelcomeSettle({ target, duration })
  },

  commitWelcomePosition(progress) {
    const target = progress >= 1 ? 1 : 0
    this.pendingWelcomeTarget = null
    this.welcomeTouchState = null
    if (this.welcomeSettleTimer) {
      clearTimeout(this.welcomeSettleTimer)
      this.welcomeSettleTimer = null
    }
    this.welcomeLatched = target === 1
    this.currentGoodsScrollTop = 0
    this.updateWelcomeMotion(target, true)
    this.setData({
      goodsScrollAnimation: false,
      goodsScrollTop: 0,
      menuScrollEnabled: target === 1,
      menuAtTop: true
    }, () => {
      this.setData({ goodsScrollAnimation: true })
    })
  },

  onGoodsScroll(event) {
    const scrollTop = Math.max(0, Number(event && event.detail && event.detail.scrollTop) || 0)
    const menuAtTop = scrollTop <= 1
    if (menuAtTop !== this.data.menuAtTop) {
      this.setData({ menuAtTop })
    }
    if (!this.data.menuScrollEnabled || !this.welcomeLatched) {
      this.currentGoodsScrollTop = 0
      if (scrollTop > 1 && this.data.goodsScrollTop !== 0) {
        this.setData({ goodsScrollAnimation: false, goodsScrollTop: 0, menuAtTop: true })
      }
      return
    }
    this.currentGoodsScrollTop = scrollTop
    if (this.isMenuJumping) return
    if (this.goodsScrollTimer) clearTimeout(this.goodsScrollTimer)
    this.goodsScrollTimer = setTimeout(() => this.updateCurrentMenuByScroll(scrollTop), 70)
  },

  async loadShopSettings() {
    const settings = await fetchShopSettings(db)
    const nameParts = this.getWelcomeNameParts(settings.shopName)
    this.setData({ ...settings, welcomeNamePrimary: nameParts.primary, welcomeNameSecondary: nameParts.secondary })
  },

  getWelcomeNameParts(name) {
    const value = String(name || '').trim()
    const parts = value.split(/\s+/)
    if (parts.length > 1) {
      return { primary: parts.shift(), secondary: parts.join(' ') }
    }
    return { primary: value, secondary: '' }
  },

  normalizeDish(goods) {
    const dish = normalizeDishData(goods)
    return {
      ...dish,
      requiresSelection: dish.hasMultipleSkus || (dish.tags || []).length > 0
    }
  },

  getDefaultSku(goods) {
    const dish = this.normalizeDish(goods)
    return (dish.enabledSkus || [])[0] || null
  },

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

        app.globalData.userInfo = user
        this.setData({
          userInfo: user
        })
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },

  createGoodsSection(category, index) {
    return {
      categoryId: category._id,
      categoryName: category.name,
      categorySubtitle: CATEGORY_SUBTITLES[category.name] || 'Aurora Menu',
      anchorId: `section-${index}`,
      menuAnchorId: `menu-${index}`,
      goods: [],
      page: -1,
      hasMore: true,
      loading: false,
      loaded: false,
      showEmpty: false,
      prefetching: false,
      hidden: false
    }
  },

  async filterCategoriesWithGoods(categories) {
    const checks = await Promise.all(categories.map(async category => {
      try {
        const res = await db.collection('dish')
          .where({
            categoryId: category._id,
            status: 1
          })
          .limit(1)
          .get()

        return {
          category,
          hasGoods: (res.data || []).length > 0
        }
      } catch (err) {
        console.error('检查分类菜品失败', category.name, err)
        return {
          category,
          hasGoods: true
        }
      }
    }))

    return checks
      .filter(item => item.hasGoods)
      .map(item => item.category)
  },

  async loadMenu(showLoading = true) {
    let feedbackTitle = ''

    if (showLoading) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ menuLoadError: false })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getCategory'
      })
      const result = res.result || {}
      const list = result.success ? (result.data || []) : []
      const visibleList = await this.filterCategoriesWithGoods(list)
      const goodsSections = visibleList.map((item, index) => this.createGoodsSection(item, index))

      this.setData({
        menuList: visibleList,
        goodsSections,
        currentMenuId: visibleList.length > 0 ? visibleList[0]._id : '',
        goodsScrollTop: 0,
        goodsScrollAnimation: true,
        menuAtTop: true,
        verticalNavTop: 0,
        sectionMetrics: [],
        goodsLoading: false,
        loadingNextSection: false,
        prefetchingSections: false,
        hasMoreGoodsSections: visibleList.length > 0,
        allGoodsEmpty: visibleList.length === 0,
        menuLoadError: false
      })

      if (visibleList.length > 0) {
        await this.loadGoodsForSection(0, { showLoading: false, showEmpty: false })
        this.setActiveSection(0, false)
        this.prefetchUntilScrollable()
      } else if (showLoading) {
        feedbackTitle = '暂无可售菜品'
      }
    } catch (err) {
      console.error('加载菜品分类失败', err)
      this.setData({
        menuList: [],
        goodsSections: [],
        currentMenuId: '',
        hasMoreGoodsSections: false,
        allGoodsEmpty: false,
        menuLoadError: true
      })
      if (showLoading) {
        feedbackTitle = '菜品加载失败'
      }
    } finally {
      if (showLoading) {
        wx.hideLoading()
      }
    }

    if (feedbackTitle) {
      wx.showToast({ title: feedbackTitle, icon: 'none' })
    }
  },

  retryLoadMenu() {
    this.loadMenu()
  },

  getSectionIndexById(categoryId) {
    return this.data.goodsSections.findIndex(section => section.categoryId === categoryId)
  },

  getHasMoreGoodsSections(sections) {
    return sections.some(section => section.loading || !section.loaded || section.hasMore)
  },

  getAllGoodsEmpty(sections) {
    return sections.length > 0 &&
      sections.every(section => section.loaded && !section.loading) &&
      sections.every(section => !section.goods || section.goods.length === 0)
  },

  getVerticalNavTop(index) {
    return Math.max(0, (index - 2) * 50)
  },

  refreshSectionMetrics(callback) {
    const measure = () => {
      const query = wx.createSelectorQuery().in(this)
      query.selectAll('.goods-section').boundingClientRect()
      query.exec(res => {
        const rects = res && res[0] ? res[0] : []
        let top = 0

        const metrics = rects.map(rect => {
          const index = Number(String(rect.id || '').replace('section-', ''))
          const height = rect.height || Math.max(0, (rect.bottom || 0) - (rect.top || 0))
          const metric = {
            index,
            top,
            bottom: top + height,
            height
          }

          top += height
          return metric
        }).filter(item => !Number.isNaN(item.index) && item.height > 0)

        this.setData({
          sectionMetrics: metrics
        }, () => {
          if (typeof callback === 'function') {
            callback(metrics)
          }
        })
      })
    }

    if (typeof wx.nextTick === 'function') {
      wx.nextTick(measure)
      return
    }

    setTimeout(measure, 0)
  },

  scrollToSection(index, extraData = {}, retry = 0) {
    this.refreshSectionMetrics(metrics => {
      const metric = metrics.find(item => item.index === index)
      if (!metric) {
        if (retry < 2) {
          setTimeout(() => {
            this.scrollToSection(index, extraData, retry + 1)
          }, 80)
          return
        }

        this.setData(extraData)
        return
      }

      const scrollTop = Math.max(0, metric.top)
      const data = {
        ...extraData,
        goodsScrollAnimation: true,
        goodsScrollTop: scrollTop
      }

      this.lockMenuJump(index)

      if (Math.abs((this.data.goodsScrollTop || 0) - scrollTop) < 1) {
        this.setData({
          ...data,
          goodsScrollAnimation: false,
          goodsScrollTop: scrollTop + 1
        }, () => {
          this.setData({
            goodsScrollAnimation: true,
            goodsScrollTop: scrollTop
          })
        })
        return
      }

      this.setData(data)
    })
  },

  lockMenuJump(index) {
    if (this.goodsScrollTimer) {
      clearTimeout(this.goodsScrollTimer)
      this.goodsScrollTimer = null
    }

    if (this.menuJumpTimer) {
      clearTimeout(this.menuJumpTimer)
    }

    this.isMenuJumping = true
    this.menuJumpIndex = index
    this.menuJumpTimer = setTimeout(() => {
      this.isMenuJumping = false
      this.menuJumpIndex = null
      this.prefetchUntilScrollable()
    }, 700)
  },

  waitForSectionReady(index, timeout = 3000) {
    const startedAt = Date.now()

    return new Promise(resolve => {
      const check = () => {
        const section = this.data.goodsSections[index]

        if (!section || !section.loading || Date.now() - startedAt >= timeout) {
          resolve(section)
          return
        }

        setTimeout(check, 80)
      }

      check()
    })
  },

  syncCartCountInSections(sections, cart = this.data.cart) {
    return sections.map(section => ({
      ...section,
      goods: (section.goods || []).map(goods => ({
        ...goods,
        cartCount: this.getDishCartCount(goods._id, cart)
      }))
    }))
  },

  updateSectionState(index, partial) {
    const sections = this.data.goodsSections.slice()
    if (!sections[index]) return

    sections[index] = {
      ...sections[index],
      ...partial
    }

    this.setData({
      goodsSections: sections,
      hasMoreGoodsSections: this.getHasMoreGoodsSections(sections),
      allGoodsEmpty: this.getAllGoodsEmpty(sections)
    })
  },

  async loadGoodsForSection(index, options = {}) {
    const {
      append = false,
      showLoading = false,
      showEmpty = false,
      silent = false
    } = options
    const section = this.data.goodsSections[index]

    if (!section || section.loading) {
      return section
    }

    if (showLoading) {
      wx.showLoading({ title: '加载中...' })
    }

    this.updateSectionState(index, {
      loading: true,
      prefetching: silent
    })
    this.setData({ goodsLoading: true })

    try {
      const pageSize = this.data.goodsPageSize
      const page = append ? section.page + 1 : 0
      const skip = page * pageSize

      const goodsRes = await db.collection('dish')
        .where({
          categoryId: section.categoryId,
          status: 1
        })
        .orderBy('sort', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const list = goodsRes.data || []
      const mapped = list.map(goods => {
        const normalized = this.normalizeDish(goods)
        normalized.cartCount = this.getDishCartCount(normalized._id)
        return normalized
      })

      const latestSections = this.data.goodsSections.slice()
      const currentSection = latestSections[index] || section
      const goods = append ? (currentSection.goods || []).concat(mapped) : mapped

      latestSections[index] = {
        ...currentSection,
        goods,
        page,
        hasMore: list.length === pageSize,
        loading: false,
        loaded: true,
        showEmpty: false,
        hidden: goods.length === 0 && list.length < pageSize,
        prefetching: false
      }

      const syncedSections = this.syncCartCountInSections(latestSections)

      await new Promise(resolve => {
        this.setData({
          goodsSections: syncedSections,
          hasMoreGoodsSections: this.getHasMoreGoodsSections(syncedSections),
          allGoodsEmpty: this.getAllGoodsEmpty(syncedSections)
        }, () => {
          this.refreshSectionMetrics(resolve)
        })
      })

      return this.data.goodsSections[index] || syncedSections[index]
    } catch (err) {
      console.error('加载菜品失败', err)
      this.updateSectionState(index, {
        loading: false,
        loaded: true,
        hasMore: false,
        showEmpty: false,
        hidden: false,
        prefetching: false
      })
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
      return this.data.goodsSections[index]
    } finally {
      if (showLoading) {
        wx.hideLoading()
      }
      this.setData({ goodsLoading: false })
    }
  },

  setActiveSection(index, shouldScroll = true) {
    const section = this.data.goodsSections[index]
    if (!section || section.hidden) return

    const data = {
      currentMenuId: section.categoryId,
      verticalNavTop: this.getVerticalNavTop(index)
    }

    if (shouldScroll) {
      this.scrollToSection(index, data)
      return
    }

    this.setData(data, () => {
      this.refreshSectionMetrics()
    })
  },

  async switchMenu(e) {
    if (!this.data.menuScrollEnabled || !this.welcomeLatched) return
    const menuId = e.currentTarget.dataset.id
    const index = this.getSectionIndexById(menuId)
    const section = this.data.goodsSections[index]

    if (!section) return

    if (section.hidden) return

    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer)
      this.prefetchTimer = null
    }

    if (section.loading) {
      await this.waitForSectionReady(index)
    }

    const readySection = this.data.goodsSections[index]
    if (readySection && readySection.loading) {
      return
    }

    if (readySection && !readySection.loaded) {
      await this.loadGoodsForSection(index, { showLoading: true, showEmpty: true })
    }

    const latestSection = this.data.goodsSections[index]
    if (!latestSection || latestSection.hidden) {
      return
    }

    this.setActiveSection(index, true)
  },

  async loadNextSection(startIndex) {
    if (this.data.loadingNextSection) return

    this.setData({ loadingNextSection: true })

    try {
      const sections = this.data.goodsSections
      for (let i = startIndex; i < sections.length; i++) {
        let section = this.data.goodsSections[i]

        if (!section.loaded) {
          section = await this.loadGoodsForSection(i, { showLoading: false, showEmpty: false })
        }

        if ((section.goods || []).length > 0 || i === sections.length - 1) {
          this.prefetchUntilScrollable()
          return
        }
      }
    } finally {
      this.setData({
        loadingNextSection: false
      })
    }
  },

  async onGoodsScrollToLower() {
    if (!this.data.menuScrollEnabled || !this.welcomeLatched) return
    if (this.isMenuJumping) return

    if (this.data.loadingNextSection || this.data.goodsLoading) return

    const currentIndex = this.getSectionIndexById(this.data.currentMenuId)
    if (currentIndex < 0) return

    const currentSection = this.data.goodsSections[currentIndex]

    if (!currentSection.loaded) {
      await this.loadGoodsForSection(currentIndex)
      this.prefetchUntilScrollable()
      return
    }

    if (currentSection.hasMore) {
      await this.loadGoodsForSection(currentIndex, { append: true })
      this.prefetchUntilScrollable()
      return
    }

    await this.loadNextSection(currentIndex + 1)
  },

  updateCurrentMenuByScroll(scrollTop = this.currentGoodsScrollTop || 0) {
    const metrics = this.data.sectionMetrics || []

    if (metrics.length === 0) {
      this.refreshSectionMetrics(latestMetrics => {
        if (latestMetrics.length > 0) {
          this.updateCurrentMenuByScroll(scrollTop)
        }
      })
      return
    }

    const probeTop = Math.max(0, scrollTop) + 24
    let activeMetric = metrics[0]

    for (let i = 0; i < metrics.length; i++) {
      const metric = metrics[i]
      if (probeTop >= metric.top && probeTop < metric.bottom) {
        activeMetric = metric
        break
      }

      if (probeTop >= metric.top) {
        activeMetric = metric
      }
    }

    const section = this.data.goodsSections[activeMetric.index]

    if (section && !section.hidden && section.categoryId !== this.data.currentMenuId) {
      this.setData({
        currentMenuId: section.categoryId,
        verticalNavTop: this.getVerticalNavTop(activeMetric.index)
      })
    }
  },

  prefetchUntilScrollable() {
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer)
    }

    this.prefetchTimer = setTimeout(() => {
      this.ensureScrollableContent()
    }, 120)
  },

  ensureScrollableContent() {
    if (this.data.prefetchingSections || this.data.loadingNextSection || this.data.goodsLoading) {
      return
    }

    const query = wx.createSelectorQuery().in(this)
    query.select('.goods-list').boundingClientRect()
    query.select('.goods-list-inner').boundingClientRect()
    query.exec(res => {
      const container = res && res[0]
      const content = res && res[1]

      if (!container || !content) return
      if (this.data.prefetchingSections || this.data.loadingNextSection || this.data.goodsLoading) return

      if (content.bottom > container.bottom + 120) {
        return
      }

      const currentIndex = this.getSectionIndexById(this.data.currentMenuId)
      this.prefetchNextSections(currentIndex + 1)
    })
  },

  async prefetchNextSections(startIndex) {
    if (this.data.prefetchingSections || startIndex < 0) {
      return
    }

    this.setData({ prefetchingSections: true })
    let loadedNewSection = false

    try {
      for (let i = startIndex; i < this.data.goodsSections.length; i++) {
        let section = this.data.goodsSections[i]

        if (section.loaded) {
          continue
        }

        if (!section.loaded) {
          section = await this.loadGoodsForSection(i, {
            showLoading: false,
            showEmpty: false,
            silent: true
          })
          loadedNewSection = true
        }

        if ((section.goods || []).length > 0) {
          break
        }
      }
    } finally {
      this.setData({ prefetchingSections: false })
      if (loadedNewSection) {
        this.prefetchUntilScrollable()
      }
    }
  },

  buildInitialTags(goods) {
    const selectedTags = {}
    if (goods.tags && goods.tags.length > 0) {
      goods.tags.forEach(tag => {
        if (tag.type === 'multiple') {
          selectedTags[tag.id] = []
        }
      })
    }
    return selectedTags
  },

  openDishModal(goods) {
    const dish = this.normalizeDish(goods)
    if (!dish.hasSaleSku) {
      wx.showToast({
        title: '该菜品暂无可售规格',
        icon: 'none'
      })
      return
    }

    const sku = dish.enabledSkus[0]
    this.setData({
      showTagModal: true,
      currentDish: dish,
      modalSkus: dish.enabledSkus,
      modalTags: dish.tags || [],
      selectedSkuId: sku.id,
      selectedTags: this.buildInitialTags(dish),
      modalDishCount: 1,
      modalTotalPrice: sku.price.toFixed(2),
      currentDishImageFailed: false
    }, () => this.syncTabBarInteractionLock())
  },

  addToCart(e) {
    this.openDishModal(e.currentTarget.dataset.goods)
  },

  showDishDetail(e) {
    const goods = e.currentTarget.dataset.goods || {}
    if (!goods._id) {
      this.openDishModal(goods)
      return
    }

    const query = [`id=${encodeURIComponent(goods._id)}`]
    if (this.data.tableNumber) {
      query.push(`tableNumber=${encodeURIComponent(this.data.tableNumber)}`)
    }

    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?${query.join('&')}`,
      fail: () => {
        wx.showToast({
          title: '打开菜品详情失败',
          icon: 'none'
        })
      }
    })
  },

  previewDishImage(e) {
    const imageUrl = e.currentTarget.dataset.url

    if (!imageUrl) {
      wx.showToast({
        title: '暂无图片可预览',
        icon: 'none'
      })
      return
    }

    wx.previewImage({
      current: imageUrl,
      urls: [imageUrl],
      fail: () => {
        wx.showToast({
          title: '图片预览失败',
          icon: 'none'
        })
      }
    })
  },

  addDishToCartDirect(e) {
    const goods = this.normalizeDish(e.currentTarget.dataset.goods)

    if (goods.requiresSelection) {
      this.openDishModal(goods)
      return
    }

    const sku = goods.enabledSkus[0]
    if (!sku) {
      wx.showToast({
        title: '该菜品暂无可售规格',
        icon: 'none'
      })
      return
    }

    this.addCartItem(goods, sku, {}, [], 1)
    wx.showToast({
      title: '已添加',
      icon: 'success',
      duration: 1000
    })
  },

  confirmAddToCart() {
    const { currentDish, modalSkus, modalTags, selectedTags, selectedSkuId, modalDishCount } = this.data
    const selectedSku = modalSkus.find(sku => sku.id === selectedSkuId)

    if (!selectedSku) {
      wx.showToast({
        title: '请选择规格',
        icon: 'none'
      })
      return
    }

    if (modalTags.length > 0) {
      for (let tag of modalTags) {
        if (tag.required) {
          const selectedValue = selectedTags[tag.id]
          if (!selectedValue ||
              (Array.isArray(selectedValue) && selectedValue.length === 0)) {
            wx.showToast({
              title: `请选择${tag.name}`,
              icon: 'none'
            })
            return
          }
        }
      }
    }

    const tagLabels = this.getTagLabels(currentDish, selectedTags)
    this.addCartItem(currentDish, selectedSku, selectedTags, tagLabels, modalDishCount)
    this.closeTagModal()
  },

  addCartItem(goods, sku, tags, tagLabels, count) {
    const cart = { ...this.data.cart }
    const cartKey = this.generateCartKey(goods._id, sku.id, tags)

    if (cart[cartKey]) {
      cart[cartKey].count += count
    } else {
      cart[cartKey] = {
        info: goods,
        sku: {
          id: sku.id,
          name: sku.name,
          price: sku.price
        },
        count,
        tags: clone(tags),
        tagLabels,
        dishId: goods._id
      }
    }

    this.updateCart(cart)
  },

  getTagLabels(goods, selectedTags) {
    const tagLabels = []
    if (goods.tags && goods.tags.length > 0) {
      for (let tagId in selectedTags) {
        const tag = goods.tags.find(t => t.id === tagId)
        if (tag) {
          const value = selectedTags[tagId]
          if (Array.isArray(value)) {
            tagLabels.push(...value)
          } else if (value) {
            tagLabels.push(value)
          }
        }
      }
    }
    return tagLabels
  },

  generateCartKey(dishId, skuId, tags) {
    return createCartKey(dishId, skuId, tags)
  },

  getDishCartCount(dishId, cart) {
    const cartData = cart !== undefined ? cart : this.data.cart
    let totalCount = 0

    for (let cartKey in cartData) {
      if (cartData[cartKey] && cartData[cartKey].dishId === dishId) {
        totalCount += cartData[cartKey].count || 0
      }
    }

    return totalCount
  },

  reduceDishFromCart(e) {
    const goods = e.currentTarget.dataset.goods
    const cart = { ...this.data.cart }

    const cartKey = Object.keys(cart).reverse().find(key => (
      cart[key] && cart[key].dishId === goods._id
    ))
    if (!cartKey) return

    cart[cartKey].count--
    if (cart[cartKey].count <= 0) {
      delete cart[cartKey]
    }
    this.updateCart(cart)
  },

  reduceFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }

    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) {
        delete cart[cartKey]
      }
    }

    this.updateCart(cart)
  },

  addToCartFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }

    if (cart[cartKey]) {
      cart[cartKey].count++
    }

    this.updateCart(cart)
  },

  selectSkuOption(e) {
    const skuId = e.currentTarget.dataset.skuId
    const sku = this.data.modalSkus.find(item => item.id === skuId)
    if (!sku) return

    this.setData({
      selectedSkuId: skuId,
      modalTotalPrice: (sku.price * this.data.modalDishCount).toFixed(2)
    })
  },

  selectTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    const selectedTags = { ...this.data.selectedTags }
    selectedTags[tagId] = option

    this.setData({
      selectedTags
    })
  },

  toggleTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset

    if (!tagId || !option) {
      console.error('标签ID或选项为空', { tagId, option })
      return
    }

    const selectedTags = clone(this.data.selectedTags || {})

    if (!selectedTags[tagId]) {
      selectedTags[tagId] = []
    } else if (!Array.isArray(selectedTags[tagId])) {
      selectedTags[tagId] = [selectedTags[tagId]]
    }

    const tagArray = [...selectedTags[tagId]]
    const index = tagArray.indexOf(option)

    if (index > -1) {
      tagArray.splice(index, 1)
    } else {
      tagArray.push(option)
    }

    selectedTags[tagId] = tagArray

    this.setData({
      selectedTags
    })
  },

  closeTagModal() {
    this.setData({
      showTagModal: false,
      currentDish: null,
      modalSkus: [],
      modalTags: [],
      selectedSkuId: '',
      selectedTags: {},
      modalDishCount: 1,
      modalTotalPrice: 0,
      currentDishImageFailed: false
    }, () => this.syncTabBarInteractionLock())
  },

  onDishImageError(e) {
    const data = e.currentTarget.dataset || {}
    if (data.scope === 'menu') {
      this.setData({
        [`goodsSections[${data.sectionIndex}].goods[${data.goodsIndex}].imageLoadFailed`]: true
      })
      return
    }
    if (data.scope === 'cart') {
      this.setData({
        cartImageFailures: {
          ...this.data.cartImageFailures,
          [data.cartKey]: true
        }
      })
      return
    }
    if (data.scope === 'modal') {
      this.setData({ currentDishImageFailed: true })
    }
  },

  updateModalTotal(count) {
    const sku = this.data.modalSkus.find(item => item.id === this.data.selectedSkuId)
    const price = sku ? sku.price : 0
    this.setData({
      modalDishCount: count,
      modalTotalPrice: (price * count).toFixed(2)
    })
  },

  increaseModalCount() {
    this.updateModalTotal(this.data.modalDishCount + 1)
  },

  decreaseModalCount() {
    if (this.data.modalDishCount > 1) {
      this.updateModalTotal(this.data.modalDishCount - 1)
    }
  },

  stopPropagation() {},

  onAuthModalClosed() {
    this.setData({ showAuthModal: false }, () => this.syncTabBarInteractionLock())
  },

  async onUserInfoSaved(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail || {}

    this.setData({
      userInfo: {
        ...(this.data.userInfo || {}),
        avatarUrl,
        nickName,
        phoneNumber
      },
      showAuthModal: false
    }, () => this.syncTabBarInteractionLock())

    try {
      await this.loadUserInfo()
    } catch (err) {
      console.error('刷新用户信息失败', err)
    }

    this.goToSettle()
  },

  updateCart(cart) {
    let totalCount = 0
    let totalPrice = 0

    for (let cartKey in cart) {
      if (cart[cartKey] && cart[cartKey].count) {
        const unitPrice = cart[cartKey].sku ? cart[cartKey].sku.price : cart[cartKey].info.price
        totalCount += cart[cartKey].count
        totalPrice += unitPrice * cart[cartKey].count
      }
    }

    const goodsSections = this.syncCartCountInSections(this.data.goodsSections, cart)
    saveStoredCart(cart)

    this.setData({
      cart,
      cartCount: totalCount,
      cartTotalPrice: totalPrice,
      cartTotalPriceText: totalPrice.toFixed(2),
      goodsSections,
      showCart: totalCount > 0 ? this.data.showCart : false
    }, () => this.syncTabBarInteractionLock())
  },

  toggleCart() {
    if (this.data.cartCount === 0) return
    const showCart = !this.data.showCart
    this.setData({ showCart }, () => this.syncTabBarInteractionLock())
  },

  setTabBarInteractionLocked(locked) {
    const tabBar = this.getTabBar && this.getTabBar()
    const interactionLocked = Boolean(locked)
    if (tabBar && tabBar.data.interactionLocked !== interactionLocked) {
      tabBar.setData({ interactionLocked })
    }
  },

  syncTabBarInteractionLock() {
    this.setTabBarInteractionLocked(
      this.data.showCart || this.data.showTagModal || this.data.showAuthModal
    )
  },

  clearCart() {
    this.updateCart({})
  },

  goToSettle() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    if (!this.data.isOpen) {
      wx.showToast({ title: '店铺已打烊，暂不接单', icon: 'none' })
      return
    }
    this.navigateToSettle()
  },

  navigateToSettle() {
    try {
      wx.setStorageSync('settleCartData', {
        cart: this.data.cart,
        totalPrice: this.data.cartTotalPrice,
        tableNumber: this.data.tableNumber
      })

      wx.navigateTo({
        url: '/pages/settle/settle'
      })
    } catch (err) {
      console.error('跳转结算页面失败', err)
      wx.showToast({
        title: '跳转失败',
        icon: 'none'
      })
    }
  },

  async scanTableCode(options = {}) {
    try {
      const tableNumber = await scanTableCodeFromCamera()

      this.setData({
        tableNumber
      }, () => {
        wx.showToast({
          title: `已绑定${tableNumber}号桌`,
          icon: 'success'
        })

        if (options.settleAfterScan) {
          this.navigateToSettle()
        }
      })
    } catch (err) {
      if (isScanCancelled(err)) {
        return
      }

      console.error('扫码失败', err)
      wx.showToast({
        title: err && err.code === 'INVALID_TABLE_CODE' ? '未能识别桌码' : '扫码失败',
        icon: 'none'
      })
    }
  },

  onReachBottom() {
    this.onGoodsScrollToLower()
  },

  onShareAppMessage() {
    return {
      title: this.data.shopName,
      path: '/pages/index/index',
      imageUrl: ''
    }
  },

  onShareTimeline() {
    return {
      title: this.data.shopName,
      query: '',
      imageUrl: ''
    }
  },

  async onPullDownRefresh() {
    try {
      await Promise.all([
        this.loadMenu(false),
        this.loadUserInfo()
      ])
    } catch (err) {
      console.error('刷新失败', err)
    } finally {
      wx.stopPullDownRefresh()
    }
  }
})
