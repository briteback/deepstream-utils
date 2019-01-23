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
const DEFAULT_RETRYINTERVAL = 500;
const DEFAULT_RETRYTIMEOUT = 60000;
function sleep(ms) {
    return new Promise((resolve, reject) => setTimeout(resolve, ms));
}
class RpcUtils {
    /**
     * Constructor for the rpc utils
     * @param {Object} client A deepstream client to be used for the requests
     * @param {Object} [options] Additional options
     * @param {Function} [options.audit]
     * @param {Number} [options.retryRPCTimeout]
     * @param {Number} [options.retryRPCInterval]
     */
    constructor(client, options = {}) {
        this.options = options;
        this.audit = options.audit;
        this.client = client;
        this.retryRPCTimeout = (options.retryRPCTimeout || DEFAULT_RETRYTIMEOUT);
        this.retryRPCInterval = (options.retryRPCInterval || DEFAULT_RETRYINTERVAL);
    }
    /**
     * Makes an rpc call
     * @param {String} rpc
     * @param {*} data
     * @returns {Promise} Resolves with rpc data
     */
    make(rpc, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const callStart = Date.now();
            while (callStart + this.retryRPCTimeout > Date.now()) {
                try {
                    return yield this.client.rpc.make(rpc, data);
                }
                catch (error) {
                    if (error !== 'NO_RPC_PROVIDER' || this.retryRPCTimeout === 0) {
                        throw error;
                    }
                }
                yield sleep(this.retryRPCInterval);
            }
            throw 'NO_RPC_PROVIDER';
        });
    }
    /**
     * Provide a rpc
     * @param {String} rpc RPC name
     * @param {function} cb
     * @param {Object} [options] If options and an audit function are specified,
     *                           the audit function will be called with options and rpc data.
     */
    provide(rpc, cb, options) {
        if (options && this.audit) {
            const self = this;
            this.client.rpc.provide(rpc, (data, response) => {
                const send = response.send.bind(response);
                const error = response.error.bind(response);
                response.send = result => {
                    send(result);
                    self.audit({ rpc, data, result, error: false, options });
                };
                response.error = result => {
                    error(result);
                    self.audit({ rpc, data, result, error: true, options });
                };
                cb(data, response);
            });
        }
        else {
            this.client.rpc.provide(rpc, cb);
        }
    }
    /**
     * Unprovide the given rpc
     * @param {String} rpc
     */
    unprovide(rpc) {
        this.client.rpc.unprovide(rpc);
    }
    /**
     * Unprovide all rpcs currently provided by the client
     */
    unprovideAll() {
        const rpcs = this.client.rpc.providers.keys();
        for (const rpc of rpcs) {
            this.unprovide(rpc);
        }
    }
}
exports.default = RpcUtils;
//# sourceMappingURL=rpc.js.map