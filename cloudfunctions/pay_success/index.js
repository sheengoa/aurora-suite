
const cloud = require('wx-server-sdk')

cloud.init({
  env: '填写你的环境ID'
})

const db = cloud.database({
  throwOnNotFound: false
})
const DEFAULT_SHOP_NAME = '餐饮店'
const SUB_MCH_ID = '填写你的微信支付商户号'

// 生成打印内容
function generatePrintContent(order) {
  const orderTypeText = order.orderType === 'dineIn' ? '堂食' : '打包'
  
  // 处理时间：如果 createTime 是服务器时间对象，需要特殊处理
  let date = new Date()
  if (order.createTime) {
    if (order.createTime instanceof Date) {
      date = order.createTime
    } else if (typeof order.createTime === 'object' && order.createTime.getTime) {
      date = new Date(order.createTime.getTime())
    } else {
      date = new Date(order.createTime)
    }
  }
  
  const formatDate = (d) => {
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000)
    const pad = (n) => (n < 10 ? '0' + n : n)
    // 使用UTC方法获取转换后的时间
    return `${beijingTime.getUTCFullYear()}-${pad(beijingTime.getUTCMonth() + 1)}-${pad(beijingTime.getUTCDate())} ${pad(beijingTime.getUTCHours())}:${pad(beijingTime.getUTCMinutes())}`
  }
  
  // 计算字符串的显示宽度（中文字符占2个宽度，英文数字占1个宽度）
  const getStringWidth = (str) => {
    if (!str) return 0
    let width = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i)
      // 判断是否为中文字符（包括中文标点）
      if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) {
        width += 2
      } else {
        width += 1
      }
    }
    return width
  }
  
  // 生成指定宽度的空格字符串
  const generateSpaces = (count) => {
    return ' '.repeat(count)
  }
  
  // 转义HTML特殊字符
  const escapeHtml = (str) => {
    if (!str) return ''
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  
  // 隐藏电话号码中间4位
  const hidePhoneNumber = (phone) => {
    if (!phone) return ''
    const phoneStr = String(phone)
    // 如果是11位手机号，隐藏中间4位（第4-7位）
    if (phoneStr.length === 11) {
      return phoneStr.substring(0, 3) + '****' + phoneStr.substring(7)
    }
    // 如果不是11位，返回原值
    return phoneStr
  }
  let content = `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C><font# bolder=1 height=2 width=2>${orderTypeText}订单</font#></C><BR>`
  content += `<C><font# bolder=1 height=2 width=2>${escapeHtml(DEFAULT_SHOP_NAME)}</font#></C><BR>`
  content += `<BR>`
  
  // 订单编号和时间
  content += `<C>********************************</C><BR>`
  content += `<LEFT>订单编号: ${escapeHtml(order._id)}</LEFT><BR>`
  content += `<LEFT>下单时间: ${formatDate(date)}</LEFT><BR>`
  
  // 桌码号（如果有）
  if (order.tableNumber) {
    content += `<C><font# bolder=1 height=2 width=2>桌码: ${escapeHtml(order.tableNumber)}</font#></C><BR>`
  }
  
  content += `<C>--------------商品--------------</C><BR>`
  
  // 商品列表
  if (order.goods && order.goods.length > 0) {
    order.goods.forEach(item => {
      const skuName = item.skuName && item.skuName !== '默认规格' ? ` (${item.skuName})` : ''
      const dishName = escapeHtml(`${item.dishName || item.goodsName || '未知菜品'}${skuName}`)
      const count = item.count || 1
      // 确保价格格式正确，避免小数点0换行
      const price = parseFloat(item.price || 0).toFixed(2)
      // 格式化商品行：商品名称 + 空格填充 + 数量 × 价格
      // 总宽度32个字符，自动计算空格数（减少1个空格避免价格最后一个0换行）
      const rightPart = `×${count}  ￥${price}`
      const dishNameWidth = getStringWidth(dishName)
      const rightPartWidth = getStringWidth(rightPart)
      const totalWidth = 31 // 总宽度31个字符（减少1个避免换行）
      const spacesNeeded = totalWidth - dishNameWidth - rightPartWidth
      const spaces = spacesNeeded > 0 ? generateSpaces(spacesNeeded) : ' '
      content += `<LEFT><font# bolder=0 height=2 width=1>${dishName}${spaces}${rightPart}</font#></LEFT><BR>`
      
      // 打印标签（如果有）
      if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        const tagsText = item.tags.map(tag => escapeHtml(tag)).join(' ')
        content += `<LEFT><font# bolder=0 height=2 width=1>  ${tagsText}</font#></LEFT><BR>`
      }
    })
  }
  
  // 价格信息
  const finalPrice = (order.finalPrice || 0).toFixed(2)
  
  // 添加分隔线隔开菜品
  content += `<C>--------------------------------</C><BR>`
  
  // 实付价格，居右显示
  content += `<RIGHT><font# bolder=0 height=2 width=1>实付  ￥${finalPrice}</font#></RIGHT><BR>`
  
  // 显示支付方式
  content += `<LEFT>支付方式: 微信支付</LEFT><BR>`
  
  content += `<C>--------------------------------</C><BR>`
  if (order.userPhone) {
    const hiddenPhone = hidePhoneNumber(order.userPhone)
    content += `<LEFT><font# bolder=1 height=1 width=1>客户电话: ${escapeHtml(hiddenPhone)}</font#></LEFT><BR>`
  }
  if (order.remark) {
    content += `<LEFT><font# bolder=1 height=1 width=1>备注: ${escapeHtml(order.remark)}</font#></LEFT><BR>`
  }
  
  content += `<C>**************<font# bolder=1 height=2 width=1>完</font#><font# bolder=0 height=1 width=1>**************</font#></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  return content
}

async function recordPrintState(orderId, data) {
  if (!orderId || String(orderId).startsWith('TEST_')) return
  try {
    await db.collection('order').doc(orderId).update({ data })
  } catch (err) {
    console.error('记录打印状态失败', err)
  }
}

// 异步打印订单（不阻塞主流程）
async function printOrderAsync(orderId, orderData) {
  try {
    // 1. 查询打印机信息
    const printerRes = await db.collection('printer').limit(1).get()
    if (!printerRes.data || printerRes.data.length === 0) {
      await recordPrintState(orderId, { printStatus: 0, printError: '尚未绑定打印机' })
      console.log('未绑定打印机，跳过打印')
      return
    }
    
    const printer = printerRes.data[0]
    
    // 2. 生成打印内容
    const printContent = generatePrintContent(orderData)
    
    // 3. 调用打印接口
    // 根据订单类型设置播报音源：16-堂食订单，19-打包订单
    const voice = orderData.orderType === 'dineIn' ? '16' : '19'
    
    const printRes = await cloud.callFunction({
      name: 'printManage',
      data: {
        $url: 'printNote',
        sn: printer.sn,
        voice: voice,
        voicePlayTimes: 1,
        voicePlayInterval: 3,
        content: printContent,
        copies: 1,
        expiresInSeconds: 7200, // 2小时
        outTradeNo: orderId
      }
    })
    
    if (printRes.result && printRes.result.success) {
      console.log('打印订单成功', printRes.result)
    } else {
      await recordPrintState(orderId, {
        printStatus: 3,
        printError: String(printRes.result && (printRes.result.error || printRes.result.errmsg) || '打印失败').slice(0, 160),
        printFailTime: db.serverDate()
      })
      console.error('打印订单失败', printRes.result)
    }
  } catch (err) {
    await recordPrintState(orderId, {
      printStatus: 3,
      printError: String(err.message || '打印失败').slice(0, 160),
      printFailTime: db.serverDate()
    })
    console.error('打印订单异常', err)
    // 不抛出异常，避免影响支付回调
  }
}



// 云函数入口函数
exports.main = async (event, context) => {
  const orderId = event.outTradeNo
  const returnCode = event.returnCode

  if (returnCode !== 'SUCCESS') {
    return { errcode: 1, errmsg: '支付未成功' }
  }

  try {
    if (!orderId) {
      return { errcode: 1, errmsg: '订单号缺失' }
    }

    // 回调参数来自外部，必须主动向微信查询订单，不能只相信 returnCode。
    const paymentRes = await cloud.cloudPay.queryOrder({
      subMchId: SUB_MCH_ID,
      outTradeNo: orderId,
      nonceStr: `${Date.now()}${Math.random().toString(36).slice(2, 10)}`
    })
    const tradeState = paymentRes.tradeState || paymentRes.trade_state
    const paymentReturnCode = paymentRes.returnCode || paymentRes.return_code
    const paymentResultCode = paymentRes.resultCode || paymentRes.result_code
    if (
      paymentReturnCode !== 'SUCCESS' ||
      paymentResultCode === 'FAIL' ||
      tradeState !== 'SUCCESS'
    ) {
      return { errcode: 1, errmsg: '支付状态未确认' }
    }

    const paidFee = Number(paymentRes.totalFee || paymentRes.total_fee || 0)
    const result = await db.runTransaction(async transaction => {
      // 1. 查询订单
      const orderRes = await transaction.collection('order').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        throw new Error('订单不存在')
      }

      const expectedFee = Math.round(Number(
        order.type === 'recharge' ? order.amount : order.finalPrice
      ) * 100)
      if (!expectedFee || paidFee !== expectedFee) {
        throw new Error('支付金额与订单金额不一致')
      }

      // 微信可能重复通知；已处理的订单直接返回成功，不重复入账。
      if (order.pay_status === true) {
        return {
          success: true,
          alreadyProcessed: true,
          orderType: order.type,
          order
        }
      }

      // 2. 更新订单支付状态
      await transaction.collection('order').doc(orderId).update({
        data: {
          pay_status: true,
          paymentStatus: 'paid',
          payTime: db.serverDate()
        }
      })

      // 3. 如果是充值订单，处理余额
      if (order.type === 'recharge') {
        const openid = order._openid
        const totalGet = order.totalGet || (order.amount + order.giveAmount)

        // 3.1 增加用户余额
        const userRes = await transaction.collection('user').where({
          _openid: openid
        }).get()

        if (userRes.data && userRes.data.length > 0) {
          const user = userRes.data[0]
          await transaction.collection('user').doc(user._id).update({
            data: {
              balance: db.command.inc(Number(totalGet) || 0)
            }
          })
          await transaction.collection('balanceLog').add({
            data: {
              userId: user._id,
              userOpenid: openid,
              orderId: order._id,
              type: 'recharge',
              amount: Number(totalGet) || 0,
              before: Number(user.balance || 0),
              after: Number(user.balance || 0) + (Number(totalGet) || 0),
              reason: '微信支付充值到账',
              createTime: db.serverDate()
            }
          })
        }

      }

      return {
        success: true,
        alreadyProcessed: false,
        orderType: order.type,
        order
      }
    })

    if (result.success) {
      if (!result.alreadyProcessed && result.orderType === 'order') {
        printOrderAsync(orderId, result.order).catch(err => {
          console.error('打印订单失败', err)
        })
      }
      // 需要返回该字段，否则云支付会一直回调
      return { errcode: 0, errmsg: '支付成功' }
    }

    return { errcode: 1, errmsg: '事务执行失败' }
  } catch (e) {
    console.error('支付结果事务处理失败', e)
    return {
      errcode: 1,
      errmsg: '服务器异常'
    }
  }
}
