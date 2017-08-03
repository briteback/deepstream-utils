"use strict";

module.exports = RecordUtils;

/**
 * Callback handler for promiseSet. Rejects if there was an error, else resolves.
 * @param {Function} resolve
 * @param {Function} reject
 */
function finishWriteAck(resolve, reject) {
  return error => {
    if (error) reject(error);
    else resolve();
  };
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
      discard = value;
      this.set(path, finishWriteAck(resolve, reject));
    } else {
      this.set(path, value, finishWriteAck(resolve, reject));
    }
  })
    .then(() => {
      if (discard) {
        this.discard();
      }
      return this;
    });
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
  this.setDataCallbacks = {};
}

/**
 * Set data on a existing or new record without subscribing.
 * @param {Array} args - First element will contain the record name,
 * second element is a key or object, and if the second element is a
 * key the third element must be the value.
 * @param {Boolean} create - If the given recor name should be created
 * @returns {Promise}
 */
RecordUtils.prototype.base_setData = function (args, create) {
  const [recordName] = args;

  return new Promise((resolve, reject) => {
    if (!this.setDataCallbacks[recordName]) {
      this.setDataCallbacks[recordName] = [{ resolve, reject }];
    } else {
      this.setDataCallbacks[recordName].push({ resolve, reject });
    }

    this.client.record.has(recordName, (error, hasRecord) => {
      if (error) {
        return reject(error);
      } else if (!create && !hasRecord) {
        return reject(`Trying to setData on nonexistent record: ${recordName}`);
      } else if (create && hasRecord) {
        return reject(`Trying to create and setData on existing record: ${recordName}`);
      }

      if (args.length === 2) {
        return this.client.record.setData(recordName, args[1], setError => {
          if (error) reject(setError);
          else resolve();
        });
      } else if (args.length === 3) {
        return this.client.record.setData(recordName, args[1], args[2], setError => {
          if (error) reject(setError);
          else resolve();
        });
      }
      return reject(`Incorrect arguments given to setData: ${args}`);
    });
  })
    .then(res => {
      if (this.setDataCallbacks[recordName]) {
        this.setDataCallbacks[recordName].forEach(({ resolve }) => resolve(res));
        delete this.setDataCallbacks[recordName];
      }
      return res;
    })
    .catch(error => {
      if (this.setDataCallbacks[recordName]) {
        this.setDataCallbacks[recordName].forEach(({ reject }) => reject(error));
        delete this.setDataCallbacks[recordName];
      }
      throw error;
    });
};

/**
 * Delete a record
 * @param {String} recordName
 * @returns {Promise}
 */
RecordUtils.prototype.base_delete = function (recordName) {
  return this.base_getRecord(recordName)
    .then(record => record.delete());
};

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


/**
 *
 * @param {String} recordName
 * @param {Boolean} ignoreWhenReady - If true; will return the list without waiting
 * for when ready else a promise will be returned that resolves when the whenReady
 * callback is called.
 */
RecordUtils.prototype.getList = function (listName, ignoreWhenReady) {
  if (ignoreWhenReady) {
    return this.client.record.getList(listName);
  }
  return new Promise((resolve, reject) => {
    const list = this.client.record.getList(listName);
    list.whenReady(() => resolve(list));
    list.once('error', err => reject(err));
  });
};

/**
 * Add the entry to the list and discard.
 * @param {String} listName
 * @param {String} entry
 */
RecordUtils.prototype.addEntry = function (listName, entry, index) {
  const list = this.client.record.getList(listName);
  list.addEntry(entry, index);
  list.discard();
};

/**
 * Remove the entry from the list and discard.
 * @param {String} listName
 * @param {String} entry
 */
RecordUtils.prototype.removeEntry = function (listName, entry, index) {
  const list = this.client.record.getList(listName);
  list.removeEntry(entry, index);
  list.discard();
};

/**
 *
 * @param {String} listName
 */
RecordUtils.prototype.deleteList = function (listName) {
  this.client.record.getList(listName)
    .then(list => list.delete());
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

RecordUtils.prototype.setData = function (...args) {
  return this.runAfterInitialize(this.base_setData.bind(this), [args, false]);
};

RecordUtils.prototype.createAndSetData = function (...args) {
  return this.runAfterInitialize(this.base_setData.bind(this), [args, true]);
};

RecordUtils.prototype.delete = function (...args) {
  return this.runAfterInitialize(this.base_delete.bind(this), args);
};
