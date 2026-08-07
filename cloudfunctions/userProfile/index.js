const cloud = require('wx-server-sdk')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()
const PROFILE_FIELDS = ['avatarUrl', 'nickName', 'phoneNumber']

function sanitizeProfile(data = {}) {
  return PROFILE_FIELDS.reduce((result, field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      result[field] = String(data[field] || '').trim().slice(0, field === 'phoneNumber' ? 32 : 256)
    }
    return result
  }, {})
}

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext()
  if (!openid) {
    return { success: false, error: '用户身份获取失败' }
  }

  try {
    const updateData = sanitizeProfile(event.updateData)
    const result = await db.runTransaction(async transaction => {
      const userRes = await transaction.collection('user').where({
        _openid: openid
      }).limit(1).get()
      const user = userRes.data && userRes.data[0]

      if (user) {
        const normalizedUpdate = typeof user.balance === 'undefined'
          ? { balance: 0, ...updateData }
          : updateData
        if (Object.keys(normalizedUpdate).length > 0) {
          await transaction.collection('user').doc(user._id).update({
            data: normalizedUpdate
          })
        }
        return transaction.collection('user').doc(user._id).get()
      }

      const addRes = await transaction.collection('user').add({
        data: {
          ...updateData,
          balance: 0,
          createTime: db.serverDate()
        }
      })
      return transaction.collection('user').doc(addRes._id).get()
    })

    return { success: true, data: result.data }
  } catch (err) {
    console.error('同步用户资料失败', err)
    return { success: false, error: err.message || '同步用户资料失败' }
  }
}
