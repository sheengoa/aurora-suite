const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()
const _ = db.command
const SESSION_TTL = 12 * 60 * 60 * 1000
const MAX_PAGE_SIZE = 100

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
  admin: ['shopName', 'welcomeText', 'updateTime'],
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
  const list = res.list || []
  return { list, hasMore: list.length === pageSize, page }
}

async function removeAllSessions() {
  const res = await db.collection('adminSession').limit(100).get()
  await Promise.all((res.data || []).map(item => (
    db.collection('adminSession').doc(item._id).remove()
  )))
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
