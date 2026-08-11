/* 仅在占位云环境下使用的本地数据适配层。生产环境仍由微信云开发数据库接管。 */
const imageRoot = '/images/mock-beef-noodles.jpg'

const seed = {
  dishCategory: [
    { _id: 'cat-noodle', name: '招牌面食', sort: 0, icon: '🍜' },
    { _id: 'cat-set', name: '特惠套餐', sort: 1, icon: '🥢' },
    { _id: 'cat-hot', name: '热炒小菜', sort: 2, icon: '🍳' },
    { _id: 'cat-drink', name: '饮品甜点', sort: 3, icon: '🍵' }
  ],
  dish: [
    { _id: 'dish-beef', categoryId: 'cat-noodle', categoryName: '招牌面食', name: '招牌红烧牛肉面', description: '精选牛腩慢火熬制，汤头浓郁，面条筋道。', price: 28, image: imageRoot, status: 1, sort: 0 },
    { _id: 'dish-mixed', categoryId: 'cat-noodle', categoryName: '招牌面食', name: '鲜香拌面', description: '秘制酱料搭配爽滑手擀面，香气扑鼻。', price: 18, image: imageRoot, status: 1, sort: 1 },
    { _id: 'dish-fried', categoryId: 'cat-noodle', categoryName: '招牌面食', name: '老北京炸酱面', description: '地道干黄酱，配以丰富菜码。', price: 22, image: imageRoot, status: 1, sort: 2 },
    { _id: 'dish-rib', categoryId: 'cat-noodle', categoryName: '招牌面食', name: '清汤排骨面', description: '清爽骨汤，排骨酥烂脱骨。', price: 26, image: imageRoot, status: 1, sort: 3 },
    { _id: 'dish-duo', categoryId: 'cat-set', categoryName: '特惠套餐', name: '双人分享套餐', description: '两碗招牌面，搭配小菜和饮品。', price: 58, image: imageRoot, status: 1, sort: 0 },
    { _id: 'dish-chicken', categoryId: 'cat-hot', categoryName: '热炒小菜', name: '香煎鸡腿排', description: '外焦里嫩，搭配时蔬。', price: 32, image: imageRoot, status: 1, sort: 0 },
    { _id: 'dish-greens', categoryId: 'cat-hot', categoryName: '热炒小菜', name: '蒜蓉时蔬', description: '当季时蔬，清爽少油。', price: 16, image: imageRoot, status: 1, sort: 1 },
    { _id: 'dish-tea', categoryId: 'cat-drink', categoryName: '饮品甜点', name: '桂花乌龙茶', description: '清香回甘，适合搭配面食。', price: 12, image: imageRoot, status: 1, sort: 0 }
  ],
  user: [{ _id: 'user-demo', _openid: 'demo-openid', balance: 88, updateTime: new Date() }],
  rechargeOptions: [
    { _id: 'recharge-30', amount: 30, giveAmount: 0, isRecommend: false, status: 1, description: '随充随用' },
    { _id: 'recharge-100', amount: 100, giveAmount: 8, isRecommend: true, status: 1, description: '会员专享赠送' },
    { _id: 'recharge-300', amount: 300, giveAmount: 30, isRecommend: false, status: 1, description: '适合多人用餐' }
  ],
  order: [
    { _id: 'order-demo-1', orderNo: 'D2026080812200001', _openid: 'demo-openid', type: 'order', orderType: 'dineIn', status: 0, pay_status: true, payMethod: 'balance', totalPrice: 44, finalPrice: 44, tableNumber: '3', createTime: new Date('2026-08-08T12:20:00'), printStatus: 2, goods: [{ dishName: '招牌红烧牛肉面', dishImage: imageRoot, price: 28, count: 1, tags: ['微辣'] }, { dishName: '蒜蓉时蔬', dishImage: imageRoot, price: 16, count: 1, tags: [] }] },
    { _id: 'order-demo-2', orderNo: 'R2026080718400002', _openid: 'demo-openid', type: 'recharge', pay_status: true, amount: 100, giveAmount: 8, totalGet: 108, createTime: new Date('2026-08-07T18:40:00'), printStatus: 2 }
  ],
  tableCode: [
    { _id: 'table-3', tableNumber: '3', qrCodeUrl: '/images/mock-table-code.png', posterUrl: '/images/mock-table-code.png', status: 1, createTime: new Date('2026-08-01T10:00:00') },
    { _id: 'table-5', tableNumber: '5', qrCodeUrl: '/images/mock-table-code.png', posterUrl: '/images/mock-table-code.png', status: 1, createTime: new Date('2026-08-01T10:02:00') }
  ],
  printer: [{ _id: 'printer-demo', sn: 'AURORA-TEST-01', key: 'DEMO-KEY', name: '后厨打印机', density: 6, printSpeed: 2, volume: 3 }],
  admin: [{ _id: 'admin-demo', shopName: 'Aurora 小餐馆', welcomeText: '很高兴为您现点现做', isOpen: true, password: 'aurora-demo' }]
}

const STORAGE_KEY = 'aurora-suite-mock-db'
const STATE_VERSION = 3

function getStorage() {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') return wx
  } catch (err) {
    // 允许在 Node 测试环境中使用内存状态。
  }
  return null
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createSeedState() {
  return Object.keys(seed).reduce((result, key) => {
    result[key] = seed[key].map(item => ({ ...item }))
    return result
  }, {})
}

function migrateState(raw) {
  const stored = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw
  const next = stored && typeof stored === 'object' ? clone(stored) : {}
  const defaults = createSeedState()

  Object.keys(defaults).forEach(key => {
    if (!Array.isArray(next[key])) next[key] = defaults[key]
  })
  if (!next.balanceLog) next.balanceLog = []
  next.admin = next.admin.map(admin => ({ isOpen: true, ...admin }))
  next.user = next.user.map(user => ({ balance: 0, ...user }))
  next.order = next.order.map(order => ({
    pay_status: false,
    paymentStatus: order.pay_status ? 'paid' : 'pending',
    fulfillmentStatus: order.type === 'order'
      ? ({ 0: 'pending_accept', 1: 'preparing', 2: 'completed', 3: 'cancelled', 4: 'ready' }[order.status] || 'pending_accept')
      : '',
    ...order
  }))
  return next
}

function loadState() {
  const storage = getStorage()
  if (!storage) return migrateState(createSeedState())
  try {
    const raw = storage.getStorageSync(STORAGE_KEY)
    const next = migrateState(raw)
    storage.setStorageSync(STORAGE_KEY, { version: STATE_VERSION, state: next })
    return next
  } catch (err) {
    return migrateState(createSeedState())
  }
}

let state = loadState()

function persist() {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setStorageSync(STORAGE_KEY, { version: STATE_VERSION, state: clone(state) })
  } catch (err) {
    console.warn('本地 mock 数据持久化失败', err)
  }
}

function reset() {
  state = migrateState(createSeedState())
  persist()
  return clone(state)
}

function now() {
  return new Date()
}

let idSequence = 0
function createId(prefix) {
  idSequence = (idSequence + 1) % 1000
  return `${prefix}-${Date.now()}-${String(idSequence).padStart(3, '0')}`
}

function matches(item, where) {
  if (!where) return true
  if (where.__mockLogic === 'and') return where.values.every(value => matches(item, value))
  if (where.__mockLogic === 'or') return where.values.some(value => matches(item, value))
  return Object.keys(where).every(key => {
    const expected = where[key]
    const actual = item[key]
    if (expected && expected.__mockOperator === 'in') {
      return expected.values.includes(actual)
    }
    if (expected && expected.__mockOperator === 'nin') {
      return !expected.values.includes(actual)
    }
    if (expected && expected.__mockOperator === 'neq') return actual !== expected.value
    if (expected && expected.__mockOperator === 'exists') return expected.value ? actual !== undefined : actual === undefined
    return actual === expected
  })
}

function applyData(item, data) {
  Object.keys(data || {}).forEach(key => {
    if (data[key] && data[key].__mockRemove) {
      delete item[key]
    } else if (data[key] && data[key].__adminOperation === 'serverDate') {
      item[key] = new Date()
    } else if (data[key] && data[key].__mockOperator === 'inc') {
      item[key] = Number(item[key] || 0) + Number(data[key].value || 0)
    } else {
      item[key] = data[key]
    }
  })
}

class MockQuery {
  constructor(collectionName) {
    this.collectionName = collectionName
    this.filters = null
    this.sort = null
    this.offset = 0
    this.count = 100
    this.documentId = ''
  }

  where(value) { this.filters = value; return this }
  orderBy(field, direction) { this.sort = { field, direction }; return this }
  skip(value) { this.offset = Number(value) || 0; return this }
  limit(value) { this.count = Number(value) || 100; return this }
  field() { return this }
  doc(id) { this.documentId = id; return this }

  async get() {
    let items = (state[this.collectionName] || []).filter(item => matches(item, this.filters))
    if (this.documentId) items = items.filter(item => item._id === this.documentId)
    if (this.sort) {
      const { field, direction } = this.sort
      items.sort((a, b) => {
        const left = a[field] instanceof Date ? a[field].getTime() : a[field]
        const right = b[field] instanceof Date ? b[field].getTime() : b[field]
        return (left > right ? 1 : left < right ? -1 : 0) * (direction === 'desc' ? -1 : 1)
      })
    }
    if (this.documentId) return { data: clone(items[0] || {}) }
    return { data: clone(items.slice(this.offset, this.offset + this.count)) }
  }

  async add({ data }) {
    const record = { _id: (data && data._id) || createId(this.collectionName) }
    applyData(record, data || {})
    state[this.collectionName] = state[this.collectionName] || []
    state[this.collectionName].push(record)
    persist()
    return { _id: record._id }
  }

  async update({ data }) {
    const item = (state[this.collectionName] || []).find(record => record._id === this.documentId)
    if (!item) return { updated: 0 }
    applyData(item, data)
    persist()
    return { updated: 1 }
  }

  async remove() {
    state[this.collectionName] = (state[this.collectionName] || []).filter(record => record._id !== this.documentId)
    persist()
    return { deleted: 1 }
  }
}

function query(options = {}) {
  const queryObject = new MockQuery(options.collectionName)
  if (options.where) queryObject.where(options.where)
  if (options.orderBy) queryObject.orderBy(options.orderBy.field, options.orderBy.direction)
  if (options.skip !== undefined) queryObject.skip(options.skip)
  if (options.limit !== undefined) queryObject.limit(options.limit)
  if (options.documentId) queryObject.doc(options.documentId)
  return queryObject.get()
}

module.exports = {
  collection(collectionName) { return new MockQuery(collectionName) },
  serverDate() { return { __adminOperation: 'serverDate' } },
  command: {
    remove() { return { __mockRemove: true } },
    and(values) { return { __mockLogic: 'and', values: values || [] } },
    or(values) { return { __mockLogic: 'or', values: values || [] } },
    in(values) { return { __mockOperator: 'in', values: values || [] } },
    nin(values) { return { __mockOperator: 'nin', values: values || [] } },
    inc(value) { return { __mockOperator: 'inc', value: Number(value || 0) } },
    neq(value) { return { __mockOperator: 'neq', value } },
    exists(value) { return { __mockOperator: 'exists', value: Boolean(value) } }
  },
  _query: query,
  _state: state,
  _clone: clone,
  _persist: persist,
  _reset: reset,
  _now: now,
  _createId: createId,
  _storageKey: STORAGE_KEY,
  _stateVersion: STATE_VERSION,
  get _state() { return state }
}
