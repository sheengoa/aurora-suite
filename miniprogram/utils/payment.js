function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isPaymentCancelled(err) {
  return String(err && (err.errMsg || err.message) || '').toLowerCase().includes('cancel')
}

async function getOrder(db, orderId) {
  const res = await db.collection('order').doc(orderId).get()
  return res && res.data ? res.data : null
}

async function waitForPaymentConfirmation(db, orderId, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 12)
  const interval = Math.max(200, Number(options.interval) || 800)

  for (let index = 0; index < attempts; index += 1) {
    const order = await getOrder(db, orderId)
    if (order && (order.pay_status === true || order.paymentStatus === 'paid')) {
      return order
    }
    if (order && ['cancelled', 'closed', 'expired'].includes(order.paymentStatus)) {
      throw new Error('订单已关闭，无法继续支付')
    }
    if (index < attempts - 1) await wait(interval)
  }

  return null
}

async function requestOrderPayment({ db, orderId, mockMode }) {
  const nonceStr = `${Math.random().toString(36).slice(2, 17)}${Date.now().toString(36)}`
  const payRes = await wx.cloud.callFunction({
    name: 'pay',
    data: { outTradeNo: orderId, nonceStr }
  })
  const result = payRes.result || {}
  if (result.success === false) {
    throw new Error(result.error || '无法发起支付')
  }

  if (!mockMode) {
    const payment = result.payment || result
    await wx.requestPayment(payment)
  }

  const order = await waitForPaymentConfirmation(db, orderId, {
    attempts: mockMode ? 1 : 12,
    interval: 800
  })
  return { confirmed: Boolean(order), order }
}

module.exports = {
  getOrder,
  isPaymentCancelled,
  requestOrderPayment,
  waitForPaymentConfirmation
}
