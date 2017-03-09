"use strict";

module.exports = RecordUtils;

/**
 * Callback handler for promiseSet. Rejects if there was an error, else resolves.
 * @param {Function} resolve
 * @param {Function} reject
 */
function finishWriteAck(resolve, reject) {
  return error => {
    if(error) reject(error);
    else resolve();
  }
}

/**
 * A Promise-wrapped record.set() which resolves after write acknowledgement.
 * @param {String} [path] A path for the value to be set on the record.
 * @param {*} value The value to be set at the path, or an object containing the entire record data to set.
 * @param {Boolean} [discard] Whether or not to discard the record.
 * @returns {Promise}
 */
function promiseSet(path, value, discard) {
  return new Promise((resolve, reject) => {
    if (typeof path === 'object') {
        this.set(path, finishWriteAck(resolve, reject));
        discard = value;
      } else {
        this.set(path, value, finishWriteAck(resolve, reject));
      }
  })
  .then(() => {
    if (discard) {
      this.discard();
    }
    return this;
  })
}

/**
 * Adds a Promise-wrapped record.set() to a Deepstream record, for easy write acknowledgement.
 * @param {Record} record A Deepstream record to add pSet to (modifies record)
 * @returns {Record}
 */
function addPromiseSet(record) {
  record.pSet = promiseSet.bind(record);
  return record;
}

/**
 * Constructor for the record utils
 * @param {Object} client A deepstream client to be used for the requests
 * @param {Function} runAfterInitialize A fuction that should be run before any other functions
 */
function RecordUtils(client, runAfterInitialize, options) {
  this.options = options;
  this.client = client;
  this.runAfterInitialize = runAfterInitialize;
}

/**
 * Checks if a record exists
 * @param {String} recordName
 * @returns {Promise} Resolves a boolean or rejects a error
 */
RecordUtils.prototype.base_has = function(recordName) {
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
 * Option disableHasCheck will disable this behavior and omit the check.
 * @param {String} recordName
 * @returns {Promise} Resolves the record
 * @throws {exception} Throws if record doesn't exist
 */
RecordUtils.prototype.base_getRecord = function(recordName) {
  if (this.options.disableHasCheck) {
    return this.ds_getRecord(this.client, recordName);
  }
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
 * @param {String} recordName name of the record to be created
 * @returns {Promise} Resolves the created record
 * @throws {exception} Throws if a record with that name already exists
 */
RecordUtils.prototype.base_createRecord = function(recordName) {
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
RecordUtils.prototype.base_snapshot = function(recordName) {
  return new Promise((resolve, reject) => {
    this.client.record.snapshot(recordName, (error, snapshot) => {
      if(error) reject({ error, recordName });
      else resolve(snapshot);
    });
  });
};


/**
 * Create or get a record.
 * @param {String} recordName Name of the record to get or create
 * @returns {Promise} Resolves an object with a created boolean and the record
 */
RecordUtils.prototype.base_getOrCreate = function(recordName) {
  return this.base_has(recordName)
    .then(hasRecord =>
          this.ds_getRecord(this.client, recordName)
          .then(record => ({
            created: hasRecord,
            record
          })));
};

/**
 * Wraps deepstream getRecord in a promise.
 * @param {Object} client Deepstream client
 * @param {String} recordName Name of the record to get
 * @returns {Promise}
 */
RecordUtils.prototype.ds_getRecord = function(client, recordName) {
  return new Promise((resolve, reject) => {
    var record = client.record.getRecord(recordName);
    record.whenReady(() => resolve(addPromiseSet(record)));
    record.on('error', err => reject(err));
  });
};


RecordUtils.prototype.has = function(recordName) {
  return this.runAfterInitialize(this.base_has.bind(this), arguments);
};

RecordUtils.prototype.getRecord = function(recordName) {
  return this.runAfterInitialize(this.base_getRecord.bind(this), arguments);
};

RecordUtils.prototype.createRecord = function(recordName) {
  return this.runAfterInitialize(this.base_createRecord.bind(this), arguments);
};

RecordUtils.prototype.snapshot = function(recordName) {
  return this.runAfterInitialize(this.base_snapshot.bind(this), arguments);
};

RecordUtils.prototype.getOrCreate = function(recordName) {
  return this.runAfterInitialize(this.base_getOrCreate.bind(this), arguments);
};
