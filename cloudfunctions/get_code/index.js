// 云函数入口文件
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({
  env: '填写你的环境ID'
})

const db = cloud.database()

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

// 云函数入口函数
exports.main = async (event, context) => {
  const { page, scene } = event

  try {
    const wxContext = cloud.getWXContext()
    if (!await isAdmin(wxContext.OPENID, event.adminToken)) {
      return {
        success: false,
        code: 'ADMIN_AUTH_REQUIRED',
        error: '管理员登录已失效'
      }
    }

    // 调用生成小程序码的接口
    const result = await cloud.openapi.wxacode.getUnlimited({
      page: page || 'pages/index/index',
      scene: scene || '',
      width: 280
    })

    // 将生成的小程序码上传到云存储中
    const upload = await cloud.uploadFile({
      cloudPath: 'tableCode/' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) + '.png',
      fileContent: result.buffer
    })

    return upload.fileID // 返回文件的fileID,也就是该图片地址
  } catch (err) {
    console.error('生成小程序码失败', err)
    throw err
  }
}




