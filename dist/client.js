"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const deepstream_io_client_js_1 = require("deepstream.io-client-js");
const record_1 = require("./record");
const rpc_1 = require("./rpc");
class DeepstreamUtils {
    /**
     * Constructor for the deepstream utils
     * @param {Object} options
     * @param {String} options.host Url for the client
     * @param {Object} options.clientOptions Options for the client
     * @param {Object} options.authParams Authentication parameters for the client on login
     * @param {Object} options.disableHasCheck Dont check if record exists in getRecord
     */
    constructor(options) {
        this.options = options;
        this.client = null;
        this._hasInitialized = false;
        this._loginPromise = null;
        this.record = new record_1.default(this.client, options);
        this.rpc = new rpc_1.default(this.client, options);
    }
    /**
     * Initiate the client and login
     * @returns {Promise} Resolves when the client has logged in
     */
    initClient() {
        this.client = deepstream_io_client_js_1.default(this.options.host, this.options.clientOptions);
        this.record.client = this.client;
        this.rpc.client = this.client;
        this.client.on('error', (error, event, topic) => {
            console.error('Deepstream client error:', { error, event, topic });
        });
        return this.client;
    }
    /**
     * The first time this function is called it runs login on
     * the client and after that it returns the same Promise.
     * @returns {Promise}
     */
    login() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._loginPromise) {
                return this._loginPromise;
            }
            try {
                this._loginPromise = this.client.login(this.options.authParams);
                const loginData = yield this._loginPromise;
                this._hasInitialized = true;
                return loginData;
            }
            catch (err) {
                this._loginPromise = null;
                throw err;
            }
        });
    }
    get hasInitialized() {
        return this._hasInitialized;
    }
    /**
     * Close (logout) the client
     * @returns {Promise}
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._loginPromise) {
                return;
            }
            try {
                // Make sure that if we have the login promise we are logged in, because
                // we might throw an error with it.
                yield this._loginPromise;
                this.client.close();
                this._loginPromise = null;
            }
            catch (err) {
                console.error('Error with loginPromise on close', err);
            }
        });
    }
}
DeepstreamUtils.MERGE_STRATEGIES = deepstream_io_client_js_1.default.MERGE_STRATEGIES;
exports.default = DeepstreamUtils;
//# sourceMappingURL=client.js.map