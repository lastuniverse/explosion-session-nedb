'use strict';

var nedb = require('nedb');
var path = require('path');
var fs   = require("fs");


function init(options){
  console.log("mod.nedb.js init()");
  var db_nedb = {
    db: {},
    open: open,
    index: index,
    compact: compact
  };

  function open(name){
    if( !('path' in db_nedb) )
      return undefined;
    if( name in db_nedb.db )
      return db_nedb.db[name];
    db_nedb.db[name] = new nedb(path.join( db_nedb.path, name+'.'+db_nedb.ext));
    db_nedb.db[name].loadDatabase();
    return db_nedb.db[name];
  }

  function index(name,field){
    if( !('path' in db_nedb) )
      return undefined;
    if( !(name in db_nedb.db) )
      open(name);
    // Using a unique constraint with the index
    db_nedb.db[name].ensureIndex({ fieldName: field , unique: true }, function (err) {
    });
  }

  function compact(name,interval){
    if( !('path' in db_nedb) )
      return undefined;
    if( !(name in db_nedb.db) )
      return undefined;
    // Using a unique constraint with the index
    if(interval){
      db_nedb.db[name].persistence.setAutocompactionInterval(interval);
    }else{
      db_nedb.db[name].persistence.compactDatafile();
    }
  }

  if('path' in options){
    db_nedb.ext = options.ext||'db';
    db_nedb.path = options.path;
    var regExp = new RegExp( "\."+db_nedb.ext+"$" );
    var db_list = fs.readdirSync(db_nedb.path);
    db_list = db_list.filter(function(item) {
      return regExp.test(item);
    });
    db_list = db_list.map(function(item) {
      var cur = item.replace(regExp,"");
      db_nedb.db[cur] = new nedb(path.join( db_nedb.path, item));
      db_nedb.db[cur].loadDatabase();
      return cur;
    });
    //console.log("mod.nedb.js", db_nedb.path, db_list);
  }

  options.app.nedb = db_nedb;

  return function (req, res, next) {
    //req.app.nedb = db_nedb;
    console.log("in nedb");
    next();
  };
}

module.exports = init;








































'use strict';

var util = require('util');
// var nedb = require('nedb');
// var path = require('path');


var defaultOptions = {
  checkExpirationInterval: 900000,// How frequently expired sessions will be cleared; milliseconds.
  expiration: 86400000,// The maximum age of a valid session; milliseconds.
  createDatabaseTable: true// Whether or not to create the sessions database table, if one does not already exist.
};

var nedb;

module.exports = function(session) {

  //console.log("session:", session);

  var constructorArgs;

  if (typeof session.Store === 'undefined') {
    session = require('express-session');
    constructorArgs = Array.prototype.slice.call(arguments);
  }

  var Store = session.Store;




  var nedbStore = function(options, connection, cb) {
    //console.log("options:", options);
    //console.log("connection:", connection);
    nedb = options.nedb;

    this.options = (options || {});

    this.setDefaultOptions();

    if (typeof connection === 'function') {
      cb = connection;
      connection = null;
    }

    // this.manager = new MySQLConnectionManager(options, connection || null);
    // this.connection = this.manager.connection;

    var done = function() {
      this.setExpirationInterval();

      if (cb) {
        cb.apply(undefined, arguments);
      }

    }.bind(this);

    if (!this.options.createDatabaseTable) {
      return done();
    }

    this.createDatabaseTable(done);
  };


  util.inherits(nedbStore, Store);



  nedbStore.prototype.setDefaultOptions = function() {
    // Setting default options
    this.options = setDefaults(this.options, defaultOptions, true);
  };



  nedbStore.prototype.createDatabaseTable = function(cb) {
    // Creating sessions database table
    //console.log("Creating sessions database table");
    nedb.open('sessions');
    nedb.index('sessions','_id');
    nedb.compact('sessions',1000*60*10);
    cb && cb();
  };

  // For backwards compatibility.
  nedbStore.prototype.sync = function(){
    nedbStore.prototype.createDatabaseTable();
  };

  nedbStore.prototype.get = function(session_id, cb) {
    // Getting session: + session_id
    //console.log("Getting session: 1 " + session_id);
    nedb.db.sessions.findOne({ "_id": session_id }, function (err, json) {
      if( !err && json && json.data ){
        //console.log("Getting session: 2 " + json._id);
        cb(null, json.data );
      }else{
        //console.log("Getting session: 3 " + session_id);
        return cb(err, null);
      }
    });
    //console.log("Getting session: 4 " + session_id);
  };

  nedbStore.prototype.set = function(session_id, data, cb) {
    // Setting session: + session_id
    //console.log("Setting session: 1 " + session_id);
    var expires;
    if (data.cookie && data.cookie.expires) {
      expires = data.cookie.expires;
    } else {
      expires = new Date(Date.now() + this.options.expiration);
    }
    // Use whole seconds here; not milliseconds.
    expires = Math.round(expires.getTime() / 1000);
    nedb.db.sessions.findOne({ "_id": session_id }, function (err, json) {
      if( err ){
        //console.log("Setting session: 2 " + session_id);
        return cb && cb(err);
      }else if( json ){
        //console.log("Setting session: 3 " + session_id);
        nedb.db.sessions.update({ "_id": session_id }, { data: data, expires: expires }, {}, function (err, numReplaced) {
          //console.log("Setting session: 4 " + session_id, err, numReplaced);
          if (err)
            return cb && cb(err);
          cb && cb();
        });
        //console.log("Setting session: 5 " + session_id);
      }else{
        //console.log("Setting session: 6 " + session_id);
        nedb.db.sessions.insert({ _id: session_id, expires: expires, data: data }, function (err, newDoc) {
          //console.log("Setting session: 7 " + session_id);
          if (err)
            return cb && cb(err);
          cb && cb();
        });
        //console.log("Setting session: 8 " + session_id);
      }
    })
  };

  nedbStore.prototype.destroy = function(session_id, cb) {
    // Destroying session: + session_id
    nedb.db.sessions.remove({ _id: session_id }, {}, function (err, numRemoved) {
      if (err) {
        // Failed to destroy session.
        return cb && cb(err);
      }
      cb && cb();
    });
  };

  nedbStore.prototype.length = function(cb) {
    // Getting number of sessions
    // Count all documents in the datastore
    nedb.db.sessions.count({}, function (err, count) {
      if (err) {
        // Failed to get number of sessions.
        return cb && cb(err);
      }
      cb(null, count);
    });

  };

  nedbStore.prototype.clear = function(cb) {
    // Clearing all sessions
    // Removing all documents with the 'match-all' query
    nedb.db.sessions.remove({}, { multi: true }, function (err, numRemoved) {
      if (err) {
        // Failed to clear all sessions.
        return cb && cb(err);
      }
      cb && cb();
    });
  };


  nedbStore.prototype.clearExpiredSessions = function(cb) {
    // Clearing expired sessions
    // Removing all documents with the 'match-all' query
    nedb.db.sessions.remove({ expires: { $lt: Math.round(Date.now() / 1000) }}, { multi: true }, function (err, numRemoved) {
      if (err) {
        // Failed to clear all sessions.
        return cb && cb(err);
      }
      cb && cb();
    });
  };

  nedbStore.prototype.setExpirationInterval = function(interval) {
    // Setting expiration interval: + interval ms
    this.clearExpirationInterval();
    this._expirationInterval = setInterval(function() {
      this.clearExpiredSessions();
    }.bind(this), interval || this.options.checkExpirationInterval);
  };

  nedbStore.prototype.clearExpirationInterval = function() {
    // Clearing expiration interval
    clearInterval(this._expirationInterval);
  };

  nedbStore.prototype.closeStore = function(cb) {
    // Closing session store
    this.clearExpirationInterval();
    // if (this.manager) {
    //  this.manager.endConnection(cb);
    // }
  };

  if (constructorArgs) {
    // For backwards compatibility.
    // Immediately call as a constructor.
    return new (nedbStore.bind.apply(nedbStore, [undefined/* context */].concat(constructorArgs)))();
  }

  return nedbStore;
};


function setDefaults(obj, defaults, recursive) {
  if (!isObject(obj)) {
    return obj;
  }
  recursive = recursive === true;
  for (var key in defaults) {
    if (typeof obj[key] === 'undefined') {
      obj[key] = defaults[key];
    }
    if (recursive && isObject(obj[key])) {
      obj[key] = setDefaults(obj[key], defaults[key], recursive);
    }
  }
  return obj;
}

function isObject(obj) {
  var type = typeof obj;
  return type === 'function' || type === 'object' && !!obj;
}
