require('dotenv').config();
const binance = require('../modules/binance.js');
const Wolf = require('../modules/Wolf');

const config = {
    tradingPair: process.env.TARGET_ASSET + process.env.BASE_ASSET,
    profitPercentage: Number(process.env.PROFIT_PERCENTAGE)/100,
    budget: Number(process.env.BUDGET),
    compound: process.env.COMPOUND.toLowerCase() === "true",
    profitLockPercentage: Number(process.env.PROFIT_LOCK_PERCENTAGE)/100,
    stopLimitPercentage: Number(process.env.STOP_LIMIT_PERCENTAGE)/100
};

describe('testOrder', function() {
    it('should be able to place testOrder', (done) => {
        (async() => {
            try {
                Wolf.prototype.purchase = async () => {
                    const symbol = this.symbol.meta;
                    const tickSize = symbol.tickSize;  //minimum price difference you can trade by
                    const priceSigFig = symbol.priceSigFig;
                    const quantitySigFig = symbol.quantitySigFig;
                    const buyOrder = {
                        symbol: this.config.tradingPair,
                        side: 'BUY',
                        quantity: this.calculateQuantity(),
                        price: (price && price.toFixed(priceSigFig)) || (this.ticker.meta.ask).toFixed(priceSigFig)
                    };
                    const unconfirmedPurchase = await binance.orderTest(buyOrder);
                    this.queue.push(unconfirmedPurchase);
                };
                const wolf = new Wolf(config);
                await wolf.init(false);

                done();
            } catch(err) {
                throw new Error(err);
            }
        })();
    });
});
