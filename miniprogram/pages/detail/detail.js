// ========================================
// 详情页
// ========================================
const app = getApp();

Page({
  data: {
    item: null,
    sampleText: '',
    priceText: ''
  },

  onLoad(options) {
    const title = decodeURIComponent(options.title || '');
    this.loadDetail(title);
  },

  loadDetail(title) {
    const prices = app.globalData.prices;
    const item = prices.find(p => p.title === title);

    if (item) {
      // 构建样品文本
      const samples = [];
      if (item.sample_cell && item.sample_cell !== '0' && item.sample_cell !== '') {
        samples.push('电芯 ' + item.sample_cell);
      }
      if (item.sample_battery && item.sample_battery !== '0' && item.sample_battery !== '') {
        samples.push('电池组/系统 ' + item.sample_battery);
      }

      // 构建价格文本
      const priceParts = [];
      if (item.cell_price && item.cell_price !== '0' && item.cell_price !== '') {
        const num = parseInt(item.cell_price);
        priceParts.push('电芯：¥' + (num ? num.toLocaleString() : item.cell_price));
      }
      if (item.battery_price && item.battery_price !== '0' && item.battery_price !== '') {
        const num = parseInt(item.battery_price);
        priceParts.push('电池组/系统：¥' + (num ? num.toLocaleString() : item.battery_price));
      }

      this.setData({
        item: item,
        sampleText: samples.join('，'),
        priceText: priceParts.join('，')
      });

      wx.setNavigationBarTitle({
        title: item.title.substring(0, 15) + '...'
      });
    }
  }
});
