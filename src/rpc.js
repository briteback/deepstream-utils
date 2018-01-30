const RETRYINTERVAL = 500;
const RETRYTIMEOUT = 60000;

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

  /**
   * Provide a rpc
   * @param {String} rpc RPC name
   * @param {function} cb
   * @param {Object} [options] If options and an audit function are specified,
   *                           the audit function will be called with options and rpc data.
   */
  provide(rpc, cb, options) {
    if (options && this.audit) {
      this.client.rpc.provide(rpc, async (data, response) => {
        const send = response.send.bind(response);
        const error = response.error.bind(response);

        response.send = async result => {
          send(result);
          await this.audit({ rpc, data, result, error: false, options });
          console.log('DONE!!');
        };
        response.error = result => {
          error(result);
          this.audit({ rpc, data, result, error: true, options });
        };
        cb(data, response);
      });
    } else {
      this.client.rpc.provide(rpc, cb);
    }
  }
}

module.exports = RpcUtils;
