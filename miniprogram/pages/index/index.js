// ========================================
// 首页 - 搜索逻辑
// ========================================
const app = getApp();

Page({
  data: {
    query: '',
    results: [],
    searching: false,
    dataReady: false,
    autoFocus: true
  },

  onLoad() {
    this.checkDataReady();
  },

  onShow() {
    this.checkDataReady();
  },

  checkDataReady() {
    if (app.globalData.dataReady) {
      this.setData({ dataReady: true });
    } else {
      // 等待数据加载
      const timer = setInterval(() => {
        if (app.globalData.dataReady) {
          clearInterval(timer);
          this.setData({ dataReady: true });
        }
      }, 500);
    }
  },

  onInput(e) {
    const query = e.detail.value;
    this.setData({ query });
    if (query.trim()) {
      this.doSearch(query);
    } else {
      this.setData({ results: [] });
    }
  },

  onSearch() {
    const query = this.data.query.trim();
    if (query) {
      this.doSearch(query);
    }
  },

  doSearch(query) {
    if (!app.globalData.dataReady) return;

    this.setData({ searching: true });
    
    // 模拟延迟以展示搜索状态
    setTimeout(() => {
      const results = app.search(query);
      this.setData({
        results: results,
        searching: false
      });
    }, 150);
  },

  onClear() {
    this.setData({
      query: '',
      results: []
    });
  },

  onTapHint(e) {
    const hint = e.currentTarget.dataset.hint;
    this.setData({ query: hint });
    this.doSearch(hint);
  },

  onTapResult(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.results[index];
    // 跳转到详情页
    wx.navigateTo({
      url: '/pages/detail/detail?title=' + encodeURIComponent(item.title || '')
    });
  }
});
