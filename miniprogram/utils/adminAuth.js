const ADMIN_TOKEN_KEY = 'adminSessionToken'

function getAdminToken() {
  return wx.getStorageSync(ADMIN_TOKEN_KEY) || ''
}

function setAdminToken(token) {
  if (token) {
    wx.setStorageSync(ADMIN_TOKEN_KEY, token)
  } else {
    wx.removeStorageSync(ADMIN_TOKEN_KEY)
  }
}

async function callAdminApi(action, data = {}) {
  const res = await wx.cloud.callFunction({
    name: 'adminApi',
    data: {
      ...data,
      action,
      adminToken: getAdminToken()
    }
  })
  const result = res.result || {}

  if (!result.success) {
    if (result.code === 'ADMIN_AUTH_REQUIRED') {
      setAdminToken('')
    }
    const error = new Error(result.error || '管理员操作失败')
    error.code = result.code
    throw error
  }

  if (result.adminToken) {
    setAdminToken(result.adminToken)
  }

  return result
}

async function callAdminFunction(name, data = {}) {
  const res = await wx.cloud.callFunction({
    name,
    data: {
      ...data,
      adminToken: getAdminToken()
    }
  })

  if (res.result && res.result.code === 'ADMIN_AUTH_REQUIRED') {
    setAdminToken('')
  }

  return res
}

async function verifyAdminSession() {
  if (!getAdminToken()) {
    return false
  }

  try {
    await callAdminApi('verify')
    return true
  } catch (err) {
    return false
  }
}

module.exports = {
  callAdminApi,
  callAdminFunction,
  getAdminToken,
  setAdminToken,
  verifyAdminSession
}
