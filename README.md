# Aurora Suite - 餐饮点餐小程序

### 想了很久，决定免费开源！！！喜欢的记得给star星星

背景：市面上不缺点餐系统，但是贵？不好用？所以我开发了这款非常适合餐饮店的点餐小程序。

#### 功能亮度：一键生成桌码、打印菜单小票（不需要人工手写菜单）

## 📸 效果展示

<table>
  <tr>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/01-pages-index-index.png" alt="点餐页面" />
      <br />
      <div align="center">点餐页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/03-pages-recharge-recharge.png" alt="充值页面" />
      <br />
      <div align="center">充值页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/04-pages-myorder-myorder.png" alt="我的订单页面" />
      <br />
      <div align="center">我的订单页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/05-pages-myhome-myhome.png" alt="个人中心页面" />
      <br />
      <div align="center">个人中心页面</div>
    </td>
  </tr>
  <tr>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/07-pages-admin-admin.png" alt="管理员页面" />
      <br />
      <div align="center">管理员页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/15-pages-admin-printer-printer.png" alt="打印机管理页面" />
      <br />
      <div align="center">打印机管理页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/02-pages-dish-detail-dish-detail.png" alt="菜品详情页面" />
      <br />
      <div align="center">菜品详情页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/06-pages-settle-settle.png" alt="结算订单页面" />
      <br />
      <div align="center">结算订单页面</div>
    </td>
  </tr>
  <tr>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/12-pages-admin-shopSettings-shopSettings.png" alt="店铺设置页面" />
      <br />
      <div align="center">店铺设置页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/09-pages-admin-dish-dish.png" alt="菜品管理页面" />
      <br />
      <div align="center">菜品管理页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/10-pages-admin-user-user.png" alt="会员管理页面" />
      <br />
      <div align="center">会员管理页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/11-pages-admin-order-order.png" alt="订单管理页面" />
      <br />
      <div align="center">订单管理页面</div>
    </td>
  </tr>
  <tr>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/13-pages-admin-rechargeOptions-rechargeOptions.png" alt="充值选项管理页面" />
      <br />
      <div align="center">充值选项管理页面</div>
    </td>
    <td width="25%">
      <img src="./docs/visual-qa/2026-08-09/brand-ui-final/full-routes/14-pages-admin-tableCode-tableCode.png" alt="桌码管理页面" />
      <br />
      <div align="center">桌码管理页面</div>
    </td>
  </tr>
</table>



---

## ✨ 功能简介

### 👤 顾客功能

#### 1. 在线点餐（支持堂食和打包）
- ✅ 菜品分类浏览，清晰直观
- ✅ 菜品详情查看和分享
- ✅ 多规格、多属性选择，不同规格可设置不同价格
- ✅ 购物车管理，方便快捷
- ✅ 扫码绑定桌码，订单确认时支持换桌
- ✅ 微信支付、余额支付

#### 2. 会员充值
- ✅ 充值即成为会员
- ✅ 多种充值套餐可选，灵活配置

#### 3. 订单管理
- ✅ 查看点餐订单
- ✅ 查看充值记录，一目了然

#### 4. 个人中心
- ✅ 余额查询，实时显示
- ✅ 查看个人资料

### 🛠️ 管理员功能

#### 数据管理
- ✅ **菜品管理** - 添加、编辑、删除菜品，设置规格价格、属性、图片、描述等
- ✅ **菜品分类管理** - 管理菜品分类，支持排序
- ✅ **会员管理** - 查看会员列表，修改会员余额
- ✅ **订单管理** - 查看所有订单
- ✅ **充值选项管理** - 设置充值套餐和赠送规则

#### 系统设置
- ✅ **店铺设置** - 配置店铺名称和欢迎词
- ✅ **桌码管理** - 管理桌号信息，生成桌码海报（如使用桌号功能）
- ✅ **打印机管理** - 配置小票打印机，支持自动打印订单
- ✅ **修改密码** - 修改管理员登录密码

> 💡 **进入管理员界面的方法**：在"我的"页面右下角连续点击5次即可进入管理后台

### 🎨 设计特色

- ❤️ 红色主题，温馨大气
- 📱 简洁现代的UI设计
- 🚀 流畅的用户体验
- 💫 精美的动画效果

---

## 🚀 快速部署

### 📁 代码目录说明

```
aurora-suite/
├── cloudfunctions/              # 云函数目录
│   ├── login/                  # 用户登录，获取openid
│   ├── userProfile/            # 用户资料同步（服务端维护用户记录）
│   ├── getCategory/            # 获取菜品分类
│   ├── getShopSettings/        # 获取公开店铺设置
│   ├── createRechargeOrder/    # 服务端校验充值套餐并创建订单
│   ├── cancelOrder/            # 服务端事务取消余额订单
│   ├── adminApi/               # 管理员会话与后台数据操作
│   ├── doBuy/                  # 执行购买/下单操作
│   ├── pay/                    # 微信支付相关
│   ├── pay_success/            # 支付成功回调
│   ├── get_code/               # 生成小程序码
│   ├── getPhoneNumber/         # 获取手机号
│   ├── getUserList/            # 获取用户列表（管理后台用）
│   ├── printBack/              # 打印机回调处理
│   └── printManage/            # 打印机管理
│
├── miniprogram/                # 小程序前端目录
│   ├── pages/                  # 页面目录
│   │   ├── index/             # 首页（点餐页面）
│   │   ├── dish-detail/       # 菜品详情页面
│   │   ├── recharge/          # 充值页面
│   │   ├── myorder/           # 我的订单页面
│   │   ├── myhome/            # 个人中心页面
│   │   ├── settle/            # 结算页面
│   │   └── admin/             # 管理后台目录
│   │       ├── admin.js       # 管理员首页
│   │       ├── dish/          # 菜品管理
│   │       ├── dishCategory/  # 菜品分类管理
│   │       ├── user/          # 会员管理
│   │       ├── order/         # 订单管理
│   │       ├── rechargeOptions/ # 充值套餐管理
│   │       ├── shopSettings/  # 店铺设置
│   │       ├── tableCode/     # 桌码管理
│   │       └── printer/       # 打印机管理
│   ├── components/            # 组件目录
│   │   ├── avatarNicknameModal/ # 头像昵称授权组件
│   │   ├── colorui/           # ColorUI样式库
│   │   └── painter/           # 海报生成组件
│   ├── images/                # 图片资源目录
│   ├── utils/                 # 工具函数目录
│   ├── vant/                  # Vant Weapp UI组件库
│   ├── app.js                 # 小程序入口文件
│   ├── app.json               # 小程序配置文件
│   └── app.wxss               # 小程序全局样式
│
├── project.config.json        # 项目配置文件
```

### 环境要求

- 微信开发者工具（最新版本）
- 已注册并且备案成功的微信小程序账号
- 已开通微信云开发

### 部署步骤

#### 1. 获取项目代码

```bash
git clone <你的仓库地址>
cd aurora-suite
```

#### 2. 配置云开发环境

1. 在微信开发者工具中打开项目
2. 开通云开发，创建云环境
3. 获取云环境ID（在云开发控制台顶部查看）

#### 3. 修改配置文件

**修改小程序入口文件** `miniprogram/app.js`（第18行）：

```javascript
wx.cloud.init({
  env: '填写你的环境ID',  // 替换为你的实际环境ID
  traceUser: true,
})
```

**修改所有云函数配置文件**（在 `cloudfunctions` 目录下的各个云函数 `index.js` 文件中）：

将所有 `'填写你的环境ID'` 替换为你的实际云环境ID。

需要修改的云函数：
- `login/index.js`
- `userProfile/index.js`
- `getCategory/index.js`
- `getShopSettings/index.js`
- `createRechargeOrder/index.js`
- `cancelOrder/index.js`
- `adminApi/index.js`
- `doBuy/index.js`
- `pay/index.js` （这个微信支付云函数还需要改subMchId商户号改成自己的商户号ID）
- `pay_success/index.js`
- `get_code/index.js`
- `getPhoneNumber/index.js`
- `getUserList/index.js`
- `printBack/index.js`
- `printManage/index.js` (这个打印机管理员云函数还需要改appid、appsecret，访问：https://open.trenditiot.com 可申请打印机 AppID、appsecret，打印小票机也是找这家买)

#### 4. 创建数据库集合

在云开发控制台 → 数据库中创建以下集合：

- `user` - 用户表
- `dish` - 菜品表
- `dishCategory` - 菜单分类表
- `order` - 订单表（点餐订单和充值订单）
- `printer` - 打印机表
- `rechargeOptions` - 充值套餐表
- `admin` - 管理员和店铺设置表
- `tableCode` - 桌码表
- `adminSession` - 管理员短期会话表


> ⚠️ **重要**：不要再把所有集合设置为 `read: true, write: true`。请在云开发控制台逐个集合配置以下自定义安全规则。仓库的 `database-rules/` 目录提供了可直接粘贴到对应集合“安全规则”中的 JSON 文件；云函数使用服务端权限，不受这些前端规则限制。

| 集合 | 规则 |
| --- | --- |
| `user` | `{ "read": "doc._openid == auth.openid", "write": false }` |
| `order` | `{ "read": "doc._openid == auth.openid", "write": false }` |
| `dish` | `{ "read": true, "write": false }` |
| `dishCategory` | `{ "read": true, "write": false }` |
| `rechargeOptions` | `{ "read": true, "write": false }` |
| `admin` | `{ "read": false, "write": false }` |
| `adminSession` | `{ "read": false, "write": false }` |
| `printer` | `{ "read": false, "write": false }` |
| `tableCode` | `{ "read": false, "write": false }` |

#### 5. 上传云函数

在微信开发者工具中，右键点击每个云函数文件夹，选择：

**上传并部署：云端安装依赖**

需要上传的云函数：
- `login` - 用户登录
- `userProfile` - 用户资料同步
- `getCategory` - 获取菜品分类
- `getShopSettings` - 获取公开店铺设置
- `createRechargeOrder` - 创建充值订单
- `cancelOrder` - 取消余额订单
- `adminApi` - 管理后台接口
- `doBuy` - 执行购买/下单
- `pay` - 支付相关
- `pay_success` - 支付成功回调
- `get_code` - 生成小程序码
- `getPhoneNumber` - 获取手机号
- `getUserList` - 获取用户列表
- `printBack` - 打印机回调处理
- `printManage` - 打印机管理



#### 6. 确认发布包内容

运行时图片位于 `miniprogram/images`。设计原型和视觉验收截图位于 `docs`，不属于小程序上传包。

#### 7. 运行项目

1. 在微信开发者工具中点击"编译"按钮
2. 小程序会自动运行并显示在模拟器中

#### 8. 进入管理后台

1. 点击底部"我的"标签，进入个人中心
2. **在页面右下角空白区域连续快速点击 5 次**（1秒内完成）
3. 首次使用会弹出"设置管理员密码"弹窗，输入至少6位密码
4. 设置成功后自动跳转到管理后台
5. 在管理后台中可以：
   - 设置店铺信息
   - 添加菜品分类和菜品
   - 设置充值套餐
   - 管理订单和会员
   - 打印机管理


---

## 📝 其他说明

### 1、技术栈

- 微信云开发（云函数 + 云数据库）
- UI框架：Vant Weapp + ColorUI

### 2、微信支付如何授权

点击“云开发”进入云开发控制台-点击“设置”-点击“其他设置”-点击“授权”，商户号管理员收到授权消息-点击授权即可。

### 3、生成桌码（温馨提醒）

需要上线后才能生成桌码（因为桌码的页面路径参数必须是线上存在的页面）

### 4、成本

- 小程序认证费：30块
- 打印小票机:259块左右

成本不到300块就拥有自己的点餐小程序。




---

**祝生意兴隆！** 🎉
