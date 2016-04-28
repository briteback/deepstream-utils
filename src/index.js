"use strict";

var deepstreamClient = require('deepstream.io-client-js');

module.exports = deepstreamUtils;

/**
 * Constructor for the deepstream utils functions
 * @param {Object} options
 * @param {String} options.host Url for the client
 * @param {Object} options.clientOptions Options for the client
 * @param {Object} options.authParams Authentication parameters for the client on login
 */
function deepstreamUtils(options) {
  this.options = options;
  this.client = deepstreamClient(this.options.host, this.options.clientOptions);
  this.hasInitialized = false;
}

/**
 * Initiate the client and login
 * @returns {Promise} Resolves when the client has logged in
 */
deepstreamUtils.prototype.initClient = function() {
  if(!this.loginPromise) {
    this.loginPromise = this.login(this.options.authParams);

    this.client.on('error', error => {
      console.error('Deepstream client error:', error);
    });
  }

  return this.loginPromise;
};

/**
 * Wraps the deepstream client login function in a promise
 * @param {Object} authParams
 * @returns {Promise} Resolves when the client has logged in
 */
deepstreamUtils.prototype.login = function(authParams) {
  return new Promise((resolve, reject) => {
    this.client.login(authParams, (success, errorCode, loginData) => {
      if(!success) {
        return reject({ code: errorCode, message: loginData});
      }
      else {
        return resolve(loginData);
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
deepstreamUtils.prototype.runAfterInitialize = function(fn, args) {
  if(this.hasInitialized) {
    return fn.apply(this, args);
  }
  else {
    return this.loginPromise
      .then(() => fn.apply(this, args));
  }
};

/**
 * Checks if a record exists
 * @param {String} recordName
 * @returns {Promise} Resolves a boolean or rejects a error
 */
deepstreamUtils.prototype.base_has = function(recordName) {
  return new Promise((resolve, reject) => {
    this.client.record.has(recordName, (error, hasRecord) => {
      if(error) reject(error);
      else resolve(hasRecord);
    });
  });
};

/**
 * Get a record, if the record didn't exist it will NOT
 * be created and the promise will be rejected.
 * @param {String} recordName
 * @returns {Promise} Resolves the record
 * @throws {exception} Throws if record doesn't exist
 */
deepstreamUtils.prototype.base_getRecord = function(recordName) {
  return this.base_has(recordName)
    .then(hasRecord => {
      if(!hasRecord) {
        throw 'No record by that name ' + recordName;
      }

      return this.ds_getRecord(this.client, recordName);
    });
};

/**
 * Create a record. Will throw if a record with that name already exists.
 *
 * @param {String} recordName name of the record to be created
 * @returns {Promise} Resolves the created record
 * @throws {exception} Throws if a record with that name already exists
 */
deepstreamUtils.prototype.base_createRecord = function(recordName) {
  return this.base_has(recordName)
    .then(hasRecord => {
      if(hasRecord) {
        throw 'Record already exists ' + recordName;
      }

      return this.ds_getRecord(this.client, recordName);
    });
};

/**
 * Get the data from a record.
 * @param {String} recordName Name of the record to get a snapshot of
 * @returns {Promise} Resolves the record data or rejects with an error
 */
deepstreamUtils.prototype.base_snapshot = function(recordName) {
  return new Promise((resolve, reject) => {
    this.client.record.snapshot(recordName, (error, snapshot) => {
      if(error) reject(error);
      else resolve(snapshot);
    });
  });
};

/**
 * Wraps deepstream getRecord in a promise.
 * @param {Object} client Deepstream client
 * @param {String} recordName Name of the record to get
 * @returns {Promise}
 */
deepstreamUtils.prototype.ds_getRecord = function(client, recordName) {
  return new Promise((resolve, reject) => {
    var record = client.record.getRecord(recordName);
    record.whenReady(() => resolve(record));
  });
};

deepstreamUtils.prototype.has = function(recordName) {
  return this.runAfterInitialize(this.base_has, arguments);
};

deepstreamUtils.prototype.getRecord = function(recordName) {
  return this.runAfterInitialize(this.base_getRecord, arguments);
};

deepstreamUtils.prototype.getRecords = function(recordName) {
  return this.runAfterInitialize(this.base_getRecords, arguments);
};

deepstreamUtils.prototype.createRecord = function(recordName) {
  return this.runAfterInitialize(this.base_createRecord, arguments);
};

deepstreamUtils.prototype.snapshot = function(recordName) {
  return this.runAfterInitialize(this.base_snapshot, arguments);
};
