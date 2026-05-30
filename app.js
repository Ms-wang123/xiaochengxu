// ========================================
// 电池检测报价查询 - 主逻辑
// ========================================

// search_index 从 search_index.json 加载（全局变量）

(function() {
    'use strict';

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const suggestionsEl = document.getElementById('suggestions');
    const resultSection = document.getElementById('resultSection');
    const emptyState = document.getElementById('emptyState');
    const notFound = document.getElementById('notFound');
    const loadingEl = document.getElementById('loading');

    let debounceTimer = null;

    // ===== 搜索逻辑 =====
    function search(query) {
        const q = query.trim();
        if (!q) {
            showEmpty();
            return;
        }

        // 精确匹配
        if (typeof search_index !== 'undefined' && search_index[q]) {
            showResult(search_index[q]);
            return;
        }

        // 大小写不敏感匹配
        const qLower = q.toLowerCase();
        if (typeof search_index !== 'undefined' && search_index[qLower]) {
            showResult(search_index[qLower]);
            return;
        }

        // 模糊匹配 - 在索引中搜索
        if (typeof search_index !== 'undefined') {
            const matches = [];
            for (const [key, item] of Object.entries(search_index)) {
                if (key.toLowerCase().includes(qLower)) {
                    matches.push({ key, item });
                }
            }

            // 去重
            const seen = new Set();
            const uniqueMatches = [];
            for (const m of matches) {
                if (!seen.has(m.item.id)) {
                    seen.add(m.item.id);
                    uniqueMatches.push(m);
                }
            }

            if (uniqueMatches.length === 1) {
                showResult(uniqueMatches[0].item);
                return;
            } else if (uniqueMatches.length > 1) {
                showSuggestions(uniqueMatches);
                return;
            }
        }

        // 没找到
        showNotFound();
    }

    function showResult(item) {
        hideAll();
        resultSection.style.display = 'flex';
        suggestionsEl.style.display = 'none';

        // 标准名称
        document.getElementById('resultCategory').textContent = item.category || '';
        document.getElementById('resultName').textContent = item.name || '';

        // 样品数量
        const samples = [];
        if (item.cellCount) samples.push('电芯: ' + item.cellCount);
        if (item.batteryCount) samples.push('电池组/系统: ' + item.batteryCount);
        document.getElementById('resultSamples').textContent = samples.join('\n') || '详见备注';

        // 周期
        document.getElementById('resultPeriod').textContent = item.period || '详见备注';

        // 电芯价格
        document.getElementById('resultCellPrice').textContent = formatPrice(item.cellPrice);

        // 电池组价格
        document.getElementById('resultBatteryPrice').textContent = formatPrice(item.batteryPrice);

        // 威凯/机构报价
        const tpCard = document.getElementById('totalPriceCard');
        if (item.totalPrice) {
            tpCard.style.display = 'block';
            document.getElementById('resultTotalPrice').textContent = item.totalPrice;
        } else {
            tpCard.style.display = 'none';
        }

        // 证书费用
        const cfCard = document.getElementById('certFeeCard');
        if (item.certFee) {
            cfCard.style.display = 'block';
            document.getElementById('resultCertFee').textContent = item.certFee;
        } else {
            cfCard.style.display = 'none';
        }

        // 行业参考报价
        const indCard = document.getElementById('industryCard');
        if (item.industryPrice) {
            indCard.style.display = 'block';
            document.getElementById('resultIndustryPrice').textContent = item.industryPrice;
        } else {
            indCard.style.display = 'none';
        }

        // 备注
        const rmCard = document.getElementById('remarkCard');
        if (item.remark) {
            rmCard.style.display = 'block';
            document.getElementById('resultRemark').textContent = item.remark;
        } else {
            rmCard.style.display = 'none';
        }

        // 滚动到结果
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function formatPrice(price) {
        if (!price || price === '0' || price === '') return '-';
        // 如果已经是格式化好的文本（含换行等），直接返回
        if (price.includes('\n') || price.includes('|') || price.length > 15) {
            return price;
        }
        // 纯数字格式化
        const num = parseFloat(price.replace(/[^\d.]/g, ''));
        if (isNaN(num)) return price;
        if (num >= 10000) {
            return '¥' + (num / 10000).toFixed(num % 10000 === 0 ? 0 : 1) + '万';
        }
        return '¥' + num.toLocaleString();
    }

    function showSuggestions(matches) {
        hideAll();
        suggestionsEl.style.display = 'block';
        suggestionsEl.innerHTML = matches.slice(0, 8).map(m => `
            <div class="suggestion-item" data-id="${m.item.id}">
                <span class="suggestion-code">${m.item.id}</span>
                <span class="suggestion-name">${m.item.name}</span>
                <span class="suggestion-cat">${m.item.category}</span>
            </div>
        `).join('');

        // 点击建议项
        suggestionsEl.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                if (typeof search_index !== 'undefined') {
                    for (const [k, v] of Object.entries(search_index)) {
                        if (v.id === id) {
                            searchInput.value = k;
                            showResult(v);
                            clearBtn.style.display = 'flex';
                            suggestionsEl.style.display = 'none';
                            break;
                        }
                    }
                }
            });
        });
    }

    function showEmpty() {
        hideAll();
        emptyState.style.display = 'block';
    }

    function showNotFound() {
        hideAll();
        notFound.style.display = 'block';
    }

    function hideAll() {
        resultSection.style.display = 'none';
        emptyState.style.display = 'none';
        notFound.style.display = 'none';
        loadingEl.style.display = 'none';
        suggestionsEl.style.display = 'none';
    }

    // ===== 事件处理 =====
    searchInput.addEventListener('input', function() {
        const val = this.value.trim();
        clearBtn.style.display = val ? 'flex' : 'none';

        // 防抖搜索
        clearTimeout(debounceTimer);
        if (val) {
            loadingEl.style.display = 'block';
            emptyState.style.display = 'none';
            notFound.style.display = 'none';
            resultSection.style.display = 'none';
            suggestionsEl.style.display = 'none';

            debounceTimer = setTimeout(() => {
                loadingEl.style.display = 'none';
                search(val);
            }, 200);
        } else {
            loadingEl.style.display = 'none';
            showEmpty();
        }
    });

    // 回车键
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            clearTimeout(debounceTimer);
            loadingEl.style.display = 'none';
            search(this.value);
        }
    });

    // 清除按钮
    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        showEmpty();
        searchInput.focus();
    });

    // 快捷标签
    document.querySelectorAll('.hint-tag').forEach(tag => {
        tag.addEventListener('click', function() {
            const hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            searchInput.focus();
        });
    });

    // 示例项目
    document.querySelectorAll('.example-item').forEach(item => {
        item.addEventListener('click', function() {
            const hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // 页面加载时聚焦搜索框
    searchInput.focus();

    // 处理浏览器后退/前进
    window.addEventListener('popstate', function() {
        const q = searchInput.value.trim();
        if (q) search(q);
    });

})();
