
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
  }).then(() => {
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


class RecordUtils {
  /**
   * Constructor for the record utils
   * @param {Object} client A deepstream client to be used for the requests
   */
  constructor(client, options) {
    this.options = options;
    this.client = client;
    this.setDataCallbacks = new Map();

    /**
     * Get the entries of a list.
     * @param {String} listName
     * @returns {Promise.<Array>}
     */
    this.getEntries = this.snapshot;
  }

  /**
   * Set data on a existing or new record without subscribing.
   * @param {Array} args - First element will contain the record name,
   * second element is a key or object, and if the second element is a
   * key the third element must be the value.
   * @param {Boolean} create - If the given recor name should be created
   * @returns {Promise}
   */
  _setData(args, create) {
    const [recordName] = args;

    return new Promise((resolve, reject) => {
      if (!this.setDataCallbacks.has(recordName)) {
        this.setDataCallbacks.set(recordName, new Set([{ resolve, reject }]));
      } else {
        this.setDataCallbacks.get(recordName).add({ resolve, reject });
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
    }).then(res => {
      if (this.setDataCallbacks.has(recordName)) {
        this.setDataCallbacks.get(recordName).forEach(({ resolve }) => resolve(res));
        this.setDataCallbacks.delete(recordName);
      }
      return res;
    }).catch(error => {
      if (this.setDataCallbacks.has(recordName)) {
        this.setDataCallbacks.get(recordName).forEach(({ reject }) => reject(error));
        this.setDataCallbacks.delete(recordName);
      }
      throw error;
    });
  }

  /**
   * Set data; will NOT create create record!
   * @param {String} recordName
   * @param {Object | String}  data or key
   * @param {Object} [data]
   * @returns {Promise}
   */
  setData(...args) {
    return this._setData(args, false);
  }

  /**
   * Set data; WILL create record!
   * @param {String} recordName
   * @param {Object | String}  data or key
   * @param {Object} [data]
   * @returns {Promise}
   */
  createAndSetData(...args) {
    return this._setData(args, true);
  }

  /**
   * Delete a record
   * @param {String} recordName
   * @returns {Promise}
   */
  delete(recordName) {
    return this.getRecord(recordName)
      .then(record => record.delete());
  }

  /**
   * Checks if a record exists
   * @param {String} recordName
   * @returns {Promise} Resolves a boolean or rejects a error
   */
  has(recordName) {
    return new Promise((resolve, reject) => {
      this.client.record.has(recordName, (error, hasRecord) => {
        if (error) reject(error);
        else resolve(hasRecord);
      });
    });
  }

  /**
   * Get a record, if the record didn't exist it will NOT
   * be created and the promise will be rejected.
   * Option disableHasCheck will disable this behavior and omit the check.
   * @param {String} recordName
   * @returns {Promise} Resolves the record
   * @throws {exception} Throws if record doesn't exist
   */
  getRecord(recordName) {
    if (this.options.disableHasCheck) {
      return this.dsGetRecord(recordName);
    }
    return this.has(recordName)
      .then(hasRecord => {
        if (!hasRecord) {
          throw `No record by that name ${recordName}`;
        }

        return this.dsGetRecord(recordName);
      });
  }

  /**
   * Create a record. Will throw if a record with that name already exists.
   * @param {String} recordName name of the record to be created
   * @returns {Promise} Resolves the created record
   * @throws {exception} Throws if a record with that name already exists
   */
  createRecord(recordName) {
    return this.has(recordName)
      .then(hasRecord => {
        if (hasRecord) {
          throw `Record already exists ${recordName}`;
        }

        return this.dsGetRecord(recordName);
      });
  }

  /**
   * Get the data from a record.
   * @param {String} recordName Name of the record to get a snapshot of
   * @returns {Promise} Resolves the record data or rejects with an error
   */
  snapshot(recordName) {
    return new Promise((resolve, reject) => {
      this.client.record.snapshot(recordName, (error, snapshot) => {
        if (error) reject({ error, recordName });
        else resolve(snapshot);
      });
    });
  }


  /**
   * Create or get a record.
   * @param {String} recordName Name of the record to get or create
   * @returns {Promise} Resolves an object with a created boolean and the record
   */
  getOrCreate(recordName) {
    return this.has(recordName)
      .then(hasRecord =>
            this.dsGetRecord(recordName)
            .then(record => ({
              created: !hasRecord,
              record
            })));
  }

  /**
   * Wraps deepstream getRecord in a promise.
   * @param {Object} client Deepstream client
   * @param {String} recordName Name of the record to get
   * @returns {Promise}
   */
  dsGetRecord(recordName) {
    return new Promise((resolve, reject) => {
      const record = this.client.record.getRecord(recordName);
      record.whenReady(() => resolve(addPromiseSet(record)));
      record.on('error', err => reject(err));
    });
  }


  /**
   *
   * @param {String} recordName
   * @param {Boolean} ignoreWhenReady - If true; will return the list without waiting
   * for when ready else a promise will be returned that resolves when the whenReady
   * callback is called.
   */
  getList(listName, ignoreWhenReady) {
    if (ignoreWhenReady) {
      return this.client.record.getList(listName);
    }
    return new Promise((resolve, reject) => {
      const list = this.client.record.getList(listName);
      list.whenReady(() => resolve(list));
      list.once('error', err => reject(err));
    });
  }

  /**
   * Add the entry to the list and discard.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise}
   */
  addEntry(listName, entry, index) {
    return this.getList(listName)
      .then(list => {
        list.addEntry(entry, index);
        setTimeout(() => list.discard(), 10000);
      });
  }

  /**
   * Remove the entry from the list and discard.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise}
   */
  removeEntry(listName, entry, index) {
    return this.getList(listName)
      .then(list => {
        list.removeEntry(entry, index);
        setTimeout(() => list.discard(), 10000);
      });
  }

  /**
   * Delete the list
   * @param {String} listName
   * @returns {Promise}
   */
  deleteList(listName) {
    return this.getList(listName)
      .then(list => list.delete());
  }

  /**
   * Check if the list includes the given entry.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise.<Boolean>}
   */
  listIncludes(listName, entry) {
    return this.getEntries(listName)
      .then(entries => entries.includes(entry));
  }
}

module.exports = RecordUtils;
