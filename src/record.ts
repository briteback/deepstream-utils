const LIST_DISCARD_TIMEOUT = 10000

/**
 * Callback handler for promiseSet. Rejects if there was an error, else resolves.
 * @param {Function} resolve
 * @param {Function} reject
 */
function rejectOnError(resolve, reject) {
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
      this.setWithAck(path, rejectOnError(resolve, reject));
    } else {
      this.setWithAck(path, value, rejectOnError(resolve, reject));
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
  public options: any
  public client: any

  /**
   * Constructor for the record utils
   * @param {Object} client A deepstream client to be used for the requests
   */
  constructor(client, options) {
    this.options = options;
    this.client = client;
  }

  /**
   * Check that the arguments to setData are okay
   * @param {Array} args
   * @returns {Boolean}
   */
  private checkSetDataArgs(args) {
    return [2, 3].includes(args.length)
  }

  /**
   * Set data; will NOT create create record!
   * @param {String} recordName
   * @param {Object | String}  data or key
   * @param {Object} [data]
   * @returns {Promise}
   */
  public async setData(...args) {
    if (!this.checkSetDataArgs(args)) {
      throw Error(`Incorrect arguments given to setData: ${args}`);
    }

    const [recordName] = args
    const hasData = await this.has(recordName)
    if (!hasData) {
      throw Error(`Trying to setData on nonexistent record: ${recordName}`)
    }

    return this.client.record.setDataWithAck(...args);
  }

  /**
   * Set data; WILL create record!
   * @param {String} recordName
   * @param {Object | String}  data or key
   * @param {Object} [data]
   * @returns {Promise}
   */
  public async createAndSetData(...args) {

    if (!this.checkSetDataArgs(args)) {
      throw Error(`Incorrect arguments given to createAndSetData: ${args}`);
    }

    const [recordName] = args
    const hasData = await this.has(recordName)
    if (hasData) {
      throw Error(`Trying to create and setData on existing record: ${recordName}`);
    }

    return this.client.record.setDataWithAck(...args)
  }

  /**
   * Delete a record
   * @param {String} recordName
   * @returns {Promise}
   */
  public async delete(recordName) {
    const record = await this.getRecord(recordName) as { delete: () => Promise<any> }
    return record.delete()
  }

  /**
   * Checks if a record exists
   * @param {String} recordName
   * @returns {Promise} Resolves a boolean or rejects a error
   */
  public has(recordName) {
    return this.client.record.has(recordName)
  }

  /**
   * Get a record, if the record didn't exist it will NOT
   * be created and the promise will be rejected.
   * Option disableHasCheck will disable this behavior and omit the check.
   * @param {String} recordName
   * @returns {Promise} Resolves the record
   * @throws {exception} Throws if record doesn't exist
   */
  public async getRecord(recordName) {
    if (this.options.disableHasCheck) {
      return this.dsGetRecord(recordName);
    }

    const hasRecord = await this.has(recordName)
    if (!hasRecord) {
      throw `No record by that name ${recordName}`
    }
    return this.dsGetRecord(recordName)
  }

  /**
   * Create a record. Will throw if a record with that name already exists.
   * @param {String} recordName name of the record to be created
   * @returns {Promise} Resolves the created record
   * @throws {exception} Throws if a record with that name already exists
   */
  public async createRecord(recordName) {
    const hasRecord = await this.has(recordName)
    if (hasRecord) {
      throw `Record already exists ${recordName}`
    }
    return this.dsGetRecord(recordName)
  }

  /**
   * Get the data from a record.
   * @param {String} recordName Name of the record to get a snapshot of
   * @returns {Promise} Resolves the record data or rejects with an error
   */
  public snapshot(recordName) {
    try {
      return this.client.record.snapshot(recordName)
    } catch (err) {
      err.message = err.message || '';
      err.message += ` recordName: "${recordName}"`;
      throw err;
    }
  }


  /**
   * Create or get a record.
   * @param {String} recordName Name of the record to get or create
   * @returns {Promise} Resolves an object with a created boolean and the record
   */
  public async getOrCreate(recordName) {
    const hasRecord = await this.has(recordName)
    const record = await this.dsGetRecord(recordName)
    return { created: !hasRecord, record }
  }

  /**
   * Wraps deepstream getRecord in a promise.
   * @param {Object} client Deepstream client
   * @param {String} recordName Name of the record to get
   * @returns {Promise}
   */
  public dsGetRecord(recordName) {
    // [1] - This remains a traditional promise because I could not find a
    // suitable way to rewrite `record.on('error', ...)`
    return new Promise((resolve, reject) => {
      const record = this.client.record.getRecord(recordName);

      // In the long run we do not need to add pSet to every record since we can
      // use setData, but pSet was added to provide the same functionality as
      // setData before it existed. Remove when appropriate!
      record.whenReady(() => resolve(addPromiseSet(record)))
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
  public getList(listName, ignoreWhenReady = false) {
    // See [1] as to why this "still" uses `Promise()`
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
   * Get the entries of a list.
   * @param {String} listName
   * @returns {Promise.<Array>}
   */
  public async getEntries(listName) {
    const list = await this.snapshot(listName);
    return Array.isArray(list) ? list : [];
  }

  /**
   * Add the entry to the list and discard.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise}
   */
  public async addEntry(listName, entry, index) {
    const list = await this.getList(listName);
    await new Promise((resolve, reject) => {
      const rejectTimeout = setTimeout(() => reject('TIMEOUT for adding entry'), LIST_DISCARD_TIMEOUT);
      list.addEntry(entry, index, () => {
        clearTimeout(rejectTimeout);
        resolve();
      });
    });
    list.discard();
  }

  /**
   * Remove the entry from the list and discard.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise}
   */
  public async removeEntry(listName, entry, index) {
    const list = await this.getList(listName);
    await new Promise((resolve, reject) => {
      const rejectTimeout = setTimeout(() => reject('TIMEOUT for adding entry'), LIST_DISCARD_TIMEOUT);
      list.removeEntry(entry, index, () => {
        clearTimeout(rejectTimeout);
        resolve();
      });
    });
    list.discard();
  }

  /**
   * Delete the list
   * @param {String} listName
   * @returns {Promise}
   */
  public async deleteList(listName) {
    const list = await this.getList(listName)
    return list.delete()
  }

  /**
   * Check if the list includes the given entry.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise.<Boolean>}
   */
  public async listIncludes(listName, entry) {
    // so for some reason Array.includes is not part of the ES6 standard
    // according to typescript. As far as I can see it is
    // (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes)
    // Therefore we have to coerce this to a weird value...
    const entries = await this.getEntries(listName)
    return entries.includes!(entry)
  }
}

export default RecordUtils
