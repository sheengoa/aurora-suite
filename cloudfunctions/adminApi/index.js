const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()
const _ = db.command
const SESSION_TTL = 12 * 60 * 60 * 1000
const MAX_PAGE_SIZE = 100
const ORDER_TRANSITIONS = { 0: [1, 3], 1: [4, 3], 4: [2, 3], 2: [], 3: [] }
const FULFILLMENT_STATUS = { 0: 'pending_accept', 1: 'preparing', 2: 'completed', 3: 'cancelled', 4: 'ready' }
const ORDER_STATUS_TEXT = { 0: '待接单', 1: '制作中', 2: '已完成', 3: '已取消', 4: '待取餐' }

const READABLE_COLLECTIONS = new Set([
  'admin',
  'dish',
  'dishCategory',
  'order',
  'printer',
  'rechargeOptions',
  'tableCode'
])

const WRITABLE_FIELDS = {
  admin: ['shopName', 'welcomeText', 'isOpen', 'updateTime'],
  dish: [
    'name', 'price', 'description', 'categoryId', 'categoryName', 'image',
    'images', 'status', 'sort', 'tags', 'skus', 'createTime', 'updateTime',
    'originalPrice'
  ],
  dishCategory: ['name', 'sort', 'icon', 'createTime', 'updateTime'],
  printer: ['sn', 'name', 'density', 'printSpeed', 'volume', 'createTime', 'updateTime'],
  rechargeOptions: [
    'amount', 'giveAmount', 'isRecommend', 'status', 'description',
    'createTime', 'updateTime'
  ],
  tableCode: ['tableNumber', 'qrCodeUrl', 'posterUrl', 'createTime', 'updateTime'],
  user: ['balance']
}

const REMOVABLE_COLLECTIONS = new Set([
  'dish',
  'dishCategory',
  'order',
  'printer',
  'rechargeOptions',
  'tableCode'
])

const ADDABLE_COLLECTIONS = new Set([
  'dish',
  'dishCategory',
  'printer',
  'rechargeOptions',
  'tableCode'
])

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')
  return `pbkdf2$120000$${salt}$${hash}`
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false
  }

  const iterations = Number(parts[1])
  const expected = Buffer.from(parts[3], 'hex')
  const actual = crypto.pbkdf2Sync(password, parts[2], iterations, expected.length, 'sha256')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function validatePassword(password) {
  const value = String(password || '')
  if (value.length < 6 || value.length > 72) {
    throw new Error('管理员密码长度需为6到72位')
  }
  return value
}

async function createSession(openid) {
  const token = crypto.randomBytes(32).toString('hex')
  await db.collection('adminSession').add({
    data: {
      openid,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL),
      createTime: db.serverDate()
    }
  })
  return token
}

async function requireAdmin(openid, token) {
  if (!openid || !token) {
    throw Object.assign(new Error('管理员登录已失效'), { code: 'ADMIN_AUTH_REQUIRED' })
  }

  const res = await db.collection('adminSession').where({
    openid,
    tokenHash: hashToken(token),
    expiresAt: _.gt(new Date())
  }).limit(1).get()

  if (!res.data || res.data.length === 0) {
    throw Object.assign(new Error('管理员登录已失效'), { code: 'ADMIN_AUTH_REQUIRED' })
  }
}

function transformValue(value) {
  if (Array.isArray(value)) {
    return value.map(transformValue)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  if (value.__adminOperation === 'serverDate') {
    return db.serverDate()
  }
  if (value.__adminOperation === 'remove') {
    return _.remove()
  }

  return Object.keys(value).reduce((result, key) => {
    result[key] = transformValue(value[key])
    return result
  }, {})
}

function sanitizeWriteData(collectionName, source) {
  const allowedFields = WRITABLE_FIELDS[collectionName]
  if (!allowedFields) {
    throw new Error('该集合不允许后台写入')
  }

  const data = source && typeof source === 'object' ? source : {}
  return allowedFields.reduce((result, field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      result[field] = transformValue(data[field])
    }
    return result
  }, {})
}

function normalizeSort(orderBy) {
  if (!orderBy || !/^[A-Za-z0-9_]+$/.test(orderBy.field || '')) {
    return null
  }
  return {
    field: orderBy.field,
    direction: orderBy.direction === 'desc' ? 'desc' : 'asc'
  }
}

async function listDocuments(event) {
  const { collectionName, documentId } = event
  if (!READABLE_COLLECTIONS.has(collectionName)) {
    throw new Error('该集合不允许后台读取')
  }

  let query = documentId
    ? db.collection(collectionName).doc(documentId)
    : db.collection(collectionName)

  if (!documentId && event.where && typeof event.where === 'object') {
    query = query.where(event.where)
  }

  const sort = normalizeSort(event.orderBy)
  if (!documentId && sort) {
    query = query.orderBy(sort.field, sort.direction)
  }

  if (!documentId) {
    const skip = Math.max(0, Number(event.skip) || 0)
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(event.limit) || 20))
    query = query.skip(skip).limit(limit)
  }

  if (event.field && typeof event.field === 'object') {
    query = query.field(event.field)
  }
  if (collectionName === 'admin') {
    query = query.field({ _id: true, shopName: true, welcomeText: true })
  }

  const res = await query.get()
  return documentId ? [res.data] : (res.data || [])
}

async function listUsers(event) {
  const keyword = String(event.keyword || '').trim().slice(0, 40)
  const page = Math.max(0, Number(event.page) || 0)
  const pageSize = Math.min(100, Math.max(1, Number(event.pageSize) || 20))
  let matchCondition = {
    phoneNumber: _.exists(true).and(_.neq(''))
  }

  if (keyword) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    matchCondition = _.and([
      matchCondition,
      _.or([
        { nickName: db.RegExp({ regexp: escapedKeyword, options: 'i' }) },
        { phoneNumber: db.RegExp({ regexp: escapedKeyword, options: 'i' }) }
      ])
    ])
  }

  const res = await db.collection('user')
    .aggregate()
    .match(matchCondition)
    .sort({ createTime: -1 })
    .skip(page * pageSize)
    .limit(pageSize)
    .end()
  const list = (res.list || []).map(user => {
    const phoneNumber = String(user.phoneNumber || '')
    const maskedPhone = /^1\d{10}$/.test(phoneNumber)
      ? `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(7)}`
      : ''
    const { phoneNumber: _phoneNumber, ...safeUser } = user
    return { ...safeUser, maskedPhone }
  })
  return { list, hasMore: list.length === pageSize, page }
}

async function removeAllSessions() {
  const res = await db.collection('adminSession').limit(100).get()
  await Promise.all((res.data || []).map(item => (
    db.collection('adminSession').doc(item._id).remove()
  )))
}

function money(value) {
  const result = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(result) || result < 0 || result > 1000000) throw new Error('余额参数无效')
  return result
}

async function transitionOrder(event, operatorOpenid) {
  const orderId = String(event.orderId || '')
  const targetStatus = Number(event.targetStatus)
  const reason = String(event.reason || '').trim().slice(0, 80)
  if (!orderId || !Number.isInteger(targetStatus)) throw new Error('订单状态参数无效')

  return db.runTransaction(async transaction => {
    const res = await transaction.collection('order').doc(orderId).get()
    const order = res.data
    if (!order || order.type !== 'order' || order.pay_status !== true) throw new Error('订单不存在或尚未支付')
    const currentStatus = Number.isInteger(order.status) ? order.status : 0
    if (!(ORDER_TRANSITIONS[currentStatus] || []).includes(targetStatus)) {
      throw new Error(`订单无法从${ORDER_STATUS_TEXT[currentStatus] || '当前状态'}变为${ORDER_STATUS_TEXT[targetStatus] || '目标状态'}`)
    }
    if (targetStatus === 3 && !reason) throw new Error('取消订单必须填写原因')

    const update = {
      status: targetStatus,
      fulfillmentStatus: FULFILLMENT_STATUS[targetStatus],
      statusUpdateTime: db.serverDate(),
      statusHistory: _.push({
        from: currentStatus,
        to: targetStatus,
        reason,
        operatorOpenid,
        createTime: new Date()
      })
    }
    if (targetStatus === 3 && order.payMethod === 'balance') {
      const refundAmount = money(order.finalPrice || 0)
      const userRes = await transaction.collection('user').where({ _openid: order._openid }).limit(1).get()
      const user = userRes.data && userRes.data[0]
      if (!user) throw new Error('会员不存在，无法完成退款')
      const before = money(user.balance || 0)
      await transaction.collection('user').doc(user._id).update({ data: { balance: before + refundAmount } })
      await transaction.collection('balanceLog').add({
        data: {
          userId: user._id,
          userOpenid: user._openid || '',
          orderId,
          type: 'refund',
          amount: refundAmount,
          before,
          after: before + refundAmount,
          reason: reason || '管理员取消订单退款',
          operatorOpenid,
          createTime: db.serverDate()
        }
      })
      update.refundStatus = 'refunded'
    } else if (targetStatus === 3 && order.payMethod === 'wechat') {
      update.refundStatus = 'requested'
      update.refundRequestTime = db.serverDate()
    }
    if (targetStatus === 2) update.completeTime = db.serverDate()
    if (targetStatus === 3) update.cancelTime = db.serverDate()
    await transaction.collection('order').doc(orderId).update({ data: update })
    return { orderId, status: targetStatus, fulfillmentStatus: FULFILLMENT_STATUS[targetStatus] }
  })
}

async function adjustBalance(event, operatorOpenid) {
  const userId = String(event.userId || '')
  const targetBalance = money(event.balance)
  const reason = String(event.reason || '').trim().slice(0, 80)
  if (!userId) throw new Error('会员参数无效')
  if (!reason) throw new Error('请填写调账原因')

  return db.runTransaction(async transaction => {
    const res = await transaction.collection('user').doc(userId).get()
    const user = res.data
    if (!user) throw new Error('会员不存在')
    const before = money(user.balance || 0)
    const amount = Math.round((targetBalance - before) * 100) / 100
    await transaction.collection('user').doc(userId).update({ data: { balance: targetBalance, updateTime: db.serverDate() } })
    await transaction.collection('balanceLog').add({
      data: {
        userId,
        userOpenid: user._openid || '',
        type: 'admin_adjustment',
        amount,
        before,
        after: targetBalance,
        reason,
        operatorOpenid,
        createTime: db.serverDate()
      }
    })
    return { balance: targetBalance }
  })
}

async function listBalanceLogs(event) {
  const userId = String(event.userId || '')
  if (!userId) throw new Error('会员参数无效')
  const res = await db.collection('balanceLog').where({ userId }).orderBy('createTime', 'desc').limit(50).get()
  return res.data || []
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action

  try {
    if (action === 'status') {
      const res = await db.collection('admin').limit(1).get()
      return { success: true, configured: !!(res.data && res.data.length) }
    }

    if (action === 'setup') {
      const password = validatePassword(event.password)
      await db.runTransaction(async transaction => {
        const res = await transaction.collection('admin').limit(1).get()
        if (res.data && res.data.length > 0) {
          throw new Error('管理员已存在，请登录')
        }

        await transaction.collection('admin').add({
          data: {
            passwordHash: hashPassword(password),
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      })
      return { success: true, adminToken: await createSession(openid) }
    }

    if (action === 'login') {
      const password = validatePassword(event.password)
      const res = await db.collection('admin').limit(1).get()
      const admin = res.data && res.data[0]
      if (!admin) {
        throw new Error('管理员未设置')
      }

      const valid = admin.passwordHash
        ? verifyPassword(password, admin.passwordHash)
        : admin.password === password
      if (!valid) {
        throw new Error('密码错误')
      }

      if (!admin.passwordHash) {
        await db.collection('admin').doc(admin._id).update({
          data: {
            passwordHash: hashPassword(password),
            password: _.remove(),
            updateTime: db.serverDate()
          }
        })
      }
      return { success: true, adminToken: await createSession(openid) }
    }

    await requireAdmin(openid, event.adminToken)

    if (action === 'verify') {
      return { success: true }
    }

    if (action === 'changePassword') {
      const oldPassword = validatePassword(event.oldPassword)
      const newPassword = validatePassword(event.newPassword)
      const res = await db.collection('admin').limit(1).get()
      const admin = res.data && res.data[0]
      const valid = admin && (admin.passwordHash
        ? verifyPassword(oldPassword, admin.passwordHash)
        : admin.password === oldPassword)
      if (!valid) {
        throw new Error('原密码错误')
      }

      await db.collection('admin').doc(admin._id).update({
        data: {
          passwordHash: hashPassword(newPassword),
          password: _.remove(),
          updateTime: db.serverDate()
        }
      })
      await removeAllSessions()
      return { success: true, adminToken: await createSession(openid) }
    }

    if (action === 'list') {
      return { success: true, data: await listDocuments(event) }
    }

    if (action === 'listUsers') {
      return { success: true, data: await listUsers(event) }
    }

    if (action === 'transitionOrder') {
      return { success: true, data: await transitionOrder(event, openid) }
    }

    if (action === 'adjustBalance') {
      return { success: true, data: await adjustBalance(event, openid) }
    }

    if (action === 'listBalanceLogs') {
      return { success: true, data: await listBalanceLogs(event) }
    }

    if (action === 'add') {
      if (!ADDABLE_COLLECTIONS.has(event.collectionName)) {
        throw new Error('该集合不允许新增记录')
      }
      const data = sanitizeWriteData(event.collectionName, event.data)
      const res = await db.collection(event.collectionName).add({ data })
      return { success: true, _id: res._id }
    }

    if (action === 'update') {
      if (!event.documentId) {
        throw new Error('缺少记录ID')
      }
      const data = sanitizeWriteData(event.collectionName, event.data)
      await db.collection(event.collectionName).doc(event.documentId).update({ data })
      return { success: true }
    }

    if (action === 'remove') {
      if (!REMOVABLE_COLLECTIONS.has(event.collectionName) || !event.documentId) {
        throw new Error('该记录不允许删除')
      }
      if (event.collectionName === 'dishCategory') {
        const dishCount = await db.collection('dish').where({
          categoryId: event.documentId
        }).count()
        if (dishCount.total > 0) {
          throw Object.assign(new Error('该分类下仍有菜品，请先移动或删除菜品'), {
            code: 'CATEGORY_NOT_EMPTY'
          })
        }
      }
      await db.collection(event.collectionName).doc(event.documentId).remove()
      return { success: true }
    }

    throw new Error('未知管理员操作')
  } catch (err) {
    console.error('管理员操作失败', err)
    return {
      success: false,
      code: err.code || 'ADMIN_OPERATION_FAILED',
      error: err.message || '管理员操作失败'
    }
  }
}
