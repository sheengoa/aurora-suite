// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: '填写你的环境ID'
})


const db = cloud.database()
const DEFAULT_SHOP_NAME = '餐饮店'

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const num = Number(value)
  return Number.isNaN(num) ? fallback : num
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function normalizeSkus(dish = {}) {
  const source = Array.isArray(dish.skus) && dish.skus.length > 0
    ? dish.skus
    : [{
      id: 'default',
      name: '默认规格',
      price: dish.price,
      status: 1,
      sort: 0
    }]

  return source.map((sku, index) => ({
    id: sku.id || `sku_${index + 1}`,
    name: sku.name || (index === 0 ? '默认规格' : `规格${index + 1}`),
    price: roundMoney(toNumber(sku.price, toNumber(dish.price, 0))),
    status: sku.status === 0 ? 0 : 1,
    sort: Number(sku.sort) || index
  })).sort((a, b) => a.sort - b.sort)
}

function assertPriceEqual(actual, expected) {
  return Math.abs(roundMoney(actual) - roundMoney(expected)) < 0.01
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return []
  }
  return tags
    .map(tag => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 20)
}

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
  let content = `<C>*</C><BR>`
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
  let payMethodText = ''
  if (order.payWithBalance !== undefined) {
    // 如果payWithBalance字段存在，使用它来判断
    payMethodText = order.payWithBalance ? '余额支付' : '微信支付'
  } else if (order.pay_status) {
    // 如果已支付但没有payWithBalance字段，可能是余额支付（余额支付会在创建订单时标记为已支付）
    payMethodText = '余额支付'
  } else {
    payMethodText = '微信支付'
  }
  if (payMethodText) {
    content += `<LEFT>支付方式: ${payMethodText}</LEFT><BR>`
  }
  
  content += `<C>--------------------------------</C><BR>`
  
  // 用户信息
  // if (order.userNickName) {
  //   content += `<LEFT><font# bolder=0 height=2 width=1>${escapeHtml(order.userNickName)}</font#></LEFT><BR>`
  // }
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

// 打印订单
async function printOrder(orderId, orderData) {
  try {
    // 1. 查询打印机信息
    const printerRes = await db.collection('printer').limit(1).get()
    if (!printerRes.data || printerRes.data.length === 0) {
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
      console.error('打印订单失败', printRes.result)
    }
  } catch (err) {
    console.error('打印订单异常', err)
    throw err
  }
}


// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const {
    orderGoods,
    totalPrice,
    finalPrice,
    payWithBalance,
    tableNumber,
    orderType,
    remark
  } = event

  try {
    if (event[['use', 'Mian', 'dan'].join('')] === true) {
      throw new Error('该支付方式已下线')
    }

    const result = await db.runTransaction(async transaction => {
      // 1. 检查用户是否存在
      const userRes = await transaction.collection('user').where({
        _openid: openid
      }).get()

      if (!userRes.data || userRes.data.length === 0) {
        throw new Error('用户不存在')
      }

      const user = userRes.data[0]
      const currentBalance = user.balance || 0
      const finalOrderType = orderType === 'takeOut' ? 'takeOut' : 'dineIn'
      const finalTableNumber = String(tableNumber || '').trim()
      const finalRemark = String(remark || '').trim().slice(0, 120)

      if (!finalTableNumber) {
        throw new Error('下单前请先扫描桌码')
      }

      const tableCodeRes = await transaction.collection('tableCode').where({
        tableNumber: finalTableNumber
      }).limit(1).get()

      if (!tableCodeRes.data || tableCodeRes.data.length === 0) {
        throw new Error('桌码无效，请重新扫描')
      }

      if (!Array.isArray(orderGoods) || orderGoods.length === 0) {
        throw new Error('订单商品不能为空')
      }

      const validatedGoods = []
      let recalculatedTotal = 0

      for (const item of orderGoods) {
        const dishId = item && item.dishId
        const count = Math.floor(Number(item && item.count) || 0)

        if (!dishId || count <= 0) {
          throw new Error('订单商品信息不完整')
        }

        const dishRes = await transaction.collection('dish').doc(dishId).get()
        const dish = dishRes.data

        if (!dish || dish.status !== 1) {
          throw new Error('部分菜品已下架，请重新选择')
        }

        const enabledSkus = normalizeSkus(dish).filter(sku => sku.status === 1)
        if (enabledSkus.length === 0) {
          throw new Error(`"${dish.name || '菜品'}"暂无可售规格`)
        }

        const skuId = item.skuId || 'default'
        const sku = enabledSkus.find(skuItem => skuItem.id === skuId) || (skuId === 'default' ? enabledSkus[0] : null)
        if (!sku) {
          throw new Error(`"${dish.name || '菜品'}"规格已下架，请重新选择`)
        }

        const subtotal = roundMoney(sku.price * count)
        recalculatedTotal = roundMoney(recalculatedTotal + subtotal)

        validatedGoods.push({
          dishId: dish._id,
          dishName: dish.name || item.dishName || '未知菜品',
          dishImage: dish.image || item.dishImage || '',
          skuId: sku.id,
          skuName: sku.name,
          price: sku.price,
          count,
          tags: normalizeTags(item.tags),
          subtotal
        })
      }

      if (!assertPriceEqual(totalPrice, recalculatedTotal)) {
        throw new Error('菜品价格已更新，请重新确认')
      }

      const recalculatedFinalPrice = recalculatedTotal

      if (!assertPriceEqual(finalPrice, recalculatedFinalPrice)) {
        throw new Error('菜品价格已更新，请重新确认')
      }

      // 2. 如果余额支付，检查余额并扣除
      if (payWithBalance && recalculatedFinalPrice > 0) {
        if (currentBalance < recalculatedFinalPrice) {
          throw new Error('余额不足')
        }

        // 扣除余额
        await transaction.collection('user').doc(user._id).update({
          data: {
            balance: db.command.inc(-recalculatedFinalPrice)
          }
        })
      }

      // 3. 创建订单
      const date = new Date() // 记录订单创建时间
      
      const orderData = {
        type: 'order',
        goods: validatedGoods,
        totalPrice: recalculatedTotal,
        finalPrice: recalculatedFinalPrice,
        orderType: finalOrderType,
        status: 0,
        pay_status: !!payWithBalance,
        payMethod: payWithBalance ? 'balance' : 'wechat',
        createTime: db.serverDate(),
        _openid: openid,
        // 用户信息
        userNickName: user.nickName || '',
        userAvatar: user.avatarUrl || '',
        userPhone: user.phoneNumber || '',
        // 桌码号
        tableNumber: finalTableNumber,
        remark: finalRemark
      }

      const orderRes = await transaction.collection('order').add({
        data: orderData
      })

      const orderId = orderRes._id
      // 添加 _id 和实际时间到订单数据中，用于打印
      const orderWithId = {
        ...orderData,
        _id: orderId,
        createTime: date, // 使用实际的 Date 对象替代 db.serverDate()
        payWithBalance: payWithBalance // 添加支付方式标识，用于打印时显示
      }

      return {
        success: true,
        orderId: orderId,
        order: orderWithId
      }
    })

    // 4. 余额支付订单立即打印（微信支付在支付回调中打印）
    if (result.success && result.orderId && payWithBalance) {
      try {
        await printOrder(result.orderId, result.order)
      } catch (printErr) {
        // 打印失败不影响订单创建，只记录日志
        console.error('打印订单失败', printErr)
      }
    }

    return result
  } catch (err) {
    console.error('下单失败', err)
    return {
      success: false,
      error: err.message || '下单失败'
    }
  }
}
