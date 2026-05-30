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

    const fs = wx.getFileSystemManager();
    const app = this;

    // 读取 JSON 文件的辅助函数
    const readJson = (path) => {
      try {
        const content = fs.readFileSync(path, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        console.warn('读取失败:', path, e.message);
        return null;
      }
    };

    // 使用 setTimeout 让加载异步执行，避免阻塞
    setTimeout(() => {
      try {
        // 加载元数据
        const sheets = readJson('miniprogram/data/meta.json') || 
                       readJson('data/meta.json') || [];
        app.globalData.sheets = sheets;

        // 加载价格数据
        const allPrices = [];
        const priceFiles = [
          'miniprogram/data/prices_CCC锂电池.json',
          'miniprogram/data/prices_GB40165.json',
          'miniprogram/data/prices_GB标准.json',
          'miniprogram/data/prices_IEC.json',
          'miniprogram/data/prices_UN38.3.json',
          'miniprogram/data/prices_其他标准.json'
        ];

        for (const file of priceFiles) {
          const data = readJson(file);
          if (data && Array.isArray(data)) {
            allPrices.push(...data);
          }
        }

        // 如果上面路径失败，尝试不带 miniprogram 前缀的路径
        if (allPrices.length === 0) {
          const altPriceFiles = [
            'data/prices_CCC锂电池.json',
            'data/prices_GB40165.json',
            'data/prices_GB标准.json',
            'data/prices_IEC.json',
            'data/prices_UN38.3.json',
            'data/prices_其他标准.json'
          ];
          for (const file of altPriceFiles) {
            const data = readJson(file);
            if (data && Array.isArray(data)) {
              allPrices.push(...data);
            }
          }
        }

        app.globalData.prices = allPrices;

        // 加载表格数据
        const fullSheets = {};
        const tableFiles = [
          { name: 'GB40165', path: 'miniprogram/data/sheet_GB40165.json' },
          { name: 'GB标准', path: 'miniprogram/data/sheet_GB标准.json' },
          { name: 'IEC', path: 'miniprogram/data/sheet_IEC.json' },
          { name: 'UN38.3', path: 'miniprogram/data/sheet_UN38.3.json' },
          { name: '其他标准', path: 'miniprogram/data/sheet_其他标准.json' }
        ];

        for (const item of tableFiles) {
          let data = readJson(item.path);
          if (!data) {
            data = readJson(item.path.replace('miniprogram/', ''));
          }
          if (data) {
            fullSheets[item.name] = data;
          }
        }

        app.globalData.fullSheets = fullSheets;
        console.log('已加载表格:', Object.keys(fullSheets));

        // 构建搜索索引
        app.buildSearchIndex();

        app.globalData.dataReady = true;
        wx.hideLoading();
        console.log('数据加载完成:', allPrices.length, '条标准,', sheets.length, '个Sheet');

        // 如果数据为空，显示警告
        if (allPrices.length === 0) {
          wx.showModal({
            title: '数据加载警告',
            content: '价格数据为空，请检查数据文件是否存在',
            showCancel: false
          });
        }
      } catch (err) {
        wx.hideLoading();
        wx.showModal({
          title: '数据加载失败',
          content: '加载数据时出错: ' + err.message,
          showCancel: false
        });
        console.error('数据加载失败:', err);
      }
    }, 100);
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
