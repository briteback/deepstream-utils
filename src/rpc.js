class RpcUtils {

  /**
   * Constructor for the rpc utils
   * @param {Object} client A deepstream client to be used for the requests
   */
  constructor(client, options) {
    this.options = options;
    this.client = client;
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
        if (error !== null) reject(error);
        else resolve(result);
      });
    });
  }
}

module.exports = RpcUtils;
