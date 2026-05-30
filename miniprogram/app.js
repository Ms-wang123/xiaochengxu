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
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载数据中...', mask: true });

    try {
      // 加载数据（使用JS模块）
      const data = require('./data/data.js');

      this.globalData.sheets = data.sheets || [];
      this.globalData.prices = data.prices || [];
      this.globalData.fullSheets = data.full_sheets || {};

      // 构建搜索索引
      this.buildSearchIndex();

      this.globalData.dataReady = true;
      wx.hideLoading();

      const priceCount = this.globalData.prices.length;
      const sheetCount = this.globalData.sheets.length;
      console.log('数据加载完成:', priceCount, '条标准,', sheetCount, '个Sheet');
      console.log('表格数据:', Object.keys(this.globalData.fullSheets));

      if (priceCount === 0) {
        wx.showModal({
          title: '数据加载警告',
          content: '价格数据为空',
          showCancel: false
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '数据加载失败',
        content: err.message,
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
    let m = name.match(/(?:IEC|GB\/T|GB|UL|UN|QC\/T|SJ\/T|MT\/T)[\s\-]?[\d.]+/i);
    if (m) return m[0].replace(/[\s\-]/g, '');
    m = name.match(/(\d{5,})/);
    if (m) return m[1];
    return '';
  },

  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const prices = this.globalData.prices;
    const seen = new Set();
    const results = [];

    prices.forEach((item, idx) => {
      const title = (item.title || '').toLowerCase();
      const sheet = (item.sheet || '').toLowerCase();

      if (title.indexOf(q) !== -1 || sheet.indexOf(q) !== -1) {
        if (!seen.has(idx)) {
          seen.add(idx);
          results.push(item);
        }
        return;
      }

      const stdId = this.extractStandardId(item.title || '');
      if (stdId.toLowerCase().indexOf(q) !== -1 || stdId.replace(/[^\d]/g, '').indexOf(q) !== -1) {
        if (!seen.has(idx)) {
          seen.add(idx);
          results.push(item);
        }
      }
    });

    return results.slice(0, 20);
  },

  getPricesBySheet(sheetName) {
    return this.globalData.prices.filter(p => p.sheet === sheetName);
  }
});
