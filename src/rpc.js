const RETRYINTERVAL = 500;
const RETRYTIMEOUT = 60000;

class RpcUtils {
  /**
   * Constructor for the rpc utils
   * @param {Object} client A deepstream client to be used for the requests
   */
  constructor(client, options) {
    this.options = options;
    this.client = client;

    this.retryRPCTimeout = options.retryRPCTimeout === undefined
      ? RETRYTIMEOUT
      : options.retryRPCTimeout;
    this.retryRPCInterval = options.retryRPCInterval || RETRYINTERVAL;
  }

  /**
   * Will retry to call the RPC until retryRPCTimeout is reached or the RPC returns
   * something different than NO_RPC_PROVIDER
   * @param {Function} resolve
   * @param {Function} reject
   * @param {String} rpc
   * @param {Object} data
   * @param {Number} start
   */
  retryRPCMake(resolve, reject, rpc, data, start) {
    setTimeout(() => {
      this.client.rpc.make(rpc, data, (error, result) => {
        if (!error) {
          resolve(result);
        } else if (error === 'NO_RPC_PROVIDER' && Date.now() - start < this.retryRPCTimeout) {
          this.retryRPCMake(resolve, reject, rpc, data, start);
        } else {
          reject(error);
        }
      });
    }, this.retryRPCInterval);
  }

  /**
   * Makes a rpc call
   * @param {String} rpc
   * @param {*} data
   * @returns {Promise} Resolves with rpc data
   */
  make(rpc, data) {
    return new Promise((resolve, reject) => {
      this.client.rpc.make(rpc, data, (error, result) => {
        if (error === null) {
          resolve(result);
        } else if (error === 'NO_RPC_PROVIDER' && this.retryRPCTimeout !== 0) {
          this.retryRPCMake(resolve, reject, rpc, data, Date.now());
        } else {
          reject(error);
        }
      });
    });
  }
}

module.exports = RpcUtils;
