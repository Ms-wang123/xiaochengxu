# 电池检测报价查询 - 微信小程序

> 基于 https://battery.022340615.xyz/ 的微信小程序版本

## 功能

- 🔍 **标准搜索**：输入 IEC、GB、UL、UN 等标准号快速查询报价
- 📊 **分类浏览**：按标准分类（IEC、GB标准、UN38.3、CCC锂电池等）浏览完整表格
- 💰 **多维度报价**：查看威凯/机构报价、行业比价、证书费用
- 📋 **详细信息**：样品数量、检测周期、电芯/电池组价格

## 目录结构

```
miniprogram/
├── app.js              # 小程序入口，数据加载与搜索
├── app.json            # 全局配置
├── app.wxss            # 全局样式
├── project.config.json # 微信开发者工具配置
├── sitemap.json
├── data/
│   └── data.json       # 报价数据（自动生成）
├── images/             # TabBar 图标
├── pages/
│   ├── index/          # 首页 - 搜索
│   │   ├── index.js
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── detail/         # 详情页
│   │   ├── detail.js
│   │   ├── detail.wxml
│   │   ├── detail.wxss
│   │   └── detail.json
│   └── table/          # 表格浏览页
│       ├── table.js
│       ├── table.wxml
│       ├── table.wxss
│       └── table.json
```

## 使用步骤

### 1. 注册小程序
前往 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序账号，获取 **AppID**

### 2. 配置 AppID
打开 `project.config.json`，将 `appid` 字段改为你的 AppID：
```json
"appid": "wx你的AppID"
```

### 3. 打开项目
1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，选择 `miniprogram` 目录
3. 填写 AppID 或选择「测试号」

### 4. 预览
- 点击「预览」生成二维码
- 用微信扫码即可在手机上体验

### 5. 上传发布
- 点击「上传」提交代码
- 在微信公众平台提交审核
- 审核通过后即可发布

## 数据更新

如需更新报价数据，运行：
```bash
cd ..
python export_data.py
```
然后将生成的 `data.json` 复制到 `miniprogram/data/` 目录下。

## 技术栈

- 微信小程序原生框架
- WXML + WXSS + JavaScript
- 本地数据存储（data.json）
