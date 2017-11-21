const { deepstream } = require('deepstream.io-client-js');
const RecordUtils = require('./record');
const RpcUtils = require('./rpc');

class DeepstreamUtils {

  /**
   * Constructor for the deepstream utilsb
   * @param {Object} options
   * @param {String} options.host Url for the client
   * @param {Object} options.clientOptions Options for the client
   * @param {Object} options.authParams Authentication parameters for the client on login
   * @param {Object} options.disableHasCheck Dont check if record exists in getRecord
   */
  constructor(options) {
    this.options = options;
    this.client = null;
    this.hasInitialized = false;

    this.record = new RecordUtils(this.client, options);
    this.rpc = new RpcUtils(this.client, options);
  }

  /**
   * Initiate the client and login
   * @returns {Promise} Resolves when the client has logged in
   */
  initClient() {
    this.client = deepstream(this.options.host, this.options.clientOptions);
    // TODO: this should be done better...
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
    if (!this.loginPromise) {
      this.loginPromise = this.baseLogin(this.options.authParams)
        .then(loginData => {
          this.hasInitialized = true;
          return loginData;
        })
        .catch(error => {
          this.loginPromise = null;
          throw error;
        });
    }
    return this.loginPromise;
  }

  /**
   * Close (logout) the client
   * @returns {Promise}
   */
  close() {
    if (this.loginPromise) {
      return this.loginPromise
        .catch(error => {
          console.error('Error with loginPromise on close', error);
        })
        .then(() => {
          this.client.close();
          this.loginPromise = null;
        });
    }
    return Promise.resolve();
  }


  /**
   * Wraps the deepstream client login function in a promise
   * @param {Object} authParams
   * @returns {Promise} Resolves when the client has logged in
   */
  baseLogin(authParams) {
    return new Promise((resolve, reject) => {
      this.client.login(authParams, (success, data) => {
        if (!success) {
          return reject({ code: 0, message: data });
        }
        return resolve(data);
      });
    });
  }
}

DeepstreamUtils.MERGE_STRATEGIES = deepstream.MERGE_STRATEGIES;
module.exports = deepstream;
