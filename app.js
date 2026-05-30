// ========================================
// 电池检测报价查询 - 主逻辑
// ========================================

(function() {
    'use strict';

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const suggestionsEl = document.getElementById('suggestions');
    const resultSection = document.getElementById('resultSection');
    const emptyState = document.getElementById('emptyState');
    const notFound = document.getElementById('notFound');
    const loadingEl = document.getElementById('loading');
    const saveBtn = document.getElementById('saveBtn');
    const saveMsg = document.getElementById('saveMsg');
    const excelPathInfo = document.getElementById('excelPathInfo');

    let debounceTimer = null;
    let currentItem = null; // 当前查询结果

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

        // 模糊匹配
        if (typeof search_index !== 'undefined') {
            const matches = [];
            for (const [key, item] of Object.entries(search_index)) {
                if (key.toLowerCase().includes(qLower)) {
                    matches.push({ key, item });
                }
            }

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

        showNotFound();
    }

    function showResult(item) {
        hideAll();
        currentItem = item;
        resultSection.style.display = 'block';
        suggestionsEl.style.display = 'none';

        // 标准名称
        document.getElementById('resultName').textContent = (item.category ? '[' + item.category + '] ' : '') + (item.name || '');

        // 样品数量
        const samples = [];
        if (item.cellCount) samples.push('电芯' + item.cellCount);
        if (item.batteryCount) samples.push('电池组/系统' + item.batteryCount);
        document.getElementById('resultSamples').textContent = samples.join('，') || '详见备注';

        // 周期
        document.getElementById('resultPeriod').textContent = item.period || '详见备注';

        // 价格 - 填入可编辑输入框
        const cellPriceEl = document.getElementById('editCellPrice');
        const batteryPriceEl = document.getElementById('editBatteryPrice');
        cellPriceEl.value = formatPriceValue(item.cellPrice);
        batteryPriceEl.value = formatPriceValue(item.batteryPrice);

        // 行业比价
        const indLine = document.getElementById('industryLine');
        if (item.industryPrice) {
            indLine.style.display = 'block';
            document.getElementById('resultIndustryPrice').textContent = item.industryPrice;
        } else {
            indLine.style.display = 'none';
        }

        // 证书费
        const certLine = document.getElementById('certFeeLine');
        if (item.certFee) {
            certLine.style.display = 'block';
            document.getElementById('resultCertFee').textContent = item.certFee;
        } else {
            certLine.style.display = 'none';
        }

        // 威凯报价
        const tpLine = document.getElementById('totalPriceLine');
        if (item.totalPrice) {
            tpLine.style.display = 'block';
            document.getElementById('resultTotalPrice').textContent = item.totalPrice;
        } else {
            tpLine.style.display = 'none';
        }

        // 备注
        const rmLine = document.getElementById('remarkLine');
        if (item.remark) {
            rmLine.style.display = 'block';
            document.getElementById('resultRemark').textContent = item.remark;
        } else {
            rmLine.style.display = 'none';
        }

        // 隐藏保存消息
        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';
        excelPathInfo.style.display = 'none';

        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function formatPriceValue(price) {
        if (!price || price === '0' || price === '') return '';
        return price;
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

    // ===== 保存价格到Excel =====
    saveBtn.addEventListener('click', function() {
        if (!currentItem) return;

        const cellPrice = document.getElementById('editCellPrice').value.trim();
        const batteryPrice = document.getElementById('editBatteryPrice').value.trim();

        if (!cellPrice && !batteryPrice) {
            saveMsg.textContent = '请至少输入一个价格';
            saveMsg.className = 'save-msg error';
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        saveMsg.textContent = '';
        saveMsg.className = 'save-msg';

        // 调用后端API
        fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                standard: currentItem.name,
                cellPrice: cellPrice,
                batteryPrice: batteryPrice
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                saveMsg.textContent = '✓ ' + data.message;
                saveMsg.className = 'save-msg success';
                excelPathInfo.style.display = 'block';
                // 更新内存中的价格
                if (cellPrice) currentItem.cellPrice = cellPrice;
                if (batteryPrice) currentItem.batteryPrice = batteryPrice;
            } else {
                saveMsg.textContent = '✗ ' + data.message;
                saveMsg.className = 'save-msg error';
                excelPathInfo.style.display = 'none';
            }
        })
        .catch(err => {
            saveMsg.textContent = '✗ 保存失败: ' + err.message;
            saveMsg.className = 'save-msg error';
        })
        .finally(() => {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 保存价格到Excel';
        });
    });

    // ===== 事件处理 =====
    searchInput.addEventListener('input', function() {
        const val = this.value.trim();
        clearBtn.style.display = val ? 'flex' : 'none';

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

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            clearTimeout(debounceTimer);
            loadingEl.style.display = 'none';
            search(this.value);
        }
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        showEmpty();
        searchInput.focus();
    });

    document.querySelectorAll('.hint-tag').forEach(tag => {
        tag.addEventListener('click', function() {
            const hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            searchInput.focus();
        });
    });

    document.querySelectorAll('.example-item').forEach(item => {
        item.addEventListener('click', function() {
            const hint = this.dataset.hint;
            searchInput.value = hint;
            clearBtn.style.display = 'flex';
            search(hint);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    searchInput.focus();

})();
