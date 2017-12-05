import * as axiosDefault from 'axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as qs from 'qs';

/**
 * Just an alias.
 */
const axios = axiosDefault.default;

/**
 * Default configuration.
 */
const defaultConfig = {
    rootUrl: `https://bittrex.com/api`,
    timeout: 3000,
    version: 'v1.1',
};

/**
 * Default HTTP agent configuration.
 */
const defaultAgentConfig = {
    baseURL: defaultConfig.rootUrl,
    headers: {
        'Cache-Control': 'no-cache',
        'Content-Type' : 'application/json',
        'User-Agent'   : `Bittrex API Client (bittrex-cryptoexchange-api node package)`,
    },
    method : 'GET',
    timeout: defaultConfig.timeout,
};

/**
 * The public agent is essentially an alias for the default configuration.
 *
 * @type {{}}
 */
const publicAgentConfig = {
    ...defaultAgentConfig,
};

/**
 * The private agent begins life the same as the public agent, but with 'POST' specified.
 *
 * @type {{method: string}}
 */
const privateAgentConfig = {
    ...defaultAgentConfig,
};

/**
 * The query string object shape.
 */
export interface IQueryParams {
    [key: string]: string | number | boolean;
}

/**
 * This function is exported so that a user can experiment with/understand how HitBTC wants requests to be signed.
 * Essentially, for user edification ;).
 *
 * @param {string} fullPath
 * @param {IQueryParams} queryParams
 * @param {string} secret
 * @returns {string}
 */
export const signMessage = (fullPath: string, queryParams: IQueryParams, secret: string): ISignature => {
    const uri = `${fullPath}?${qs.stringify(queryParams)}`;

    const digest = crypto.createHmac('sha512', secret)
                         .update(uri)
                         .digest('hex');

    return { fullUrl: uri, digest };
};

/**
 * Convenient container for API keys.
 */
export interface IApiAuth {
    publicKey: string;
    privateKey: string;
}

export interface ISignature {
    digest: string;
    fullUrl: string;
}

/**
 * The shape of a Bittrex client.
 */
export interface IRawAgent {
    auth?: IApiAuth;

    isUpgraded(): boolean;

    getPublicEndpoint(endpoint: string, queryParams?: {}): Promise<IBittrexResponse>;

    getPrivateEndpoint(endpoint: string, params?: IQueryParams): Promise<IBittrexResponse>;

    signMessage(fullPath: string, queryParams: IQueryParams, secret: string): ISignature;

    upgrade(newAuth: IApiAuth): void;
}

/**
 * Factory function to get a new Bittrex client.
 *
 * @param {IApiAuth} auth
 * @returns {IBittrexClient}
 */
const getRawAgent = (auth?: IApiAuth): IRawAgent => ({

    /**
     * This holds the user's API keys.
     */
    auth,

    /**
     * Fetches data from public (unauthenticated) endpoints.
     *
     * @param {string} endpoint
     * @param {{}} queryParams
     * @param configOverride
     * @returns {Promise<IBittrexResponse>}
     */
    async getPublicEndpoint(endpoint: string,
                            queryParams?: {},
                            configOverride?: IBittrexRequestConfig): Promise<IBittrexResponse> {

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the publicAgentConfig#baseUrl
        const uri = `${config.version}/${endpoint}?${qs.stringify(queryParams)}`;

        // Construct the actual config to be used
        const agentConfig = { ...publicAgentConfig, url: uri, ...config };

        // Send the request.
        const response = await axios(agentConfig);

        // Finally, return the response
        return Promise.resolve(response);
    },

    /**
     * Checks if the user has supplied API keys.
     *
     * @returns {boolean}
     */
    isUpgraded(): boolean { return this.auth; },

    /**
     * Posts to private (authenticated) endpoints.  If no API keys have been provided, this function will fail.
     *
     * @param {string} endpoint
     * @param params
     * @param configOverride
     * @returns {Promise<IBittrexResponse>}
     */
    async getPrivateEndpoint(endpoint: string,
                             params?: IQueryParams,
                             configOverride?: IBittrexRequestConfig): Promise<IBittrexResponse> {

        // Ensure the user has credentials
        if (!this.isUpgraded()) return Promise.reject(`api keys are required to access private endpoints`);

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the privateAgentConfig baseUrl
        const uri = `${config.rootUrl}/${config.version}/${endpoint}`;

        //tslint:disable:no-magic-numbers
        const securityParams = {
            apiKey: this.auth.publicKey,
            nonce : Date.now() * 1000,
        };
        //tslint:enable:no-magic-numbers

        const scrubbedParams = { ...params, ...securityParams };
        const signatureData  = signMessage(uri, scrubbedParams, this.auth.privateKey);

        const headersOverride = config.headers ? config.headers : null;

        // Add the appropriate private request headers (apisign)
        const headers = {
            ...privateAgentConfig.headers,
            apisign: signatureData.digest,
            ...headersOverride,
        };

        // Construct the actual config to be used
        const agentConfig = { ...privateAgentConfig, headers, url: signatureData.fullUrl, ...config };

        try {
            const response = await axios(agentConfig);

            // Finally, send the request and return the response
            return Promise.resolve(response);
        } catch (err) {
            const rejectionReason = err.response.data.error || err.response.data || err.response || err;

            return Promise.reject(rejectionReason);
        }
    },

    /**
     * Include the exported #signMessage function for convenience.
     */
    signMessage,

    /**
     * Upgrades a client with new credentials.
     *
     * @param {IApiAuth} newAuth
     */
    upgrade(newAuth: IApiAuth): void { this.auth = newAuth; },
});

//<editor-fold desc="request param types"

export type IGetOrderBookParams = {
    market: string;
    type?: string;
};

export type IPlaceOrderParams = {
    market: string;
    quantity: string;
    rate: string;
};

export type IWithdrawCryptoParams = {
    currency: string;
    quantity: string;
    address: string;
    paymentId?: string;
};

//</editor-fold>

export interface IBittrexClient {
    rawAgent: IRawAgent;

    isUpgraded(): boolean;

    upgrade(auth: IApiAuth): void;

    getMarkets(): Promise<IBittrexResponse>;

    getCurrencies(): Promise<IBittrexResponse>;

    getTickerTape(marketSymbol: string): Promise<IBittrexResponse>;

    getMarketSummaries(): Promise<IBittrexResponse>;

    getMarketSummary(marketSymbol: string): Promise<IBittrexResponse>;

    getOrderBook(params: IGetOrderBookParams): Promise<IBittrexResponse>;

    getMarketHistory(marketSymbol: string): Promise<IBittrexResponse>;

//</editor-fold>

//<editor-fold desc="market">

// {id: string}
    placeLimitBuy(params: IPlaceOrderParams): Promise<IBittrexResponse>;

// {id: string}
    placeLimitSell(params: IPlaceOrderParams): Promise<IBittrexResponse> ;

    cancelOrder(id: string): Promise<IBittrexResponse>;

    getOpenOrders(marketSymbol?: string): Promise<IBittrexResponse>;

//</editor-fold>

//<editor-fold desc="accounts">

    getAccountBalances(): Promise<IBittrexResponse>;

    getBalance(currencyId: string): Promise<IBittrexResponse> ;

    getDepositAddress(currencyId: string): Promise<IBittrexResponse>;

// {id:string}
    withdrawCrypto(params: IWithdrawCryptoParams): Promise<IBittrexResponse>;

    getOrder(id: string): Promise<IBittrexResponse> ;

    getOrderHistory(marketSymbol?: string): Promise<IBittrexResponse>;

    getWithdrawalHistory(currencyId?: string): Promise<IBittrexResponse>;

    getDepositHistory(currencyId?: string): Promise<IBittrexResponse>;
}

export const getClient = (auth?: IApiAuth, configOverride: IBittrexRequestConfig = null): IBittrexClient => ({

    rawAgent: getRawAgent(auth),

    isUpgraded(): boolean { return this.rawAgent.isUpgraded(); },

    upgrade(newAuth: IApiAuth): void { this.rawAgent.upgrade(newAuth); },

    //<editor-fold desc="public">

    async getMarkets(): Promise<IBittrexResponse> {
        return this.rawAgent.getPublicEndpoint('public/getmarkets', null, configOverride);
    },

    async getCurrencies(): Promise<IBittrexResponse> {
        return this.rawAgent.getPublicEndpoint('public/getcurrencies', null, configOverride);
    },

    async getTickerTape(marketSymbol: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPublicEndpoint('public/getticker', { market: marketSymbol }, configOverride);
    },

    async getMarketSummaries(): Promise<IBittrexResponse> {
        return this.rawAgent.getPublicEndpoint('public/getmarketsummaries', null, configOverride);
    },

    async getMarketSummary(marketSymbol: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPublicEndpoint('public/getmarketsummary', { market: marketSymbol }, configOverride);
    },

    async getOrderBook(params: IGetOrderBookParams): Promise<IBittrexResponse> {
        const scrubbedParams = {
            ...params,
            type: params.type ? params.type : 'both',
        };

        return this.rawAgent.getPublicEndpoint('public/getorderbook', scrubbedParams, configOverride);
    },

    async getMarketHistory(marketSymbol: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPublicEndpoint('public/getmarkethistory', { market: marketSymbol }, configOverride);
    },

    //</editor-fold>

    //<editor-fold desc="market">

    // {id: string}
    async placeLimitBuy(params: IPlaceOrderParams): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('market/buylimit', params, configOverride);
    },

    // {id: string}
    async placeLimitSell(params: IPlaceOrderParams): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('market/selllimit', params, configOverride);
    },

    async cancelOrder(id: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('market/cancel', { uuid: id }, configOverride);
    },

    async getOpenOrders(marketSymbol?: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('market/getopenorders', { market: marketSymbol }, configOverride);
    },

    //</editor-fold>

    //<editor-fold desc="accounts">

    async getAccountBalances(): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getbalances', null, configOverride);
    },

    async getBalance(currencyId: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getbalance', { currency: currencyId }, configOverride);
    },

    async getDepositAddress(currencyId: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getdepositaddress', { currency: currencyId }, configOverride);
    },

    // {id:string}
    async withdrawCrypto(params: IWithdrawCryptoParams): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/withdraw', params, configOverride);
    },

    async getOrder(id: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getorder', { uuid: id }, configOverride);
    },

    async getOrderHistory(marketSymbol?: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getorderhistory', { market: marketSymbol }, configOverride);
    },

    async getWithdrawalHistory(currencyId?: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getwithdrawalhistory',
            { currency: currencyId },
            configOverride);
    },

    async getDepositHistory(currencyId?: string): Promise<IBittrexResponse> {
        return this.rawAgent.getPrivateEndpoint('account/getdeposithistory', { currency: currencyId }, configOverride);
    },

    //</editor-fold>
});

/**
 * Alias for Axios request options.
 */
export interface IBittrexRequestConfig extends AxiosRequestConfig {}

/**
 * Alias for Axios response.
 */
export interface IBittrexResponse extends AxiosResponse {}
