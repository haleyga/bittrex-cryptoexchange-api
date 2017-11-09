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
    rootUrl: `https://api.gemini.com`,
    timeout: 10000,
    version: 'v1',
};

/**
 * Default HTTP agent configuration.
 */
const defaultAgentConfig = {
    baseURL: defaultConfig.rootUrl,
    headers: {
        'Cache-Control' : 'no-cache',
        'Content-Length': 0,
        'Content-Type'  : 'text/plain',
        'User-Agent'    : `Gemini API Client (gemini-api node package)`,
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
    method: 'POST',
};

/**
 * The post body shape.
 */
export interface IPostBody {
    [key: string]: string | number;
}

/**
 * This function is exported so that a user can experiment with/understand how Gemini wants requests to be signed.
 * Essentially, for user edification ;).
 *
 * @param {string} path
 * @param {{}} postData
 * @param {string} secret
 * @returns {ISignature}
 */
export const signMessage = (path: string, postData: {}, secret: string): ISignature => {
    const nonce = Date.now().toString();

    const body    = { ...postData, nonce, request: path };
    const payload = new Buffer(JSON.stringify(body)).toString('base64');
    const digest  = crypto.createHmac('sha384', secret)
                          .update(payload)
                          .digest('hex');

    return { payload, digest };
};

export interface ISignature {
    digest: string;
    payload: string;
}

/**
 * Convenient container for API keys.
 */
export interface IApiAuth {
    publicKey: string;
    privateKey: string;
}

/**
 * The shape of a Gemini client.
 */
export interface IGeminiClient {
    auth?: IApiAuth;

    isUpgraded(): boolean;

    getPublicEndpoint(endpoint: string, queryParams?: {}): Promise<IGeminiResponse>;

    postToPrivateEndpoint(endpoint: string, data?: IPostBody): Promise<IGeminiResponse>;

    signMessage(privateKey: string, path: string, method: string, body?: {}): ISignature;

    upgrade(newAuth: IApiAuth): void;
}

/**
 * Factory function to get a new GDAX client.
 *
 * @param {IApiAuth} auth
 * @returns {IGeminiClient}
 */
export const getClient = (auth?: IApiAuth): IGeminiClient => ({

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
     * @returns {Promise<IGeminiResponse>}
     */
    async getPublicEndpoint(endpoint: string,
                            queryParams?: {},
                            configOverride?: IBitfinexRequestConfig): Promise<IGeminiResponse> {

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the publicAgentConfig#baseUrl
        const uri = `${config.version}/${endpoint}?${qs.stringify(queryParams)}`;

        // Construct the actual config to be used
        const agentConfig = { ...publicAgentConfig, url: uri };

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
     * @param {IPostBody} data
     * @param configOverride
     * @returns {Promise<IGeminiResponse>}
     */
    async postToPrivateEndpoint(endpoint: string,
                                data?: IPostBody,
                                configOverride?: IBitfinexRequestConfig): Promise<IGeminiResponse> {

        // Ensure the user has credentials
        if (!this.isUpgraded()) return Promise.reject(`api keys are required to access private endpoints`);

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the privateAgentConfig,baseUrl
        const uri = `/${config.version}/${endpoint}`;

        const signatureData = signMessage(uri, data, this.auth.privateKey);

        // Add the appropriate POST request headers (Key and Sign)
        const headers = {
            ...privateAgentConfig.headers,
            'X-GEMINI-APIKEY'   : this.auth.publicKey,
            'X-GEMINI-PAYLOAD'  : signatureData.payload,
            'X-GEMINI-SIGNATURE': signatureData.digest,
        };

        // Construct the actual config to be used
        const agentConfig = { ...privateAgentConfig, headers, url: uri, data: JSON.stringify(data) };

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

/**
 * Alias for Axios request options.
 */
export interface IBitfinexRequestConfig extends AxiosRequestConfig {}

/**
 * Alias for Axios response.
 */
export interface IGeminiResponse extends AxiosResponse {}
