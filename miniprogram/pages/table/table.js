// ========================================
// 表格浏览页
// ========================================
const app = getApp();

Page({
  data: {
    sheets: [],
    currentSheet: '',
    tableHeaders: [],
    tableRows: [],
    tableData: null,
    dataReady: false,
    colWidth: 160
  },

  onLoad() {
    this.checkDataReady();
  },

  onShow() {
    this.checkDataReady();
  },

  checkDataReady() {
    if (app.globalData.dataReady) {
      this.initPage();
    } else {
      const timer = setInterval(() => {
        if (app.globalData.dataReady) {
          clearInterval(timer);
          this.initPage();
        }
      }, 500);
    }
  },

  initPage() {
    const sheets = app.globalData.sheets || [];
    this.setData({
      sheets: sheets,
      dataReady: true
    });

    // 默认选中第一个 sheet
    if (sheets.length > 0 && !this.data.currentSheet) {
      this.loadTable(sheets[0].name);
    }
  },

  onSwitchSheet(e) {
    const sheetName = e.currentTarget.dataset.sheet;
    this.loadTable(sheetName);
  },

  loadTable(sheetName) {
    this.setData({ currentSheet: sheetName });

    const fullSheets = app.globalData.fullSheets;
    const sheetData = fullSheets[sheetName];

    if (!sheetData) {
      wx.showToast({ title: '数据不存在', icon: 'none' });
      return;
    }

    const headers = sheetData.headers || [];
    const rawRows = sheetData.rows || [];

    // 根据列数动态计算列宽
    const colCount = headers.length || 1;
    const colWidth = Math.max(140, Math.min(220, Math.floor(680 / colCount)));

    // 处理行数据
    const rows = rawRows.map(row => {
      const cells = (row.cells || []).map(cell => {
        let display = cell.value || '';
        let isPrice = false;
        let isWeikai = false;

        // 价格列（第7-11列且为数字）高亮显示
        if (cell.is_number && cell.col >= 7 && cell.col <= 11 && display !== '0' && display !== '') {
          isPrice = true;
          const num = parseFloat(display);
          if (!isNaN(num) && num > 0) {
            display = num.toLocaleString();
          }
        }

        // 威凯报价列
        if (cell.col === 9 || cell.col === 10 || cell.col === 11) {
          isWeikai = true;
        }

        return {
          col: cell.col,
          display: display,
          isPrice: isPrice,
          isWeikai: isWeikai
        };
      });

      return { cells: cells };
    });

    this.setData({
      tableData: sheetData,
      tableHeaders: headers,
      tableRows: rows,
      colWidth: colWidth
    });
  }
});
