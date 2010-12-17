// ==========================================================================
// Project:   The M-Project - Mobile HTML5 Application Framework
// Copyright: (c) 2010 M-Way Solutions GmbH. All rights reserved.
// Creator:   Sebastian
// Date:      18.11.2010
// License:   Dual licensed under the MIT or GPL Version 2 licenses.
//            http://github.com/mwaylabs/The-M-Project/blob/master/MIT-LICENSE
//            http://github.com/mwaylabs/The-M-Project/blob/master/GPL-LICENSE
// ==========================================================================

m_require('core/detox/data_provider.js');

/**
 * @class
 *
 * Encapsulates access to WebSQL (in-browser sqlite storage). All CRUD operations are asynchronous. That means that onSuccess
 * and onError callbacks have to be passed to the function calls to have the result returned when operation finished.
 *
 * WebSQL Error Codes (see e.g. http://www.w3.org/TR/webdatabase/):
 *
 * Constant         Code    Situation
 * --------         ----    ---------
 * UNKNOWN_ERR      0       The transaction failed for reasons unrelated to the database itself and not covered by any other error code.
 * DATABASE_ERR     1       The statement failed for database reasons not covered by any other error code.
 * VERSION_ERR      2       The operation failed because the actual database version was not what it should be. For example, a statement found that the actual database version no longer matched the expected version of the Database or DatabaseSync object, or the Database.changeVersion() or DatabaseSync.changeVersion() methods were passed a version that doesn't match the actual database version.
 * TOO_LARGE_ERR    3       The statement failed because the data returned from the database was too large. The SQL "LIMIT" modifier might be useful to reduce the size of the result set.
 * QUOTA_ERR        4       The statement failed because there was not enough remaining storage space, or the storage quota was reached and the user declined to give more space to the database.
 * SYNTAX_ERR       5       The statement failed because of a syntax error, or the number of arguments did not match the number of ? placeholders in the statement, or the statement tried to use a statement that is not allowed, such as BEGIN, COMMIT, or ROLLBACK, or the statement tried to use a verb that could modify the database but the transaction was read-only.
 * CONSTRAINT_ERR   6       An INSERT, UPDATE, or REPLACE statement failed due to a constraint failure. For example, because a row was being inserted and the value given for the primary key column duplicated the value of an existing row.
 * TIMEOUT_ERR      7       A lock for the transaction could not be obtained in a reasonable time.
 *
 * @extends M.DataProvider
 */
M.WebSqlProvider = M.DataProvider.extend(
/** @scope M.WebSqlProvider.prototype */ {

    /**
     * The type of this object.
     * @type String
     */
    type: 'M.WebSqlProvider',

    /**
     * Configuration object
     * @type Object
     */
    config: {},

    /**
     * Is set to YES when initialization ran successfully, means when {@link M.WebSqlProvider#init} was called, db and table created. 
     * @type Boolean
     */
    isInitialized: NO,

    /**
     * Object containing all rules for mapping JavaScript data types to SQLite data types.
     * @type Object
     */
    typeMapping: {
        'String': 'varchar(255)',
        'Text': 'text',
        'Float': 'float',
        'Integer': 'integer',
        'Number': 'integer',
        'Reference': 'integer',
        'Date': 'varchar(255)',
        'Boolean': 'boolean'
    },

    /**
     * Is set when database "opened". Acts as handler for all db operations => transactions, queries, etc.
     * @type Object
     */
    dbHandler: null,

    /**
     * Saves the internal callback function. Is needed when provider/db is not initialized and init() must be executed first to have the return point again after
     * initialization. 
     * @type Function
     */
    internalCallback: null,

    /**
     * Used internally. External callback for success case. 
     * @private
     */
    onSuccess: null,

    /**
     * Used internally. External callback for error case.
     * @private
     */
    onError: null,

    /**
     * Opens a database and creates the appropriate table for the model record.
     * 
     * @param {Object} obj The param obj, includes model. Not used here, just passed through.
     * @param {Function} callback The function that called init as callback bind to this.
     * @private
     */
    init: function(obj, callback) {
        if(!this.internalCallback) {
            this.internalCallback = callback;
        }
        this.openDb();
        this.createTable(obj, callback);
    },

    /*
    * CRUD methods
    */

    /**
     * Saves a model in the database. Constructs the sql query from the model record. Prepares an INSERT or UPDATE depending on the state
     * of the model. If M.STATE_NEW then prepares an INSERT, if M.STATE_VALID then prepares an UPDATE. The operation itself
     * is done by {@link M.WebSqlProvider#performOp} that is called
     *
     * @param {Object} obj The param obj, includes:
     * * onSuccess callback
     * * onError callback
     * * the model
     */
     save: function(obj) {
        //console.log('save() called.');

        this.onSuccess = obj.onSuccess;
        this.onError = obj.onError;

        /**
         * if not already done, initialize db/table first
         */
        if(!this.isInitialized) {
            this.internalCallback = this.save;
            this.init(obj);
            return;
        }


        if(obj.model.state === M.STATE_NEW) { // perform an INSERT

            var sql = 'INSERT INTO ' + obj.model.name + ' (';
            for(var prop in obj.model.record) {
                sql += prop + ', ';
            }

            /* now name m_id column */
            sql += M.META_M_ID + ') ';

            //sql = sql.substring(0, sql.lastIndexOf(',')) + ') ';

            /* VALUES(12, 'Test', ... ) */
            sql += 'VALUES (';

            for(var prop2 in obj.model.record) {
                /* if property is string or text write value in quotes */
                var pre_suffix = obj.model.__meta[prop2].dataType === 'String' || obj.model.__meta[prop2].dataType === 'Text' || obj.model.__meta[prop2].dataType === 'Date' ? '"' : '';
                /* if property is date object, convert to string by calling toJSON */
                var recordPropValue = (obj.model.record[prop2].type === 'M.Date') ? obj.model.record[prop2].toJSON() : obj.model.record[prop2];
                sql += pre_suffix + recordPropValue + pre_suffix + ', ';
            }

            sql += obj.model.m_id + ')';

            //sql = sql.substring(0, sql.lastIndexOf(',')) + '); ';

            console.log(sql);

            this.performOp(sql, obj, 'INSERT');

        } else { // perform an UPDATE with id of model

            var sql = 'UPDATE ' + obj.model.name + ' SET ';

            for(var prop in obj.model.record) {
                
                if(prop === 'ID' || !obj.model.__meta[prop].isUpdated) { /* if property has not been updated, then exclude from update call */
                    continue;
                }
                var pre_suffix = obj.model.__meta[prop].dataType === 'String' || obj.model.__meta[prop].dataType === 'Text' || obj.model.__meta[prop].dataType === 'Date' ? '"' : '';

                /* if property is date object, convert to string by calling toJSON */
                var recordPropValue = obj.model.__meta[prop].dataType === 'Date' ? obj.model.record[prop].toJSON() : obj.model.record[prop];

                sql += prop + '=' + pre_suffix + recordPropValue + pre_suffix + ', ';
            }
            sql = sql.substring(0, sql.lastIndexOf(','));
            sql += ' WHERE ' + 'ID=' + obj.model.record.ID + ';';

            //console.log(sql);

            this.performOp(sql, obj, 'UPDATE');
        }
    },

    /**
     * Performs operation on WebSQL storage: INSERT, UPDATE or DELETE. Is used by {@link M.WebSqlProvider#save} and {@link M.WebSqlProvider#del}.
     * Calls is made asynchronously, means that result is just available in callback.
     * @param {String} sql The query.
     * @param {Object} obj The param object. Contains e.g. callbacks (onError & onSuccess)
     * @param {String} opType The String identifying the operation: 'INSERT', 'UPDATE' oder 'DELETE'
     * @private
     */
    performOp: function(sql, obj, opType) {
        var that = this;
        this.dbHandler.transaction(function(t) {
            t.executeSql(sql, null, function() {
                if(opType === 'INSERT') { /* after INSERT operation set the assigned DB ID to the model records id */
                    that.queryDbForId(obj.model);
                }
            }, function() { // error callback for SQLStatementTransaction
                M.Logger.log('Incorrect statement: ' + sql, M.ERROR);
            });
        },
        function(sqlError) { // errorCallback
            /* bind error callback */
            if (obj.onError && obj.onError.target && obj.onError.action) {
                obj.onError = this.bindToCaller(obj.onError.target, obj.onError.target[obj.onError.action], sqlError);
                obj.onError();
            } else if(obj.onError && typeof(obj.onError) === 'function') {
                obj.onError(sqlError);
            }
        },

        function() {    // voidCallback (success)
             /* delete  the model from the model record list */
            if(opType === 'DELETE') {
                obj.model.recordManager.remove(obj.model.m_id);
            }
            //console.log('success callback in performOP');
            //console.log('obj.onSuccess:');
            //console.log(obj.onSuccess);
            /* bind success callback */
            if (obj.onSuccess && obj.onSuccess.target && obj.onSuccess.action) {
                obj.onSuccess = that.bindToCaller(obj.onSuccess.target, obj.onSuccess.target[obj.onSuccess.action]);
                obj.onSuccess();
            }else if(obj.onSuccess && typeof(obj.onSuccess) === 'function') {
                obj.onSuccess(result);
            }
        });
    },

    /**
     * Prepares delete query for a model record. Operation itself is performed by {@link M.WebSqlProvider#performOp}.
     * Tuple is identified by ID (not the internal model id, but the ID provided by the DB in record).
     *
     * @param {Object} obj The param obj, includes:
     * * onSuccess callback
     * * onError callback
     * * the model
     */
    del: function(obj) {
        //console.log('del() called.');
        if(!this.isInitialized) {
            this.internalCallback = this.del;
            this.init(obj, this.bindToCaller(this, this.del));
            return;
        }

        var sql = 'DELETE FROM ' + obj.model.name + ' WHERE ID=' + obj.model.record.ID + ';';

        //console.log(sql);

        this.performOp(sql, obj, 'DELETE');
    },


    /**
     * Finds model records in the database. If a constraint is given, result is filtered.
     * @param {Object} obj The param object. Includes:
     * * model: the model blueprint
     * * onSuccess:
     * * onError:
     * * columns: Array of strings naming the properties to be selected: ['name', 'age'] => SELECT name, age FROM...
     * * constraint: Object containing itself two properties:
     *      * statement: a string with the statement, e.g. 'WHERE ID = ?'
     *      * parameters: array of strings with the parameters, length array must be the same as the number of ? in statement
     *          => ? are substituted with the parameters
     * * order: String with the ORDER expression: e.g. 'ORDER BY price ASC'
     * * limit: Number defining the number of max. result items
     */
    find: function(obj) {
        //console.log('find() called.');

        this.onSuccess = obj.onSuccess;
        this.onError = obj.onError;

        if(!this.isInitialized) {
            this.internalCallback = this.find;
            this.init(obj, this.bindToCaller(this, this.find));
            return;
        }
        
        var sql = 'SELECT ';

        if(obj.columns) {
            /* ID column always needs to be in de result relation */
            if(!(_.include(obj.columns, 'ID'))) {
                obj.columns.push('ID');
            }

            if(obj.columns.length > 1) {
                sql += obj.columns.join(', ');
            } else if(obj.columns.length == 1) {
                sql += obj.columns[0] + ' ';
            }
        } else {
            sql += '* ';
        }

        sql += ' FROM ' + obj.model.name;

        var stmtParameters = [];

        /* now process constraint */
        if(obj.constraint) {

            var n = obj.constraint.statement.split("?").length - 1;
            //console.log('n: ' + n);
            /* if parameters are passed we assign them to stmtParameters, the array that is passed for prepared statement substitution*/
            if(obj.constraint.parameters) {

                if(n === obj.constraint.parameters.length) { /* length of parameters list must match number of ? in statement */
                    sql += obj.constraint.statement;
                    stmtParameters = obj.constraint.parameters;
                } else {
                    M.Logger.log('Not enough parameters provided for statement: given: ' + obj.constraint.parameters.length + ' needed: ' + n, M.ERROR);
                    return NO;
                }
           /* if no ? are in statement, we handle it as a non-prepared statement
            * => developer needs to take care of it by himself regarding
            * sql injection
            */
            } else if(n === 0) {
                sql += obj.constraint.statement;
            }
        }

        /* now attach order */
        if(obj.order) {
            sql += ' ORDER BY ' + obj.order
        }

        /* now attach limit */
        if(obj.limit) {
            sql += ' LIMIT ' + obj.limit
        }

        //console.log(sql);

        var result = [];
        var that = this;
        this.dbHandler.readTransaction(function(t) {
            t.executeSql(sql, stmtParameters, function (tx, res) {
                var len = res.rows.length, i;
                for (var i = 0; i < len; i++) {
                    var rec = JSON.parse(JSON.stringify(res.rows.item(i))); /* obj returned form WebSQL is non-writable, therefore needs to be converted */
                    /* set m_id property of record to m_id got from db, then delete m_id property named after db column (M.META_M_ID) */
                    rec['m_id'] = rec[M.META_M_ID];
                    delete rec[M.META_M_ID];
                    /* create model record from result with state valid */
                    /* $.extend merges param1 object with param2 object*/
                    var myRec = obj.model.createRecord($.extend(rec, {state: M.STATE_VALID}));

                    /* create M.Date objects for all date properties */
                    for(var j in myRec.__meta) {
                        /* here we can work with setter and getter because myRec already is a model record */
                        if(myRec.__meta[j].dataType === 'Date' && typeof(myRec.get(j)) === 'string') {
                            myRec.set(j, M.Date.create(myRec.get(j)));
                        }
                    }
                    
                    /* add to result array */
                    result.push(myRec);
                }

            }, function(){M.Logger.log('Incorrect statement: ' + sql, M.ERROR)}) // callbacks: SQLStatementErrorCallback
        }, function(sqlError){ // errorCallback
            /* bind error callback */
            if(obj.onError && obj.onError.target && obj.onError.action) {
                obj.onError = this.bindToCaller(obj.onError.target, obj.onError.target[obj.onError.action], sqlError);
                obj.onError();
            } else if (typeof(obj.onError) !== 'function') {
                M.Logger.log('Target and action in onError not defined.', M.ERROR);
            }
        }, function() { // voidCallback (success)
            /* bind success callback */
            if(obj.onSuccess && obj.onSuccess.target && obj.onSuccess.action) {
                /* [result] is a workaround for bindToCaller: bindToCaller uses call() instead of apply() if an array is given.
                 * result is an array, but we what call is doing with it is wrong in this case. call maps each array element to one method
                 * parameter of the function called. Our callback only has one parameter so it would just pass the first value of our result set to the
                 * callback. therefor we now put result into an array (so we have an array inside an array) and result as a whole is now passed as the first
                 * value to the callback.
                 *  */
                obj.onSuccess = that.bindToCaller(obj.onSuccess.target, obj.onSuccess.target[obj.onSuccess.action], [result]);
                obj.onSuccess();
            }else if(obj.onSuccess && typeof(obj.onSuccess) === 'function') {
                obj.onSuccess(result);
            }
        });
    },


    /**
     * @private
     */
    openDb: function() {
        //console.log('openDb() called.');
        /* openDatabase(db_name, version, description, estimated_size, callback) */
        try {
            if (!window.openDatabase) {
                M.DialogView.alert({
                    message: 'Your browser does not support WebSQL.',
                    title: 'WebSQL Not Supported.'
                });
            } else {
                //this.dbHandler = openDatabase(this.config.dbName, '1.0', 'Database for ' + M.Application.name, this.config.size);
                /* leave version empty to open database regardless of its version */
                if(!this.dbHandler) {
                    this.dbHandler = openDatabase(this.config.dbName, '', 'Database for ' + M.Application.name, this.config.size);
                }

            }
        } catch(e) {
            
            if (e == 2) {
                // Version number mismatch.
                //M.Logger.log('Invalid database version.', M.ERROR);
                M.DialogView.alert({
                    message: 'Database version 1.0 not supported.',
                    title: 'Invalid database version.'
                });
            } else {
                //M.Logger.log('Unknown error ' + e + '.', M.ERROR);
                M.DialogView.alert({
                    message: e,
                    title: 'Unknown error.'
                });
            }
            return;
        }
        
    },


    /**
     * Creates the table corresponding to the model record.
     * @private
     */
    createTable: function(obj, callback) {
        //console.log('createTable() called.');
        //console.log(obj);
        var sql = 'CREATE TABLE IF NOT EXISTS '  + obj.model.name
                    + ' (ID INTEGER PRIMARY KEY ASC AUTOINCREMENT UNIQUE';

        for(var r in obj.model.__meta) {
           sql += ', ' + this.buildDbAttrFromProp(obj.model, r);
        }

        sql += ', ' + M.META_M_ID + ' INTEGER NOT NULL);';

        //console.log(sql);

        if(this.dbHandler) {
            var that = this;
            try {
                /* transaction has 3 parameters: the transaction callback, the error callback and the success callback */
                this.dbHandler.transaction(function(t) {
                    t.executeSql(sql);
                }, function(sqlError){ // errorCallback
                    /* bind error callback */
                    if(obj.onError && obj.onError.target && obj.onError.action) {
                        obj.onError = this.bindToCaller(obj.onError.target, obj.onError.target[obj.onError.action], sqlError);
                        obj.onError();
                    } else if (typeof(obj.onError) === 'function') {
                        obj.onError(sqlError);
                    } else {M.Logger.log('Target and action in onError not defined.', M.ERROR); }}, that.bindToCaller(that, that.handleDbReturn, [obj, callback])); // success callback
            } catch(e) {
                M.Logger.log('Error code: ' + e.code + ' msg: ' + e.message, M.ERROR);
                return;
            }
        } else {
            M.Logger.log('dbHandler does not exist.', M.ERROR);
        }
    },

    /**
     * Creates a new data provider instance with the passed configuration parameters
     * @param {Object} obj Includes dbName
     */
    configure: function(obj) {
        //console.log('configure() called.');
        obj.size = obj.size ? obj.size : 1024*1024;
        // maybe some value checking
        return this.extend({
            config:obj
        });
    },

    /* Helper methods */

    /**
     * @private
     * Creates the column definitions from the properties of the model record with help of the meta information that
     * the {@link M.ModelAttribute} objects provide.
     * @param {Object}
     * @returns {String} The string used for db create to represent this property.
     */
    buildDbAttrFromProp: function(model, prop) {

        var type = this.typeMapping[model.__meta[prop].dataType].toUpperCase();

        var isReqStr = model.__meta[prop].isRequired ? ' NOT NULL' : '';

        return prop + ' ' + type + isReqStr;
    },


    /**
     * Queries the WebSQL storage for the maximum db ID that was provided for a table that is defined by model.name. Delegates to
     * {@link M.WebSqlProvider#setDbIdOfModel}.
     *
     * @param {Object} model The table's model
     */
    queryDbForId: function(model) {
        var that = this;
        this.dbHandler.readTransaction(function(t) {
            var r = t.executeSql('SELECT seq as ID FROM sqlite_sequence WHERE name="' + model.name + '"', [], function (tx, res) {
                that.setDbIdOfModel(model, res.rows.item(0).ID);
            });
        });
    },

    /**
     * @private
     * Is called when creating table successfully returned and therefor sets the initialization flag of the provider to YES.
     * Then calls the internal callback => the function that called init().
     */
    handleDbReturn: function(obj, callback) {
        //console.log('handleDbReturn() called.');
        this.isInitialized = YES;
        this.internalCallback(obj, callback);
    },

    /**
     * @private
     * Is called from queryDbForId, sets the model record's ID to the latest value of ID in the database.
     */
    setDbIdOfModel: function(model, id) {
        model.record.ID = id;
    }

});