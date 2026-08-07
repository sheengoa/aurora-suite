const cloud = require('wx-server-sdk')
cloud.init({
  env: '填写你的环境ID'
})

const db = cloud.database()
const SUB_MCH_ID = '填写你的微信支付商户号'
const ENV_ID = '填写你的环境ID'

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext()
  const orderId = String(event.outTradeNo || '')

  if (!openid || !orderId || !event.nonceStr) {
    throw new Error('支付参数无效')
  }

  const orderRes = await db.collection('order').where({
    _id: orderId,
    _openid: openid,
    pay_status: false
  }).limit(1).get()
  const order = orderRes.data && orderRes.data[0]
  if (!order) {
    throw new Error('订单不存在、已支付或不属于当前用户')
  }

  const expectedAmount = order.type === 'recharge'
    ? roundMoney(order.amount)
    : roundMoney(order.finalPrice)
  if (expectedAmount <= 0) {
    throw new Error('订单金额无效')
  }

  return cloud.cloudPay.unifiedOrder({
    body: order.type === 'recharge'
      ? `账户充值¥${expectedAmount.toFixed(2)}`
      : `点餐订单支付¥${expectedAmount.toFixed(2)}`,
    outTradeNo: orderId,
    spbillCreateIp: '127.0.0.1',
    subMchId: SUB_MCH_ID,
    totalFee: Math.round(expectedAmount * 100),
    envId: ENV_ID,
    functionName: 'pay_success',
    nonceStr: String(event.nonceStr).slice(0, 32),
    tradeType: 'JSAPI',
    openid
  })
}
