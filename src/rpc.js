"use strict";

module.exports = RpcUtils;

/**
 * Constructor for the rpc utils
 * @param {Object} client A deepstream client to be used for the requests
 * @param {Function} runAfterInitialize A fuction that should be run before any other functions
 */
function RpcUtils(client, runAfterInitialize, options) {
  this.options = options;
  this.client = client;
  this.runAfterInitialize = runAfterInitialize;
}

/**
 * Makes a rpc call
 * @param {String} rpc
 * @param {*} data
 * @returns {Promise} Resolves with rpc data
 */
RpcUtils.prototype.base_make = function(rpc, data) {
  return new Promise((resolve, reject) => {
    this.client.rpc.make(rpc, data, (error, result) => {
      if (error !== null) reject(error);
      else resolve(result);
    });
  });
};

RpcUtils.prototype.make = function(recordName) {
  return this.runAfterInitialize(this.base_make.bind(this), arguments);
};
