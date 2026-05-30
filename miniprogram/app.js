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
      // 加载元数据（sheet列表）
      const sheets = require('./data/meta.json');
      this.globalData.sheets = sheets;

      // 加载所有价格数据（使用JSON文件）
      const allPrices = [];
      try { allPrices.push(...require('./data/prices_CCC锂电池.json')); } catch (e) { console.warn('CCC锂电池加载失败:', e.message); }
      try { allPrices.push(...require('./data/prices_GB40165.json')); } catch (e) { console.warn('GB40165加载失败:', e.message); }
      try { allPrices.push(...require('./data/prices_GB标准.json')); } catch (e) { console.warn('GB标准加载失败:', e.message); }
      try { allPrices.push(...require('./data/prices_IEC.json')); } catch (e) { console.warn('IEC加载失败:', e.message); }
      try { allPrices.push(...require('./data/prices_UN38.3.json')); } catch (e) { console.warn('UN38.3加载失败:', e.message); }
      try { allPrices.push(...require('./data/prices_其他标准.json')); } catch (e) { console.warn('其他标准加载失败:', e.message); }

      this.globalData.prices = allPrices;

      // 加载表格数据（使用JSON文件）
      const fullSheets = {};
      try { fullSheets['GB40165'] = require('./data/sheet_GB40165.json'); } catch (e) { console.warn('GB40165表格加载失败:', e.message); }
      try { fullSheets['GB标准'] = require('./data/sheet_GB标准.json'); } catch (e) { console.warn('GB标准表格加载失败:', e.message); }
      try { fullSheets['IEC'] = require('./data/sheet_IEC.json'); } catch (e) { console.warn('IEC表格加载失败:', e.message); }
      try { fullSheets['UN38.3'] = require('./data/sheet_UN38.3.json'); } catch (e) { console.warn('UN38.3表格加载失败:', e.message); }
      try { fullSheets['其他标准'] = require('./data/sheet_其他标准.json'); } catch (e) { console.warn('其他标准表格加载失败:', e.message); }

      this.globalData.fullSheets = fullSheets;
      console.log('已加载表格:', Object.keys(fullSheets));

      // 构建搜索索引
      this.buildSearchIndex();

      this.globalData.dataReady = true;
      wx.hideLoading();
      console.log('数据加载完成:', allPrices.length, '条标准,', sheets.length, '个Sheet');
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '数据加载失败',
        content: '请确保数据文件存在且格式正确: ' + err.message,
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
