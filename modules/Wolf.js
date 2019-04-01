const binance = require('./binance.js');
const Symbol = require('./Symbol.js');
const Ticker = require('./Ticker.js');
const Queue = require('./Queue.js');
const Watchlist = require('./Watchlist.js');
const logger = require('./Logger.js')('Wolf');
const fs = require('fs');
const assert = require('assert');

module.exports = class Wolf {
    constructor(config) {
        this.config = config;
        this.symbol = null; //meta information about trading pair
        this.ticker = null; //bid/ask prices updated per tick
        this.queue = null; //queue for unfilled transactions
        this.watchlist = null; //orderId --> filledTransactions map; as well as length
        this.state = {
            consuming: false,
            killed: false,
            netSpend: 0,
            paranoid: false,
            profitLockPercentageMet: false, //used for mocha testing
            stopLimitPercentageMet: false,
            get compound() { return this.netSpend <= 0 ? 0 : this.netSpend }
        };
        this.init();
    }

    async init() {

        //get trading pair information
        this.symbol = new Symbol({ tradingPair: this.config.tradingPair });
        await this.symbol.init();

        //setup/start queue
        this.queue = new Queue({ tradingPair: this.config.tradingPair });
        this.queue.init();

        //setup ticker
        const tickerConfig = {
            tradingPair: this.config.tradingPair,
            callbacks: [
                () => this.consume()
            ]
        };
        this.ticker = new Ticker(tickerConfig);

        //setup/start watchlist
        const watchlistConfig = {
            config: this.config,
            state: this.state,
            ticker: this.ticker,
            wolf: this
        };
        this.watchlist = new Watchlist(watchlistConfig);

        //start ticker
        await this.ticker.init();

        //start watchlist
        this.watchlist.init();

        this.hunt();
    }

    //execute W.O.L.F
    hunt() {
        this.purchase();
    }

    static LogStats(stats) {
        const newStats = 'Queue: ' + (Number(stats.queueCount) || 0) + ' Watchlist: ' + (Number(stats.watchCount) || 0);
        logger.info(newStats);
    }

    //digest the queue of open buy/sell orders
    async consume() {
        const state = this.state;
        if (state.killed) return;
        if (state.consuming) return;

        state.consuming = true;
        Wolf.LogStats({ queueCount: this.queue.meta.length, watchCount: this.watchlist.meta.length });
        const filledTransactions = await this.queue.digest();

        //populate watchlist with filled BUY orders and compound ALL filled orders if necessary
        for (let orderId in filledTransactions) {
            const txn = filledTransactions[orderId];
            const side = txn.side;
            const price = Number(txn.price);
            this.compound(side, price);
            if (side === 'BUY') this.watchlist.add(orderId, txn);
            Wolf.LogStats({ queueCount: this.queue.meta.length, watchCount: this.watchlist.meta.length });
            if (!state.stopLimitPercentageMet && side === 'SELL') this.hunt();
        }

        this.watchlist.watch();

        state.consuming = false;
    }

    //calculate quantity of coin to purchase based on given budget from .env
    calculateQuantity() {
        logger.info('Calculating quantity... ');
        const symbol = this.symbol.meta;
        const minQuantity = symbol.minQty;
        const maxQuantity = symbol.maxQty;
        const quantitySigFig = symbol.quantitySigFig;
        const stepSize = symbol.stepSize;  //minimum quantity difference you can trade by
        const currentPrice = this.ticker.meta.ask;
        const budget = this.config.budget + this.state.compound;

        let quantity = minQuantity;
        while (quantity * currentPrice <= budget) quantity += stepSize;
        if (quantity * currentPrice > budget) quantity -= stepSize;
        if (quantity === 0) quantity = minQuantity;

        assert(quantity >= minQuantity && quantity <= maxQuantity, 'invalid quantity');

        logger.info('Quantity Calculated: ' + quantity.toFixed(quantitySigFig));
        return quantity.toFixed(quantitySigFig);
    }

    //push an unfilled limit purchase order to the queue
    async purchase(price) {
        try {
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
            const unconfirmedPurchase = await binance.order(buyOrder);
            this.queue.push(unconfirmedPurchase);
            logger.info('Purchasing... ' + unconfirmedPurchase.symbol);
        } catch(err) {
            console.log('PURCHASE ERROR: ', err);
            return false;
        }
    }

    //push an unfilled limit sell order to the queue
    async sell(quantity, profit) {
        try {
            const symbol = this.symbol.meta;
            const tickSize = symbol.tickSize;  //minimum price difference you can trade by
            const priceSigFig = symbol.priceSigFig;
            const quantitySigFig = symbol.quantitySigFig;
            const sellOrder = {
                symbol: this.config.tradingPair,
                side: 'SELL',
                quantity: quantity.toFixed(quantitySigFig),
                price: profit.toFixed(priceSigFig)
            };
            const unconfirmedSell = await binance.order(sellOrder);
            this.queue.push(unconfirmedSell);
            logger.info('Selling...' + unconfirmedSell.symbol);
        } catch(err) {
            console.log('SELL ERROR: ', err.message);
            return false;
        }
    }

    compound(side, price) {
        if (!this.config.compound) return;
        if (side === 'BUY') this.state.netSpend -= price;
        if (side === 'SELL') this.state.netSpend += price;
        logger.info('Compounding...' + this.state.netSpend);
    }

    async kill() {
        try {
            this.state.killed = true;
            const meta = this.queue.meta;
            const queue = meta.queue;
            const length = meta.length;
            let counter = 0;

            logger.info(`Cancelling ${length} open orders created by W.O.L.F`);
            for (let orderId in queue) {
                const orderToCancel = queue[orderId];
                await binance.cancelOrder({
                    symbol: orderToCancel.symbol,
                    orderId: orderToCancel.orderId
                });
                counter++;
            }
            logger.info(`Cancelled ${counter} opened orders created by W.O.L.F`);

            return true;
        } catch(err) {
            //disregard UNKNOWN_ORDER because the order was executed already; hakuna matata~
            if (err.message === 'UNKNOWN_ORDER') {
                return false;
            }
            console.log('KILL ERROR: ', err.message);
            return false;
        }
    }

};
