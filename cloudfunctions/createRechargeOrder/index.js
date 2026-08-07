const cloud = require('wx-server-sdk')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()

function money(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
    throw new Error('充值金额无效')
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext()
  if (!openid || !event.rechargeId) {
    return { success: false, error: '充值参数无效' }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      const optionRes = await transaction.collection('rechargeOptions').where({
        _id: event.rechargeId,
        status: 1
      }).limit(1).get()
      const option = optionRes.data && optionRes.data[0]
      if (!option) {
        throw new Error('充值套餐不存在或已下架')
      }

      const amount = money(option.amount)
      const giveAmount = money(option.giveAmount || 0)
      if (amount <= 0) {
        throw new Error('充值套餐金额无效')
      }

      const userRes = await transaction.collection('user').where({
        _openid: openid
      }).limit(1).get()
      const user = userRes.data && userRes.data[0]
      if (!user) {
        throw new Error('用户不存在')
      }

      const orderRes = await transaction.collection('order').add({
        data: {
          type: 'recharge',
          rechargeId: option._id,
          amount,
          giveAmount,
          totalGet: amount + giveAmount,
          pay_status: false,
          status: 0,
          _openid: openid,
          createTime: db.serverDate(),
          userNickName: user.nickName || '',
          userAvatar: user.avatarUrl || '',
          userPhone: user.phoneNumber || ''
        }
      })

      return {
        orderId: orderRes._id,
        amount,
        totalGet: amount + giveAmount
      }
    })

    return { success: true, ...result }
  } catch (err) {
    console.error('创建充值订单失败', err)
    return { success: false, error: err.message || '创建充值订单失败' }
  }
}
