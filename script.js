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
        const entryPricesInput = document.getElementById('entryPrices');
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTrade();
        });
        
        resetBtn.addEventListener('click', () => {
            this.resetData();
        });

        // Update DCA summary when entry prices change
        entryPricesInput.addEventListener('input', () => {
            this.updateDcaSummary();
        });

        // Modal event listeners
        this.initializeModal();
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

    updateDcaSummary() {
        const entryPricesStr = document.getElementById('entryPrices').value;
        const summaryDiv = document.getElementById('dcaSummary');
        
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
        document.getElementById('sizePerLevel').textContent = this.formatCurrency(sizePerLevel);
        document.getElementById('totalSize').textContent = this.formatCurrency(totalSize);
        
        summaryDiv.style.display = 'block';
    }

    addTrade() {
        const tradeType = document.getElementById('tradeType').value;
        const entryPricesStr = document.getElementById('entryPrices').value;
        const exitPrice = parseFloat(document.getElementById('exitPrice').value);
        const result = document.getElementById('result').value;

        // Parse entry prices for DCA
        const entryPrices = entryPricesStr.split(',').map(price => parseFloat(price.trim()));
        
        if (entryPrices.some(price => isNaN(price)) || isNaN(exitPrice)) {
            alert('Vui lòng nhập giá hợp lệ!');
            return;
        }

        // Calculate average entry price for DCA
        const avgEntryPrice = entryPrices.reduce((sum, price) => sum + price, 0) / entryPrices.length;

        // Process trade for both strategies
        this.processTrade('antiMartingale', tradeType, avgEntryPrice, exitPrice, result, entryPrices);
        this.processTrade('martingale', tradeType, avgEntryPrice, exitPrice, result, entryPrices);

        this.updateDisplay();
        this.saveToStorage();
        this.clearForm();
    }

    processTrade(strategy, tradeType, entryPrice, exitPrice, result, entryPrices) {
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
        
        // Apply leverage effect
        pnlPercent *= this.leverage;
        
        // Apply DCA effect (more levels = distributed risk)
        const dcaMultiplier = 1 / entryPrices.length;
        pnlPercent *= dcaMultiplier;
        
        const pnlAmount = (positionSize * pnlPercent) / 100;
        const newBalance = data.balance + pnlAmount;

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
        return `$${amount.toFixed(2)}`;
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
            row.className = 'trade-row';
            row.dataset.tradeId = trade.id;
            row.dataset.strategy = strategy;
            
            row.innerHTML = `
                <td>${trade.id}</td>
                <td>${trade.type.toUpperCase()}</td>
                <td>${this.formatPrice(trade.entryPrice)}</td>
                <td>${this.formatPrice(trade.exitPrice)}</td>
                <td>${this.formatCurrency(trade.positionSize).replace('$', '')}</td>
                <td class="${trade.pnl >= 0 ? 'profit' : 'loss'}">
                    ${trade.pnl >= 0 ? '+' : ''}${this.formatCurrency(trade.pnl).replace('$', '')}
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
            'modalPositionSize': this.formatCurrency(trade.positionSize),
            'modalPnl': `${trade.pnl >= 0 ? '+' : ''}${this.formatCurrency(trade.pnl)}`,
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
        if (confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) {
            const data = strategy === 'antiMartingale' ? this.antiMartingaleData : this.martingaleData;
            
            // Find the trade to get its details
            const tradeIndex = data.trades.findIndex(t => t.id === tradeId);
            if (tradeIndex === -1) return;
            
            const trade = data.trades[tradeIndex];
            
            // Recalculate balances by reversing the trade effect
            if (strategy === 'antiMartingale') {
                this.antiMartingaleData.balance -= trade.pnl;
                
                // Update consecutive counters
                if (trade.result === 'win') {
                    this.antiMartingaleData.consecutiveWins = Math.max(0, this.antiMartingaleData.consecutiveWins - 1);
                } else {
                    this.antiMartingaleData.consecutiveLosses = Math.max(0, this.antiMartingaleData.consecutiveLosses - 1);
                }
            } else {
                this.martingaleData.balance -= trade.pnl;
                
                // Update consecutive counters
                if (trade.result === 'win') {
                    this.martingaleData.consecutiveWins = Math.max(0, this.martingaleData.consecutiveWins - 1);
                } else {
                    this.martingaleData.consecutiveLosses = Math.max(0, this.martingaleData.consecutiveLosses - 1);
                }
            }
            
            // Remove the trade
            data.trades.splice(tradeIndex, 1);
            
            // Recalculate all subsequent trades if needed
            this.recalculateSubsequentTrades(strategy, tradeIndex);
            
            this.updateDisplay();
            this.saveToStorage();
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
            
            // Apply leverage and DCA effects
            pnlPercent *= this.leverage;
            const dcaMultiplier = 1 / trade.entryPrices.length;
            pnlPercent *= dcaMultiplier;
            
            trade.pnl = (trade.positionSize * pnlPercent) / 100;
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
                }
                if (data.martingale) {
                    this.martingaleData = data.martingale;
                }
            } catch (error) {
                console.error('Error loading data from storage:', error);
            }
        }
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
        
        // ESC to close modal
        if (e.key === 'Escape') {
            const modal = document.getElementById('tradeModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }
    });
});