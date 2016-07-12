"use strict";

var deepstreamClient = require('deepstream.io-client-js');
var RecordUtils = require('./record');
var RpcUtils = require('./rpc');

module.exports = DeepstreamUtils;

/**
 * Constructor for the deepstream utilsb
 * @param {Object} options
 * @param {String} options.host Url for the client
 * @param {Object} options.clientOptions Options for the client
 * @param {Object} options.authParams Authentication parameters for the client on login
 */
function DeepstreamUtils(options) {
  this.options = options;
  this.client = null;
  this.hasInitialized = false;

  this.record = new RecordUtils(this.client, this.runAfterInitialize.bind(this));
  this.rpc = new RpcUtils(this.client, this.runAfterInitialize.bind(this));
}

/**
 * Initiate the client and login
 * @returns {Promise} Resolves when the client has logged in
 */
DeepstreamUtils.prototype.initClient = function() {
  this.client = deepstreamClient(this.options.host, this.options.clientOptions);
  // TODO: this should be done better...
  this.record.client = this.client;
  this.rpc.client = this.client;

  this.client.on('error', error => {
    console.error('Deepstream client error:', error);
  });
  return this.client;
};

/**
 * The first time this function is called it runs login on
 * the client and after that it returns the same Promise.
 * @returns {Promise}
 */
DeepstreamUtils.prototype.login = function() {
  if(!this.loginPromise) {
    this.loginPromise = this.base_login(this.options.authParams)
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
};

/**
 * Wraps the deepstream client login function in a promise
 * @param {Object} client A deepstream client
 * @param {Object} [authParams] Optional parameters for the login
 * @returns {Promise}
 */
function base_login(client, authParams) {
  return new Promise((resolve, reject) => {
    client.login(authParams, (success, data) => {
      if(!success) {
        return reject({ code: 0, message: data});
      }
      else {
        return resolve(data);
      }
    });
  });
};

/**
 * Wraps the deepstream client login function in a promise
 * @param {Object} authParams
 * @returns {Promise} Resolves when the client has logged in
 */
DeepstreamUtils.prototype.base_login = function(authParams) {
  return new Promise((resolve, reject) => {
    this.client.login(authParams, (success, data) => {
      if(!success) {
        return reject({ code: 0, message: data});
      }
      else {
        return resolve(data);
      }
    });
  });
};

/**
 * Runs a function after the client has finished it's initialization
 * @param {Function} fn Function to run after the client has initialized
 * @param {Arguments} args The arguments for the funcion
 * @returns {Promise}
 */
DeepstreamUtils.prototype.runAfterInitialize = function(fn, args) {
  if(this.hasInitialized) {
    return fn.apply(this, args);
  }
  else {
    return this.loginPromise
      .then(() => fn.apply(this, args));
  }
};
