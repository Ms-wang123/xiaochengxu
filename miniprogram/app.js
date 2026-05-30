// ========================================
// 电池检测报价查询 - 微信小程序
// ========================================
App({
  globalData: {
    dataReady: false,
    prices: [],
    sheets: [],
    fullSheets: {},
    searchIndex: {}
  },

  onLaunch() {
    // 加载数据
    this.loadData();
  },

  loadData() {
    const app = this;
    wx.showLoading({ title: '加载数据中...', mask: true });

    try {
      // 从本地 data.json 加载
      const data = require('./data/data.json');
      
      app.globalData.prices = data.prices || [];
      app.globalData.sheets = data.sheets || [];
      app.globalData.fullSheets = data.full_sheets || {};
      
      // 构建搜索索引
      app.buildSearchIndex();
      
      app.globalData.dataReady = true;
      wx.hideLoading();
      console.log('数据加载完成:', app.globalData.prices.length, '条标准,', app.globalData.sheets.length, '个Sheet');
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '数据加载失败',
        content: '请确保 data/data.json 文件存在且格式正确',
        showCancel: false
      });
      console.error('数据加载失败:', err);
    }
  },

  buildSearchIndex() {
    const index = {};
    const prices = this.globalData.prices;

    prices.forEach((item, idx) => {
      const title = item.title || '';
      const keys = [title, title.toLowerCase()];

      // 提取标准编号
      const stdId = this.extractStandardId(title);
      if (stdId) {
        keys.push(stdId, stdId.toLowerCase());
      }

      keys.forEach(key => {
        if (!index[key]) {
          index[key] = [];
        }
        index[key].push(idx);
      });
    });

    this.globalData.searchIndex = index;
  },

  extractStandardId(name) {
    if (!name) return '';
    let m = name.match(/(?:IEC|GB\/T|GB|UL|UN|QC\/T|SJ\/T|MT\/T)\s*[\d.]+/i);
    if (m) return m[0];
    m = name.match(/[A-Z]+\s*[\d.]+/);
    if (m) return m[0];
    m = name.match(/(\d{4,})/);
    if (m) return m[1];
    return '';
  },

  // 搜索
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const index = this.globalData.searchIndex;
    const prices = this.globalData.prices;
    const seen = new Set();
    const results = [];

    // 精确匹配
    if (index[q]) {
      index[q].forEach(idx => {
        if (!seen.has(idx)) {
          seen.add(idx);
          results.push(prices[idx]);
        }
      });
    }

    // 模糊匹配
    for (const key in index) {
      if (key.toLowerCase().indexOf(q) !== -1) {
        index[key].forEach(idx => {
          if (!seen.has(idx)) {
            seen.add(idx);
            results.push(prices[idx]);
          }
        });
      }
    }

    return results.slice(0, 20);
  },

  // 获取某个 sheet 下的所有标准
  getPricesBySheet(sheetName) {
    return this.globalData.prices.filter(p => p.sheet === sheetName);
  }
});
