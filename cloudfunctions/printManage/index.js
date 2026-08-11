// 云函数入口文件
const cloud = require('wx-server-sdk')
const TcbRouter = require('tcb-router')
const axios = require('axios')
const crypto = require('crypto')

cloud.init({
  env: '填写你的环境ID'
})

const baseUrl = 'https://iot-device.trenditiot.com'
const appid = '填写你的打印平台AppID'
const appsecret = '填写你的打印平台AppSecret'
const db = cloud.database()
const PRINT_CONFIGURED = ![appid, appsecret].some(value => String(value).includes('填写'))

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

async function isAdmin(openid, token) {
  if (!openid || !token) return false
  const res = await db.collection('adminSession').where({
    openid,
    tokenHash: hashToken(token),
    expiresAt: db.command.gt(new Date())
  }).limit(1).get()
  return !!(res.data && res.data.length)
}

async function isPaidOrder(orderId) {
  if (!orderId || String(orderId).startsWith('TEST_')) return false
  const res = await db.collection('order').where({
    _id: orderId,
    type: 'order',
    pay_status: true
  }).limit(1).get()
  return !!(res.data && res.data.length)
}

async function recordPrintState(orderId, data) {
  if (!orderId || String(orderId).startsWith('TEST_')) return
  try {
    await db.collection('order').doc(orderId).update({ data })
  } catch (err) {
    console.error('记录打印状态失败', err)
  }
}

function generateReprintContent(order = {}) {
  const goods = Array.isArray(order.goods) ? order.goods : []
  const lines = [
    'Aurora 小餐馆',
    order.orderType === 'takeOut' ? '打包订单' : '堂食订单',
    `订单号：${order.orderNo || order._id || ''}`,
    order.tableNumber ? `桌码：${order.tableNumber}` : '',
    '------------------------------'
  ]
  goods.forEach(item => {
    lines.push(`${item.dishName || '未知菜品'} ×${Number(item.count || 0)}`)
    if (item.skuName && item.skuName !== '默认规格') lines.push(`  ${item.skuName}`)
  })
  lines.push('------------------------------', `实付：¥${Number(order.finalPrice || 0).toFixed(2)}`)
  if (order.remark) lines.push(`备注：${String(order.remark).slice(0, 120)}`)
  return lines.filter(Boolean).join('\n')
}

// 生成随机字符串
function getNonceStr() {
  return Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
}

// 生成签名
function getSign(uid, stime, appid, body) {
  const requestBody = JSON.stringify(body)
  const strToSign = `${uid}${appid}${stime}${appsecret}${requestBody}`
  const md5sum = crypto.createHash('md5')
  md5sum.update(strToSign)
  const signature = md5sum.digest('hex')
  return signature
}

// HTTP请求封装
async function request(options) {
  try {
    const response = await axios({
      url: options.url,
      method: options.method || 'GET',
      data: options.data,
      params: options.params,
      headers: options.headers || {},
      timeout: options.timeout || 30000
    })
    return response.data
  } catch (error) {
    if (error.response) {
      // 服务器返回了错误状态码
      throw {
        code: error.response.status,
        message: error.response.data?.message || error.message,
        data: error.response.data
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      throw {
        code: -1,
        message: '网络请求失败，请检查网络连接'
      }
    } else {
      // 请求配置出错
      throw {
        code: -1,
        message: error.message || '请求失败'
      }
    }
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const app = new TcbRouter({ event })

  // 所有打印机管理操作必须由管理员会话发起；正式订单打印只允许已支付订单。
  app.use(async (ctx, next) => {
    ctx.event = event
    const wxContext = cloud.getWXContext()
    const route = event.$url
    const authorized = route === 'printNote'
      ? (String(event.outTradeNo || '').startsWith('TEST_')
        ? await isAdmin(wxContext.OPENID, event.adminToken)
        : await isPaidOrder(event.outTradeNo))
      : await isAdmin(wxContext.OPENID, event.adminToken)

    if (!authorized) {
      ctx.body = {
        success: false,
        code: 'ADMIN_AUTH_REQUIRED',
        error: '管理员登录已失效'
      }
      return
    }

    if (!PRINT_CONFIGURED) {
      ctx.body = {
        success: false,
        code: 'PRINT_NOT_CONFIGURED',
        error: '打印服务未配置，请先填写打印平台凭证'
      }
      return
    }

    await next()
  })

  // 绑定打印机
  app.router('addPrinter', async (ctx, next) => {
    const { sn, key, name } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = [{
      sn: sn,
      key: key,
      name: name || `打印机${sn}`
    }]

    try {
      const result = await request({
        url: baseUrl + '/openapi/addPrinter',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('绑定打印机失败', error)
      ctx.body = {
        success: false,
        error: error.message || '绑定失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 解绑打印机
  app.router('delPrinter', async (ctx, next) => {
    const { sn } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = Array.isArray(sn) ? sn : [sn]

    try {
      const result = await request({
        url: baseUrl + '/openapi/delPrinter',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('解绑打印机失败', error)
      ctx.body = {
        success: false,
        error: error.message || '解绑失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 设置打印浓度
  app.router('setDensity', async (ctx, next) => {
    const { sn, density } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn, density }

    try {
      const result = await request({
        url: baseUrl + '/openapi/setDensity',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('设置打印浓度失败', error)
      ctx.body = {
        success: false,
        error: error.message || '设置失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 设置打印速度
  app.router('setPrintSpeed', async (ctx, next) => {
    const { sn, printSpeed } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn, printSpeed }

    try {
      const result = await request({
        url: baseUrl + '/openapi/setPrintSpeed',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('设置打印速度失败', error)
      ctx.body = {
        success: false,
        error: error.message || '设置失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 设置音量
  app.router('setVolume', async (ctx, next) => {
    const { sn, volume } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn, volume }

    try {
      const result = await request({
        url: baseUrl + '/openapi/setVolume',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('设置音量失败', error)
      ctx.body = {
        success: false,
        error: error.message || '设置失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 查询打印机状态
  app.router('getDeviceStatus', async (ctx, next) => {
    const { sn } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn }

    try {
      const result = await request({
        url: baseUrl + '/openapi/getDeviceStatus',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('查询打印机状态失败', error)
      ctx.body = {
        success: false,
        error: error.message || '查询失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 打印小票
  app.router('printNote', async (ctx, next) => {
    const { $url, ...printData } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()

    try {
      const result = await request({
        url: baseUrl + '/openapi/print',
        method: 'POST',
        data: printData,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, printData)
        }
      })
      await recordPrintState(printData.outTradeNo, {
        printStatus: 1,
        printError: '',
        printSubmitTime: db.serverDate(),
        printRetryCount: db.command.inc(1)
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('打印小票失败', error)
      await recordPrintState(printData.outTradeNo, {
        printStatus: 3,
        printError: String(error.message || '打印失败').slice(0, 160),
        printFailTime: db.serverDate()
      })
      ctx.body = {
        success: false,
        error: error.message || '打印失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 管理员重打已支付订单。凭证未配置时由上面的统一降级返回，不会误报成功。
  app.router('reprintOrder', async (ctx, next) => {
    const orderId = String(ctx.event.orderId || '')
    if (!orderId) {
      ctx.body = { success: false, error: '订单参数无效' }
      return
    }
    const orderRes = await db.collection('order').where({
      _id: orderId,
      type: 'order',
      pay_status: true
    }).limit(1).get()
    const order = orderRes.data && orderRes.data[0]
    if (!order) {
      ctx.body = { success: false, error: '订单不存在或尚未支付' }
      return
    }
    const printerRes = await db.collection('printer').limit(1).get()
    const printer = printerRes.data && printerRes.data[0]
    if (!printer) {
      ctx.body = { success: false, code: 'PRINTER_NOT_BOUND', error: '尚未绑定打印机' }
      return
    }
    const uid = getNonceStr()
    const time = Date.now()
    const printData = {
      sn: printer.sn,
      voice: order.orderType === 'dineIn' ? '16' : '19',
      voicePlayTimes: 1,
      voicePlayInterval: 3,
      content: generateReprintContent(order),
      copies: 1,
      expiresInSeconds: 7200,
      outTradeNo: orderId
    }
    try {
      const result = await request({
        url: baseUrl + '/openapi/print',
        method: 'POST',
        data: printData,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          appid,
          uid,
          stime: time,
          sign: getSign(uid, time, appid, printData)
        }
      })
      await recordPrintState(orderId, {
        printStatus: 1,
        printError: '',
        printSubmitTime: db.serverDate(),
        printRetryCount: db.command.inc(1)
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      await recordPrintState(orderId, {
        printStatus: 3,
        printError: String(error.message || '打印失败').slice(0, 160),
        printFailTime: db.serverDate()
      })
      ctx.body = { success: false, code: error.code, error: error.message || '重打失败' }
    }
  })

  // 清空打印队列
  app.router('cleanWaitingQueue', async (ctx, next) => {
    const { sn } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn }

    try {
      const result = await request({
        url: baseUrl + '/openapi/cleanWaitingQueue',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('清空打印队列失败', error)
      ctx.body = {
        success: false,
        error: error.message || '清空失败',
        code: error.code,
        data: error.data
      }
    }
  })

  return app.serve()
}
