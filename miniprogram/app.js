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
    // 匹配 IEC62619、IEC 62619、IEC-62619 等格式
    let m = name.match(/(?:IEC|GB\/T|GB|UL|UN|QC\/T|SJ\/T|MT\/T)[\s\-]?[\d.]+/i);
    if (m) return m[0].replace(/[\s\-]/g, ''); // 去掉空格和连字符，统一为 IEC62619 格式
    // 匹配纯数字编号（4位以上）
    m = name.match(/(\d{5,})/);
    if (m) return m[1];
    return '';
  },

  // 搜索
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const prices = this.globalData.prices;
    const seen = new Set();
    const results = [];

    // 遍历所有数据项进行匹配
    prices.forEach((item, idx) => {
      const title = (item.title || '').toLowerCase();
      const sheet = (item.sheet || '').toLowerCase();
      
      // 检查标题、sheet名是否包含查询词
      if (title.indexOf(q) !== -1 || sheet.indexOf(q) !== -1) {
        if (!seen.has(idx)) {
          seen.add(idx);
          results.push(item);
        }
        return;
      }
      
      // 检查标准编号（去掉空格后的纯数字匹配）
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

  // 获取某个 sheet 下的所有标准
  getPricesBySheet(sheetName) {
    return this.globalData.prices.filter(p => p.sheet === sheetName);
  }
});
