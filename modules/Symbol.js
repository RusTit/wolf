const binance = require('./binance.js');
const logger = require('./Logger')('Symbol');
/*

<--- Wolf.js --->

const Symbol = require('./Symbol.js');

init() {
    const symbolConfig = {
        tradingPair: this.config.tradingPair,
    };
    const symbol = new Symbol(symbolConfig);
    this.symbol = await ticker.init();
    console.log(this.symbol.meta.minPrice);
}

*/

module.exports = class Symbol {
    constructor(config) {
        this.tradingPair = config.tradingPair;
        this.meta = {};
    }

    async init() {
        try {
            const exchangeInfo = await binance.exchangeInfo();
            const symbol = exchangeInfo.symbols.find(symbol => symbol.symbol === this.tradingPair);
            if (symbol) {
                this.meta = Object.assign(this.getters(), symbol);
                this.meta.prototype.filterByType = (filterType) => {
                    return this.filters.find(filter => filter.filterType === filterType);
                }
            } else {
                logger.warn(`Trading Pair (${this.tradingPair}) wasn't found in exchange info`);
            }
            return true;
        } catch(err) {
            logger.warn(`SYMBOL ERROR: ${err.message}`);
            return false;
        }
    }

    getters() {
        return {
            get minPrice() { return Number(this.filterByType('PRICE_FILTER').minPrice) },
            get maxPrice() { return Number(this.filterByType('PRICE_FILTER').maxPrice) },
            get tickSize() { return Number(this.filterByType('PRICE_FILTER').tickSize) },
            get minQty() { return Number(this.filterByType('LOT_SIZE').minQty) },
            get maxQty() { return Number(this.filterByType('LOT_SIZE').maxQty) },
            get stepSize() { return Number(this.filterByType('LOT_SIZE').stepSize) },
            get priceSigFig() { return Number(this.filterByType('PRICE_FILTER').tickSize.indexOf('1') - 1) },
            get quantitySigFig() {
                const sf = Number(this.filterByType('LOT_SIZE').stepSize.indexOf('1') - 1);
                return sf >= 0 ? sf : 0;
            },
            get minNotional() { return Number(this.filterByType('MIN_NOTIONAL').minNotional) }
        }
    }
};
