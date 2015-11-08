/****** BEGIN LICENSE BLOCK *****
  *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
  *
  * The contents of this file are subject to the Mozilla Public License Version
  * 1.1 (the "License"); you may not use this file except in compliance with
  * the License. You may obtain a copy of the License at
  * http://www.mozilla.org/MPL/
  *
  * Software distributed under the License is distributed on an "AS IS" basis,
  * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
  * for the specific language governing rights and limitations under the
  * License.
  *
  * The Original Code is squalit
  *
  * The Initial Developer of the Original Code is
  * Chris Hastie http://www.oak-wood.co.uk
  * Portions created by the Initial Developer are Copyright (C) 2010
  * the Initial Developer. All Rights Reserved.
  *
  *
  * Contributor(s):
  *
  * Alternatively, the contents of this file may be used under the terms of
  * either the GNU General Public License Version 2 or later (the "GPL"), or
  * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
  * in which case the provisions of the GPL or the LGPL are applicable instead
  * of those above. If you wish to allow use of your version of this file only
  * under the terms of either the GPL or the LGPL, and not to allow others to
  * use your version of this file under the terms of the MPL, indicate your
  * decision by deleting the provisions above and replace them with the notice
  * and other provisions required by the GPL or the LGPL. If you do not delete
  * the provisions above, a recipient may use your version of this file under
  * the terms of any one of the MPL, the GPL or the LGPL.
  *
  * ***** END LICENSE BLOCK *****
  */

var squalit = {
  isMain: false,
  pendingQueries: 0,
  maxPendingQueries: 100,
  
  onLoad: function() {
    // initialization code
    this.initialized = true;
    this.strings = document.getElementById("squalit-strings");
    this.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.squalit.");
    this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
    this.prefs.addObserver("", this, false);
    this.console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
    squalit.logger(5, "Initialising");

    this.abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);
    this.promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                  .getService(Components.interfaces.nsIPromptService);

    try {
      this.abpref = this.prefs.getCharPref("addressbook");
      this.homesuffix = this.prefs.getComplexValue("homesuffix", Components.interfaces.nsIPrefLocalizedString).data;
      this.worksuffix = this.prefs.getComplexValue("worksuffix", Components.interfaces.nsIPrefLocalizedString).data;
      this.cellsuffix = this.prefs.getComplexValue("cellsuffix", Components.interfaces.nsIPrefLocalizedString).data;
      this.plus = this.prefs.getCharPref("plus");
      this.refreshint = this.prefs.getIntPref("refreshint");
      this.dbFile = this.prefs.getComplexValue("dbfile", Components.interfaces.nsIRelativeFilePref).file;
    }
    catch(err) {
      this.logger(1, "Error retrieving preferences: " + err.message);
      this.initialized = false;
    }

  },

  onLoadMain: function() {
    this.onLoad();
    this.isMain = true;
    if (this.refreshint) {
      this.intervalID = window.setInterval(this.autoExport, this.refreshint * 1000 * 60, this);
    }
  },

  observe: function(subject, topic, data) {
      if (topic != "nsPref:changed") {
        return;
      }
      squalit.logger(5, "Caught change to preference " + data);
      switch(data) {
        case "addressbook":
          this.abpref = this.prefs.getCharPref(data);
          break;

        case "homesuffix":
          this.homesuffix = this.prefs.getComplexValue("homesuffix", Components.interfaces.nsIPrefLocalizedString).data;
          break;

        case "cellsuffix":
          this.cellsuffix = this.prefs.getComplexValue("cellsuffix", Components.interfaces.nsIPrefLocalizedString).data;
          break;

        case "worksuffix":
          this.worksuffix = this.prefs.getComplexValue("worksuffix", Components.interfaces.nsIPrefLocalizedString).data;
          break;

        case "plus":
          this.plus = this.prefs.getCharPref("plus");
          break;

        case "refreshint":
          this.refreshint = this.prefs.getIntPref("refreshint");
          if (this.intervalID) window.clearInterval(this.intervalID);
          if (this.refreshint && this.isMain) {
            this.intervalID = window.setInterval(this.autoExport, this.refreshint * 1000 * 60, this);
          }
          break;

        case "dbfile":
          this.dbFile = this.prefs.getComplexValue("dbfile", Components.interfaces.nsIRelativeFilePref).file;
          break;

      }
  },

  dbConnection: null,

  dbSchema: {
     tables: {
       numbers:"id    INTEGER PRIMARY KEY, \
                tel   VARCHAR(20) UNIQUE, \
                name  VARCHAR(255)"
      }
  },

  // utility for logging messages to the error console
  // levels:
  // 1: Caught exceptions, major problems
  // 2: Unexpected responses
  // 3: Notices, information
  // 4: Debug, protocol transactions
  // 5: Even more debug
  logger: function (level, msg) {
    if( this.prefs.getIntPref("loglevel") >= level ) {
      function formattime(s) {
        function pad(n, d) {
          d = d;
          n = n + '';
          while (n.length < d) n = '0' + n;
          return n;
        };
        return pad(s.getHours(),2)+':'
          +pad(s.getMinutes(),2)+':'
          +pad(s.getSeconds(),2)+'.'
          +pad(s.getMilliseconds(),3)
      }
      this.console.logStringMessage("[Squalit] " + formattime(new Date()) + ": " + msg);
    }
  },

  export: function () {
    squalit.logger(4, "Function export called");
    if (this.isLongQueue()) return;
    if (this.abpref.length > 0) {
      var abArray = this.abpref.split(',');
      this._dbInit();
      this._export(abArray);
      this.dbConnection.asyncClose();
    }
    else {
      var doConfig = this.promptService.confirm(window, this.strings.getString("noAbConfiguredTitle"),
                               this.strings.getString("noAbConfigured") );
      if (doConfig) {
        window.open('chrome://squalit/content/options.xul', 'options', 'chrome,resizable=1');
      }
    }
    squalit.logger(4, "Function export synchronous completion");
  },

  // obj should be this. Used because setTimeout executes in a different context
  // so this references the wrong object. 
  autoExport: function(obj) {
    squalit.logger(3, "Running auto export");
    obj.export();
  },

  exportSelectedCards: function () {
    squalit.logger(4, "Function exportSelectedCards called");
    if (this.isLongQueue()) return;
    var cards = GetSelectedAbCards();
    if (cards != null) {
      this._dbInit();
      for (x in cards) {
        this._exportCard(cards[x]);
      }
      this.dbConnection.asyncClose();
    }
    squalit.logger(4, "Function exportSelectedCards synchronous completion");
  },

  exportSelectedDirectory: function() {
    squalit.logger(4, "Function exportSelectedDirectory called");
    if (this.isLongQueue()) return;
    var sABuri = GetSelectedDirectory();
    var addressBook = this.abManager.getDirectory(sABuri);
    if (addressBook != null) {
      squalit.logger(3, "Exporting from " + addressBook.dirName);
      this._dbInit();
      this._exportBook(addressBook);
      this.dbConnection.asyncClose();
    }
    squalit.logger(4, "Function exportSelectedDirectory synchronous completion");
  },

  _export: function(abArray) {
    for (n in abArray) {
      squalit.logger(4, "Going to export from " + abArray[n]);
      var sAddressBook = this.abManager.getDirectory(abArray[n]);
      if (sAddressBook != null) {
        squalit.logger(3, "Exporting from " + sAddressBook.dirName);
        this._exportBook(sAddressBook);
      }
    }
  },

  _exportCard: function (aCard) {
    var num;
    var numtypes = {"HomePhone":this.homesuffix, "WorkPhone":this.worksuffix, "CellularNumber":this.cellsuffix};
    dName = aCard.getProperty("DisplayName", "Unknown");
    for (ntype in numtypes) {
      num = aCard.getProperty(ntype, "");
      if (num != null && num.length >0 ) {
        num = this.sanitizenumber(num);
        if (num.length >0) {
          var strName = numtypes[ntype].replace(/%N%/,dName);
          squalit.logger(5, strName + ": " + num);
          this._dbUpdate(num, strName);
        }
      }
    }
  },

  _exportBook: function(aAddressBook) {
    var sCards = aAddressBook.childCards;

    if (sCards != null) {
      var card = null;
      while (sCards.hasMoreElements() && (card = sCards.getNext()) != null) {
        card = card.QueryInterface(Components.interfaces.nsIAbCard);
        this._exportCard(card);
      }
    }
  },

  _dbInit: function() {
    squalit.logger(3, "Initialising database " +  this.dbFile.path);

    var dbService = Components.classes["@mozilla.org/storage/service;1"].
      getService(Components.interfaces.mozIStorageService);

    var dbConnection;

    if (!this.dbFile.exists())
      dbConnection = this._dbCreate(dbService, this.dbFile);
    else {
      dbConnection = dbService.openDatabase(this.dbFile);
      if (!dbConnection.tableExists('numbers')) this._dbCreateTables(dbConnection);
    }
    this.dbConnection = dbConnection;
    this.updatesql = this.dbConnection.createAsyncStatement("REPLACE INTO numbers (tel, name) VALUES (:tel, :name)");
  },

  _dbCreate: function(aDBService, aDBFile) {
    squalit.logger(3, "Creating database");
    aDBFile.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);
    var dbConnection = aDBService.openDatabase(aDBFile);
    this._dbCreateTables(dbConnection);
    return dbConnection;
  },

  _dbCreateTables: function(aDBConnection) {
    squalit.logger(3, "Creating database tables");
    for(var name in this.dbSchema.tables)
      aDBConnection.createTable(name, this.dbSchema.tables[name]);
  },

  _dbUpdate: function(sNum, sName) {
    this.updatesql.params.tel = sNum;
    this.updatesql.params.name = sName;

    this.pendingQueries ++;

    // need to do this so that this.pendingQueries can be accessed from callbacks
    var self = this;

    this.updatesql.executeAsync({
      handleError: function(aError) {
        squalit.logger(1, "Error: " + aError.message);
      },

      handleCompletion: function(aReason) {
        self.pendingQueries --;
        if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
          squalit.logger(1, "Query canceled or aborted!" + aReason.message);
        else squalit.logger(5, "Update query completed for " + sName + " (" + self.pendingQueries + " remaining)");
        if (self.pendingQueries < 1)
          squalit.logger(3, "All queries completed");
      }
    });
  },
  
  dbReset: function() {
    squalit.logger(4, "Function dbReset called");
    if (this.isLongQueue()) return;
    this._dbInit();
    squalit.logger(3, "Truncating database");
    var sql = this.dbConnection.createAsyncStatement("DELETE FROM numbers");
    this.pendingQueries ++;
    
    // need to do this so that this.pendingQueries can be accessed from callbacks
    var self = this;
    
    sql.executeAsync({
      handleError: function(aError) {
        squalit.logger(1, "Error: " + aError.message);
      },

      handleCompletion: function(aReason) {
        self.pendingQueries --;
        if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
          squalit.logger(1, "Query canceled or aborted!" + aReason.message);
        else squalit.logger(4, "Truncation query completed");
      }
    });
    if (this.abpref.length > 0) this._export(this.abpref.split(','));
    this.dbConnection.asyncClose();
    squalit.logger(4, "Function dbReset synchronous completion");
  },
  
  // A sanity check. If the number of pending queries exceeds
  // maxPendingQueries returns true
  isLongQueue: function() {
    // if there are still more than 10 queries pending, don't try
    // to add more address books to the queue
    squalit.logger(4, this.pendingQueries + " queries are queued")
    if (this.pendingQueries > this.maxPendingQueries) {
      squalit.logger(2, this.pendingQueries + " queries still waiting. Skipping action" )
      return true
    }  
    return false
  },

  sanitizenumber: function(num) {
    num = num.replace(/^\+/g, this.plus);
    num = num.replace(/[^0-9]/g,'');
    return num;
  },


  listbooks: function () {
    var allAddressBooks = this.abManager.directories;

    while (allAddressBooks.hasMoreElements()) {
      var addressBook = allAddressBooks.getNext()
                                    .QueryInterface(Components.interfaces.nsIAbDirectory);
      if (addressBook instanceof Components.interfaces.nsIAbDirectory) {
        squalit.logger(5, "Directory Name: " + addressBook.dirName);
        squalit.logger(5, "Directory URI: " + addressBook.URI);
      }
    }
  },

};

