class TradingBacktest {
    constructor() {
        this.initialBalance = 1000;
        this.positionSizePercent = 0.01; // 1%
        this.leverage = 20; // x20 leverage for perpetual
        
        // Separate data for each strategy
        this.antiMartingaleData = {
            balance: this.initialBalance,
            trades: [],
            consecutiveLosses: 0,
            consecutiveWins: 0
        };
        
        this.martingaleData = {
            balance: this.initialBalance,
            trades: [],
            consecutiveLosses: 0,
            consecutiveWins: 0
        };
        
        this.initializeEventListeners();
        this.loadFromStorage();
        this.updateDisplay();
    }

    initializeEventListeners() {
        const form = document.getElementById('tradeForm');
        const resetBtn = document.getElementById('resetBtn');
        const resetDataBtn = document.getElementById('resetDataBtn');
        const statisticsBtn = document.getElementById('statisticsBtn');
        const entryPricesInput = document.getElementById('entryPrices');
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTrade();
        });
        
        resetBtn.addEventListener('click', () => {
            this.resetData();
        });

        resetDataBtn.addEventListener('click', () => {
            this.resetData();
        });

        statisticsBtn.addEventListener('click', () => {
            this.showStatisticsModal();
        });

        // Update DCA summary when entry prices change
        entryPricesInput.addEventListener('input', () => {
            this.updateDcaSummary();
        });

        // Modal event listeners
        this.initializeModal();
        this.initializeStatisticsModal();
    }

    initializeModal() {
        const modal = document.getElementById('tradeModal');
        const closeBtn = document.querySelector('.close');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    initializeStatisticsModal() {
        const modal = document.getElementById('statisticsModal');
        const closeBtn = document.getElementById('statsModalClose');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    updateDcaSummary() {
        const entryPricesStr = document.getElementById('entryPrices').value;
        const summaryDiv = document.getElementById('dcaSummary');
        const detailDiv = document.getElementById('dcaLevelsDetail');
        
        if (!entryPricesStr.trim()) {
            summaryDiv.style.display = 'none';
            return;
        }

        const entryPrices = entryPricesStr.split(',').map(price => parseFloat(price.trim()));
        
        if (entryPrices.some(price => isNaN(price))) {
            summaryDiv.style.display = 'none';
            return;
        }

        // Calculate DCA details
        const dcaLevels = entryPrices.length;
        const avgPrice = entryPrices.reduce((sum, price) => sum + price, 0) / dcaLevels;
        const totalSize = this.antiMartingaleData.balance * this.positionSizePercent;
        const sizePerLevel = totalSize / dcaLevels;

        // Update summary display
        document.getElementById('dcaLevels').textContent = dcaLevels;
        document.getElementById('avgPrice').textContent = this.formatPrice(avgPrice);
        document.getElementById('totalSize').textContent = this.formatCurrency(totalSize);
        
        // Create detailed DCA levels display
        detailDiv.innerHTML = '';
        entryPrices.forEach((price, index) => {
            const levelDiv = document.createElement('div');
            levelDiv.className = 'dca-level-item';
            
            const notionalValue = sizePerLevel * this.leverage;
            const quantity = notionalValue / price;
            
            levelDiv.innerHTML = `
                <span class="dca-level-price">Level ${index + 1}: ${this.formatPrice(price)}</span>
                <div class="dca-level-info">
                    <span>Size: ${this.formatCurrency(sizePerLevel)}</span>
                    <span>Qty: ${quantity.toFixed(4)}</span>
                </div>
            `;
            detailDiv.appendChild(levelDiv);
        });
        
        summaryDiv.style.display = 'block';
    }

    addTrade() {
        const tradeType = document.getElementById('tradeType').value;
        const entryPricesStr = document.getElementById('entryPrices').value;
        const exitPrice = parseFloat(document.getElementById('exitPrice').value);
        const rrTarget = parseFloat(document.getElementById('rrTarget').value);

        // Parse entry prices for DCA
        const entryPrices = entryPricesStr.split(',').map(price => parseFloat(price.trim()));
        
        if (entryPrices.some(price => isNaN(price)) || isNaN(exitPrice)) {
            alert('Vui lòng nhập giá hợp lệ!');
            return;
        }

        // Calculate average entry price for DCA
        const avgEntryPrice = entryPrices.reduce((sum, price) => sum + price, 0) / entryPrices.length;

        // Determine result based on PNL
        let pnlPercent = 0;
        if (tradeType === 'long') {
            pnlPercent = ((exitPrice - avgEntryPrice) / avgEntryPrice) * 100;
        } else {
            pnlPercent = ((avgEntryPrice - exitPrice) / avgEntryPrice) * 100;
        }
        
        const result = pnlPercent > 0 ? 'win' : 'loss';

        // Process trade for both strategies
        this.processTrade('antiMartingale', tradeType, avgEntryPrice, exitPrice, result, entryPrices, rrTarget);
        this.processTrade('martingale', tradeType, avgEntryPrice, exitPrice, result, entryPrices, rrTarget);

        this.updateDisplay();
        this.saveToStorage();
        this.clearForm();
    }

    processTrade(strategy, tradeType, entryPrice, exitPrice, result, entryPrices, rrTarget) {
        const data = strategy === 'antiMartingale' ? this.antiMartingaleData : this.martingaleData;
        const balanceBefore = data.balance;
        
        // Calculate position size based on strategy
        let positionSize = this.calculatePositionSize(strategy, data);
        
        // Calculate P&L with leverage for perpetual
        let pnlPercent = 0;
        if (tradeType === 'long') {
            pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        } else {
            pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
        }
        
        // Apply leverage effect to get ROE%
        const roePercent = pnlPercent * this.leverage;
        
        // For DCA, ROE% remains the same as it's based on average entry price
        // PNL is calculated directly from position size and ROE%
        const pnlAmount = (positionSize * roePercent) / 100;
        const newBalance = data.balance + pnlAmount;

        // Use RR from select instead of calculating from exit price
        const actualRR = rrTarget;

        // Update consecutive counters
        if (result === 'win') {
            data.consecutiveWins++;
            data.consecutiveLosses = 0;
        } else {
            data.consecutiveLosses++;
            data.consecutiveWins = 0;
        }

        // Create trade record
        const trade = {
            id: data.trades.length + 1,
            type: tradeType,
            entryPrice: entryPrice,
            entryPrices: entryPrices,
            exitPrice: exitPrice,
            positionSize: positionSize,
            pnl: pnlAmount,
            roePercent: roePercent,
            rrTarget: rrTarget,
            actualRR: actualRR,
            balanceBefore: balanceBefore,
            balance: newBalance,
            result: result,
            dcaLevels: entryPrices.length,
            leverage: this.leverage,
            strategy: strategy,
            timestamp: new Date().toLocaleString()
        };

        data.trades.push(trade);
        data.balance = newBalance;
    }

    calculatePositionSize(strategy, data) {
        let baseSize = data.balance * this.positionSizePercent;
        
        if (strategy === 'antiMartingale') {
            // Anti-Martingale: Increase size after wins, decrease after losses
            if (data.consecutiveWins > 0) {
                baseSize *= (1 + (data.consecutiveWins * 0.2));
            } else if (data.consecutiveLosses > 0) {
                baseSize *= Math.pow(0.8, data.consecutiveLosses);
            }
        } else {
            // Martingale: Increase size after losses, reset after wins
            if (data.consecutiveLosses > 0) {
                baseSize *= Math.pow(2, data.consecutiveLosses);
            }
        }
        
        return Math.min(baseSize, data.balance * 0.1);
    }

    // Helper function to format crypto prices with appropriate decimal places
    formatPrice(price) {
        if (typeof price !== 'number' || isNaN(price)) return '0.0000';
        
        if (price >= 1) {
            return price.toFixed(4);
        } else if (price >= 0.01) {
            return price.toFixed(6);
        } else {
            return price.toFixed(8);
        }
    }

    // Helper function to format currency amounts
    formatCurrency(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
        return `$${amount.toFixed(4)}`;
    }

    // Helper function to format PNL with higher precision
    formatPnl(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) return '$0.0000';
        return `$${amount.toFixed(4)}`;
    }

    updateDisplay() {
        // Update balance displays
        document.getElementById('antiMartingaleBalance').textContent = 
            this.formatCurrency(this.antiMartingaleData.balance);
        document.getElementById('martingaleBalance').textContent = 
            this.formatCurrency(this.martingaleData.balance);

        // Update tables
        this.updateTable('antiMartingaleTable', this.antiMartingaleData.trades, 'antiMartingale');
        this.updateTable('martingaleTable', this.martingaleData.trades, 'martingale');

        // Update statistics
        this.updateStatistics();
        
        // Update DCA summary
        this.updateDcaSummary();
    }

    updateTable(tableId, trades, strategy) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        if (!tbody) return;
        
        tbody.innerHTML = '';

        trades.forEach(trade => {
            const row = tbody.insertRow();
            row.className = `trade-row ${trade.result === 'win' ? 'win-row' : 'loss-row'}`;
            row.dataset.tradeId = trade.id;
            row.dataset.strategy = strategy;
            
            // Create type badge
            const typeBadge = `<span class="type-badge ${trade.type}">${trade.type.toUpperCase()}</span>`;
            
            // Create RR display with big win styling
            const rrDisplay = trade.actualRR > 5 ? 
                `<span class="big-win-rr">${trade.actualRR}R</span>` : 
                `${trade.actualRR}R`;
            
            // Create ROE display with danger badge for low ROE
            const roeDisplay = Math.abs(trade.roePercent) < 30 && trade.roePercent !== 0 ? 
                `<span class="danger-roe">${trade.roePercent >= 0 ? '+' : ''}${trade.roePercent.toFixed(2)}%</span>` : 
                `${trade.roePercent >= 0 ? '+' : ''}${trade.roePercent.toFixed(2)}%`;
            
            row.innerHTML = `
                <td>${trade.id}</td>
                <td>${typeBadge}</td>
                <td>${this.formatPrice(trade.entryPrice)}</td>
                <td>${this.formatPrice(trade.exitPrice)}</td>
                <td class="${trade.roePercent >= 0 ? 'profit' : 'loss'}">
                    ${roeDisplay}
                </td>
                <td>${rrDisplay}</td>
                <td>${this.formatCurrency(trade.positionSize).replace('$', '')}</td>
                <td class="${trade.pnl >= 0 ? 'profit' : 'loss'}">
                    ${trade.pnl >= 0 ? '+' : ''}${this.formatPnl(trade.pnl).replace('$', '')}
                </td>
                <td>${this.formatCurrency(trade.balanceBefore).replace('$', '')}</td>
                <td>${this.formatCurrency(trade.balance).replace('$', '')}</td>
                <td>
                    <span class="${trade.result === 'win' ? 'win-result' : 'loss-result'}">
                        ${trade.result === 'win' ? 'WIN' : 'LOSS'}
                    </span>
                </td>
                <td>
                    <button class="delete-btn" data-trade-id="${trade.id}" data-strategy="${strategy}">X</button>
                </td>
            `;

            // Add click event to show modal (only on non-button cells)
            const cells = row.querySelectorAll('td:not(:last-child)');
            cells.forEach(cell => {
                cell.addEventListener('click', () => {
                    this.showTradeModal(trade, strategy);
                });
            });

            // Add delete button event
            const deleteBtn = row.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTrade(trade.id, strategy);
            });
        });
    }

    showTradeModal(trade, strategy) {
        const modal = document.getElementById('tradeModal');
        if (!modal) return;
        
        // Populate modal with trade data
        const elements = {
            'modalTradeId': trade.id,
            'modalTradeType': trade.type.toUpperCase(),
            'modalStrategy': strategy === 'antiMartingale' ? 'Anti-Martingale' : 'Martingale',
            'modalDcaLevels': trade.dcaLevels,
            'modalEntryPrice': this.formatPrice(trade.entryPrice),
            'modalExitPrice': this.formatPrice(trade.exitPrice),
            'modalRoe': `${trade.roePercent >= 0 ? '+' : ''}${trade.roePercent.toFixed(2)}%`,
            'modalRr': `${trade.actualRR}R`,
            'modalPositionSize': this.formatCurrency(trade.positionSize),
            'modalPnl': `${trade.pnl >= 0 ? '+' : ''}${this.formatPnl(trade.pnl)}`,
            'modalBalanceBefore': this.formatCurrency(trade.balanceBefore),
            'modalBalanceAfter': this.formatCurrency(trade.balance),
            'modalResult': trade.result === 'win' ? 'WIN' : 'LOSS',
            'modalTimestamp': trade.timestamp
        };

        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = elements[id];
            }
        });

        // Show detailed entry levels with individual ROE and PNL
        const entryLevelsDiv = document.getElementById('modalEntryLevels');
        if (entryLevelsDiv && trade.entryPrices) {
            entryLevelsDiv.innerHTML = '';
            
            const sizePerLevel = trade.positionSize / trade.entryPrices.length;
            
            trade.entryPrices.forEach((entryPrice, index) => {
                const levelDiv = document.createElement('div');
                levelDiv.className = 'entry-level-item';
                
                // Calculate individual ROE and PNL for this level
                let pnlPercent = 0;
                if (trade.type === 'long') {
                    pnlPercent = ((trade.exitPrice - entryPrice) / entryPrice) * 100;
                } else {
                    pnlPercent = ((entryPrice - trade.exitPrice) / entryPrice) * 100;
                }
                
                const roePercent = pnlPercent * this.leverage;
                const levelPnl = (sizePerLevel * roePercent) / 100;
                const notionalValue = sizePerLevel * this.leverage;
                const quantity = notionalValue / entryPrice;
                
                levelDiv.innerHTML = `
                    <div class="entry-level-header">
                        <span class="entry-level-price">${this.formatPrice(entryPrice)}</span>
                        <span class="entry-level-badge">Level ${index + 1}</span>
                    </div>
                    <div class="entry-level-stats">
                        <div class="entry-level-stat">
                            <span class="entry-level-stat-label">Size</span>
                            <span class="entry-level-stat-value">${this.formatCurrency(sizePerLevel)}</span>
                        </div>
                        <div class="entry-level-stat">
                            <span class="entry-level-stat-label">ROE%</span>
                            <span class="entry-level-stat-value ${roePercent >= 0 ? 'profit' : 'loss'} ${Math.abs(roePercent) < 30 && roePercent !== 0 ? 'danger-roe' : ''}">
                                ${roePercent >= 0 ? '+' : ''}${roePercent.toFixed(2)}%
                            </span>
                        </div>
                        <div class="entry-level-stat">
                            <span class="entry-level-stat-label">PNL</span>
                            <span class="entry-level-stat-value ${levelPnl >= 0 ? 'profit' : 'loss'}">
                                ${levelPnl >= 0 ? '+' : ''}${this.formatPnl(levelPnl)}
                            </span>
                        </div>
                    </div>
                `;
                entryLevelsDiv.appendChild(levelDiv);
            });
            
            // Add summary if multiple levels
            if (trade.entryPrices.length > 1) {
                const summaryDiv = document.createElement('div');
                summaryDiv.className = 'entry-level-item';
                summaryDiv.style.background = '#e8f5e8';
                summaryDiv.style.border = '2px solid #27ae60';
                
                const totalRoe = (trade.pnl / trade.positionSize) * 100;
                
                summaryDiv.innerHTML = `
                    <div class="entry-level-header">
                        <span class="entry-level-price">Total Summary</span>
                        <span class="entry-level-badge" style="background: #27ae60;">DCA</span>
                    </div>
                    <div class="entry-level-stats">
                        <div class="entry-level-stat">
                            <span class="entry-level-stat-label">Total Size</span>
                            <span class="entry-level-stat-value">${this.formatCurrency(trade.positionSize)}</span>
                        </div>
                        <div class="entry-level-stat">
                            <span class="entry-level-stat-label">Avg ROE%</span>
                            <span class="entry-level-stat-value ${totalRoe >= 0 ? 'profit' : 'loss'}">
                                ${totalRoe >= 0 ? '+' : ''}${totalRoe.toFixed(2)}%
                            </span>
                        </div>
                        <div class="entry-level-stat">
                            <span class="entry-level-stat-label">Total PNL</span>
                            <span class="entry-level-stat-value ${trade.pnl >= 0 ? 'profit' : 'loss'}">
                                ${trade.pnl >= 0 ? '+' : ''}${this.formatPnl(trade.pnl)}
                            </span>
                        </div>
                    </div>
                `;
                entryLevelsDiv.appendChild(summaryDiv);
            }
        }
        
        modal.style.display = 'block';
    }

    updateStatistics() {
        const totalTrades = this.antiMartingaleData.trades.length;
        const winTrades = this.antiMartingaleData.trades.filter(t => t.result === 'win').length;
        const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : 0;

        const totalTradesEl = document.getElementById('totalTrades');
        const winRateEl = document.getElementById('winRate');
        
        if (totalTradesEl) totalTradesEl.textContent = totalTrades;
        if (winRateEl) winRateEl.textContent = `${winRate}%`;
    }

    clearForm() {
        const form = document.getElementById('tradeForm');
        const summaryDiv = document.getElementById('dcaSummary');
        
        if (form) form.reset();
        if (summaryDiv) summaryDiv.style.display = 'none';
    }

    resetData() {
        if (confirm('Bạn có chắc chắn muốn xóa tất cả dữ liệu?')) {
            this.antiMartingaleData = {
                balance: this.initialBalance,
                trades: [],
                consecutiveLosses: 0,
                consecutiveWins: 0
            };
            
            this.martingaleData = {
                balance: this.initialBalance,
                trades: [],
                consecutiveLosses: 0,
                consecutiveWins: 0
            };
            
            this.updateDisplay();
            this.saveToStorage();
        }
    }

    deleteTrade(tradeId, strategy) {
        if (confirm('Bạn có chắc chắn muốn xóa giao dịch này? Điều này sẽ hoàn lại số tiền cho cả hai chiến lược.')) {
            // Remove trade from both strategies and restore balance
            this.removeTradeFromBothStrategies(tradeId);
            
            this.updateDisplay();
            this.saveToStorage();
        }
    }

    removeTradeFromBothStrategies(tradeId) {
        // Remove from Anti-Martingale
        const antiTradeIndex = this.antiMartingaleData.trades.findIndex(t => t.id === tradeId);
        if (antiTradeIndex !== -1) {
            const antiTrade = this.antiMartingaleData.trades[antiTradeIndex];
            this.antiMartingaleData.balance = antiTrade.balanceBefore;
            this.antiMartingaleData.trades.splice(antiTradeIndex, 1);
            
            // Recalculate subsequent trades
            this.recalculateSubsequentTrades('antiMartingale', antiTradeIndex);
        }

        // Remove from Martingale
        const martTradeIndex = this.martingaleData.trades.findIndex(t => t.id === tradeId);
        if (martTradeIndex !== -1) {
            const martTrade = this.martingaleData.trades[martTradeIndex];
            this.martingaleData.balance = martTrade.balanceBefore;
            this.martingaleData.trades.splice(martTradeIndex, 1);
            
            // Recalculate subsequent trades
            this.recalculateSubsequentTrades('martingale', martTradeIndex);
        }

        // Reset consecutive counters for both strategies
        this.recalculateConsecutiveCounters('antiMartingale');
        this.recalculateConsecutiveCounters('martingale');
    }

    recalculateConsecutiveCounters(strategy) {
        const data = strategy === 'antiMartingale' ? this.antiMartingaleData : this.martingaleData;
        
        data.consecutiveWins = 0;
        data.consecutiveLosses = 0;
        
        // Recalculate from the end of trades array
        for (let i = data.trades.length - 1; i >= 0; i--) {
            const trade = data.trades[i];
            if (trade.result === 'win') {
                if (data.consecutiveLosses === 0) {
                    data.consecutiveWins++;
                } else {
                    break;
                }
            } else {
                if (data.consecutiveWins === 0) {
                    data.consecutiveLosses++;
                } else {
                    break;
                }
            }
        }
    }

    recalculateSubsequentTrades(strategy, startIndex) {
        const data = strategy === 'antiMartingale' ? this.antiMartingaleData : this.martingaleData;
        
        // Recalculate all trades after the deleted one
        for (let i = startIndex; i < data.trades.length; i++) {
            const trade = data.trades[i];
            const previousTrade = i > 0 ? data.trades[i - 1] : null;
            
            // Update balance before based on previous trade's balance after
            trade.balanceBefore = previousTrade ? previousTrade.balance : this.initialBalance;
            
            // Recalculate position size based on strategy rules
            let baseSize = trade.balanceBefore * this.positionSizePercent;
            
            if (strategy === 'antiMartingale') {
                // Count consecutive wins/losses up to this point
                let consecutiveWins = 0;
                let consecutiveLosses = 0;
                
                for (let j = 0; j < i; j++) {
                    if (data.trades[j].result === 'win') {
                        consecutiveWins++;
                        consecutiveLosses = 0;
                    } else {
                        consecutiveLosses++;
                        consecutiveWins = 0;
                    }
                }
                
                if (consecutiveWins > 0) {
                    baseSize *= (1 + (consecutiveWins * 0.2));
                } else if (consecutiveLosses > 0) {
                    baseSize *= Math.pow(0.8, consecutiveLosses);
                }
            } else {
                // Count consecutive losses up to this point
                let consecutiveLosses = 0;
                
                for (let j = 0; j < i; j++) {
                    if (data.trades[j].result === 'loss') {
                        consecutiveLosses++;
                    } else {
                        consecutiveLosses = 0;
                    }
                }
                
                if (consecutiveLosses > 0) {
                    baseSize *= Math.pow(2, consecutiveLosses);
                }
            }
            
            trade.positionSize = Math.min(baseSize, trade.balanceBefore * 0.1);
            
            // Recalculate P&L
            let pnlPercent = 0;
            if (trade.type === 'long') {
                pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
            } else {
                pnlPercent = ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
            }
            
            // Apply leverage effect
            const roePercent = pnlPercent * this.leverage;
            
            // Update trade fields
            trade.roePercent = roePercent;
            trade.actualRR = trade.rrTarget || 1; // Use stored RR target
            trade.pnl = (trade.positionSize * roePercent) / 100;
            trade.balance = trade.balanceBefore + trade.pnl;
        }
    }

    saveToStorage() {
        const data = {
            antiMartingale: this.antiMartingaleData,
            martingale: this.martingaleData
        };
        localStorage.setItem('tradingBacktestData', JSON.stringify(data));
    }

    loadFromStorage() {
        const savedData = localStorage.getItem('tradingBacktestData');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                if (data.antiMartingale) {
                    this.antiMartingaleData = data.antiMartingale;
                    // Migrate old trades to new format
                    this.migrateTrades(this.antiMartingaleData.trades);
                }
                if (data.martingale) {
                    this.martingaleData = data.martingale;
                    // Migrate old trades to new format
                    this.migrateTrades(this.martingaleData.trades);
                }
            } catch (error) {
                console.error('Error loading data from storage:', error);
            }
        }
    }

    migrateTrades(trades) {
        trades.forEach(trade => {
            // Add missing fields for backward compatibility
            if (trade.roePercent === undefined) {
                let pnlPercent = 0;
                if (trade.type === 'long') {
                    pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
                } else {
                    pnlPercent = ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
                }
                const roePercent = pnlPercent * this.leverage;
                trade.roePercent = roePercent;
            }
            
            if (trade.actualRR === undefined) {
                trade.actualRR = trade.rrTarget || 1; // Use RR target instead of calculating
            }
            
            if (trade.rrTarget === undefined) {
                trade.rrTarget = 1; // Default to 1R
            }
        });
    }

    showStatisticsModal() {
        const modal = document.getElementById('statisticsModal');
        if (!modal) return;

        // Calculate overall statistics
        const totalTrades = this.antiMartingaleData.trades.length;
        const winTrades = this.antiMartingaleData.trades.filter(t => t.result === 'win').length;
        const lossTrades = totalTrades - winTrades;
        const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : 0;

        // Anti-Martingale statistics
        const antiPnl = this.antiMartingaleData.balance - this.initialBalance;
        const antiRoi = ((antiPnl / this.initialBalance) * 100).toFixed(2);
        const antiMaxWins = this.calculateMaxConsecutive(this.antiMartingaleData.trades, 'win');
        const antiMaxLosses = this.calculateMaxConsecutive(this.antiMartingaleData.trades, 'loss');
        const antiBestTrade = this.getBestTrade(this.antiMartingaleData.trades);
        const antiWorstTrade = this.getWorstTrade(this.antiMartingaleData.trades);

        // Martingale statistics
        const martPnl = this.martingaleData.balance - this.initialBalance;
        const martRoi = ((martPnl / this.initialBalance) * 100).toFixed(2);
        const martMaxWins = this.calculateMaxConsecutive(this.martingaleData.trades, 'win');
        const martMaxLosses = this.calculateMaxConsecutive(this.martingaleData.trades, 'loss');
        const martBestTrade = this.getBestTrade(this.martingaleData.trades);
        const martWorstTrade = this.getWorstTrade(this.martingaleData.trades);

        // Update modal content
        const updates = {
            'statsTotal': totalTrades,
            'statsWinRate': `${winRate}%`,
            'statsWins': winTrades,
            'statsLosses': lossTrades,
            'statsAntiBalance': this.formatCurrency(this.antiMartingaleData.balance),
            'statsAntiPnl': `${antiPnl >= 0 ? '+' : ''}${this.formatPnl(antiPnl)}`,
            'statsAntiRoi': `${antiRoi >= 0 ? '+' : ''}${antiRoi}%`,
            'statsAntiMaxWins': antiMaxWins,
            'statsAntiMaxLosses': antiMaxLosses,
            'statsAntiBestTrade': `${antiBestTrade >= 0 ? '+' : ''}${this.formatPnl(antiBestTrade)}`,
            'statsAntiWorstTrade': `${antiWorstTrade >= 0 ? '+' : ''}${this.formatPnl(antiWorstTrade)}`,
            'statsMartBalance': this.formatCurrency(this.martingaleData.balance),
            'statsMartPnl': `${martPnl >= 0 ? '+' : ''}${this.formatPnl(martPnl)}`,
            'statsMartRoi': `${martRoi >= 0 ? '+' : ''}${martRoi}%`,
            'statsMartMaxWins': martMaxWins,
            'statsMartMaxLosses': martMaxLosses,
            'statsMartBestTrade': `${martBestTrade >= 0 ? '+' : ''}${this.formatPnl(martBestTrade)}`,
            'statsMartWorstTrade': `${martWorstTrade >= 0 ? '+' : ''}${this.formatPnl(martWorstTrade)}`
        };

        Object.keys(updates).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = updates[id];
                
                // Add profit/loss classes
                if (id.includes('Pnl') || id.includes('Roi') || id.includes('Trade')) {
                    element.className = updates[id].startsWith('+') ? 'profit' : 
                                      updates[id].startsWith('-') ? 'loss' : '';
                }
            }
        });

        // Update performance bars
        this.updatePerformanceBars(antiRoi, martRoi);

        // Create equity curve chart
        this.createEquityCurve();

        modal.style.display = 'block';
    }

    getBestTrade(trades) {
        if (trades.length === 0) return 0;
        return Math.max(...trades.map(t => t.pnl));
    }

    getWorstTrade(trades) {
        if (trades.length === 0) return 0;
        return Math.min(...trades.map(t => t.pnl));
    }

    updatePerformanceBars(antiRoi, martRoi) {
        const maxRoi = Math.max(Math.abs(antiRoi), Math.abs(martRoi), 10);
        
        const antiBar = document.getElementById('antiRoiBar');
        const martBar = document.getElementById('martRoiBar');
        const antiValue = document.getElementById('antiRoiValue');
        const martValue = document.getElementById('martRoiValue');
        
        if (antiBar && martBar && antiValue && martValue) {
            const antiWidth = Math.abs(antiRoi) / maxRoi * 100;
            const martWidth = Math.abs(martRoi) / maxRoi * 100;
            
            antiBar.style.width = `${antiWidth}%`;
            martBar.style.width = `${martWidth}%`;
            
            antiValue.textContent = `${antiRoi >= 0 ? '+' : ''}${antiRoi}%`;
            martValue.textContent = `${martRoi >= 0 ? '+' : ''}${martRoi}%`;
            
            antiValue.className = `bar-value ${antiRoi >= 0 ? 'profit' : 'loss'}`;
            martValue.className = `bar-value ${martRoi >= 0 ? 'profit' : 'loss'}`;
        }
    }

    createEquityCurve() {
        const canvas = document.getElementById('equityChart');
        if (!canvas) return;

        // Destroy existing chart if it exists
        if (this.equityChart) {
            this.equityChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        
        // Prepare data for equity curve
        const antiEquityData = this.getEquityData(this.antiMartingaleData.trades);
        const martEquityData = this.getEquityData(this.martingaleData.trades);
        
        const labels = Array.from({length: Math.max(antiEquityData.length, martEquityData.length)}, (_, i) => i);

        this.equityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Anti-Martingale',
                    data: antiEquityData,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }, {
                    label: 'Martingale',
                    data: martEquityData,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Balance Evolution Over Time'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Trade Number'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Balance ($)'
                        },
                        beginAtZero: false
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    getEquityData(trades) {
        const equityData = [this.initialBalance];
        
        trades.forEach(trade => {
            equityData.push(trade.balance);
        });
        
        return equityData;
    }

    calculateMaxConsecutive(trades, resultType) {
        let maxConsecutive = 0;
        let currentConsecutive = 0;

        trades.forEach(trade => {
            if (trade.result === resultType) {
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            } else {
                currentConsecutive = 0;
            }
        });

        return maxConsecutive;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TradingBacktest();
});

// Add some helper functions for better UX
document.addEventListener('DOMContentLoaded', () => {
    // Auto-format entry prices input for crypto precision
    const entryPricesInput = document.getElementById('entryPrices');
    if (entryPricesInput) {
        entryPricesInput.addEventListener('blur', (e) => {
            const value = e.target.value;
            if (value) {
                // Clean up the input format with crypto precision
                const prices = value.split(',').map(price => {
                    const num = parseFloat(price.trim());
                    if (isNaN(num)) return price.trim();
                    
                    // Format based on price range for crypto
                    if (num >= 1) {
                        return num.toFixed(4);
                    } else if (num >= 0.01) {
                        return num.toFixed(6);
                    } else {
                        return num.toFixed(8);
                    }
                });
                e.target.value = prices.join(', ');
            }
        });
    }

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            const form = document.getElementById('tradeForm');
            if (form) {
                form.dispatchEvent(new Event('submit'));
            }
        }
        
        // ESC to close modals
        if (e.key === 'Escape') {
            const tradeModal = document.getElementById('tradeModal');
            const statsModal = document.getElementById('statisticsModal');
            if (tradeModal && tradeModal.style.display === 'block') {
                tradeModal.style.display = 'none';
            }
            if (statsModal && statsModal.style.display === 'block') {
                statsModal.style.display = 'none';
            }
        }
    });
});