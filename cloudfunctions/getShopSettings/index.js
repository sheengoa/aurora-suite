const cloud = require('wx-server-sdk')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()

exports.main = async () => {
  try {
    const res = await db.collection('admin')
      .field({ shopName: true, welcomeText: true, isOpen: true })
      .limit(1)
      .get()
    return { success: true, data: (res.data || [])[0] || {} }
  } catch (err) {
    console.error('读取店铺设置失败', err)
    return { success: false, error: '读取店铺设置失败' }
  }
}
