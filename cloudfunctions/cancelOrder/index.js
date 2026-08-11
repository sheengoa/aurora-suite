const cloud = require('wx-server-sdk')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext()
  if (!openid || !event.orderId) {
    return { success: false, error: '订单参数无效' }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      const orderRes = await transaction.collection('order').doc(event.orderId).get()
      const order = orderRes.data

      if (!order || order._openid !== openid) {
        throw new Error('订单不存在')
      }
      if (!order.pay_status) {
        if (order.paymentStatus !== 'pending') {
          throw new Error('该订单当前不可取消')
        }
        await transaction.collection('order').doc(order._id).update({
          data: {
            status: 3,
            fulfillmentStatus: 'cancelled',
            paymentStatus: 'cancelled',
            cancelTime: db.serverDate()
          }
        })
        return { refundAmount: 0, paymentCancelled: true }
      }
      if (order.type !== 'order' || order.status !== 0) {
        throw new Error('该订单当前不可取消')
      }
      if (order.payMethod !== 'balance') {
        await transaction.collection('order').doc(order._id).update({
          data: {
            status: 3,
            fulfillmentStatus: 'cancelled',
            refundStatus: 'requested',
            refundRequestTime: db.serverDate(),
            cancelTime: db.serverDate()
          }
        })
        return { refundAmount: Number(order.finalPrice || 0), refundRequested: true }
      }

      await transaction.collection('order').doc(order._id).update({
        data: {
          status: 3,
          fulfillmentStatus: 'cancelled',
          refundStatus: 'refunded',
          cancelTime: db.serverDate()
        }
      })

      const refundAmount = Number(order.finalPrice || 0)
      if (refundAmount > 0) {
        const userRes = await transaction.collection('user').where({
          _openid: openid
        }).limit(1).get()
        const user = userRes.data && userRes.data[0]
        if (!user) {
          throw new Error('用户不存在')
        }
        await transaction.collection('user').doc(user._id).update({
          data: {
            balance: db.command.inc(refundAmount)
          }
        })
        await transaction.collection('balanceLog').add({
          data: {
            userId: user._id,
            userOpenid: openid,
            orderId: order._id,
            type: 'refund',
            amount: refundAmount,
            before: Number(user.balance || 0),
            after: Number(user.balance || 0) + refundAmount,
            reason: '余额订单取消退款',
            createTime: db.serverDate()
          }
        })
      }

      return { refundAmount }
    })

    return { success: true, ...result }
  } catch (err) {
    console.error('取消订单失败', err)
    return { success: false, error: err.message || '取消订单失败' }
  }
}
