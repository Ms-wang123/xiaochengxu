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

    // 使用文件系统 API 读取大 JSON 文件
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/data.json`;

    const loadFromLocal = () => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        app.processData(data);
      } catch (err) {
        console.error('读取本地数据失败:', err);
        this.showError();
      }
    };

    const copyAndLoad = () => {
      try {
        // 从项目目录复制到用户数据目录
        fs.copyFileSync(
          'data/data.json',
          filePath
        );
        loadFromLocal();
      } catch (err) {
        console.error('复制数据文件失败:', err);
        // 尝试直接 require（小文件兼容）
        this.loadDataByRequire();
      }
    };

    // 检查文件是否已存在
    try {
      fs.accessSync(filePath);
      loadFromLocal();
    } catch {
      copyAndLoad();
    }
  },

  loadDataByRequire() {
    try {
      const data = require('./data/data.json');
      this.processData(data);
    } catch (err) {
      console.error('require 加载失败:', err);
      this.showError();
    }
  },

  processData(data) {
    const app = this;
    app.globalData.prices = data.prices || [];
    app.globalData.sheets = data.sheets || [];
    app.globalData.fullSheets = data.full_sheets || {};
    
    // 构建搜索索引
    app.buildSearchIndex();
    
    app.globalData.dataReady = true;
    wx.hideLoading();
    console.log('数据加载完成:', app.globalData.prices.length, '条标准,', app.globalData.sheets.length, '个Sheet');
  },

  showError() {
    wx.hideLoading();
    wx.showModal({
      title: '数据加载失败',
      content: '请确保 data/data.json 文件存在且格式正确',
      showCancel: false
    });
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
