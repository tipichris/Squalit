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
  * The Original Code is TBDialOut.
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
      this.aburi = this.prefs.getCharPref("addressbook");
      this.homesuffix = this.prefs.getComplexValue("homesuffix", Components.interfaces.nsIPrefLocalizedString).data;
      this.worksuffix = this.prefs.getComplexValue("worksuffix", Components.interfaces.nsIPrefLocalizedString).data;
      this.cellsuffix = this.prefs.getComplexValue("cellsuffix", Components.interfaces.nsIPrefLocalizedString).data;
      this.digits = this.prefs.getIntPref("digits");
      this.refreshint = this.prefs.getIntPref("refreshint");
      this.dbFile = this.prefs.getComplexValue("dbfile", Components.interfaces.nsIRelativeFilePref).file;
    }
    catch(err) {
      this.logger(1, "Error retrieving preferences: " + err.message);
      this.initialized = false;
    }


    // listen for changes of selected cards
    // document.getElementById("abResultsTree").addEventListener("select", this.onSelectNewRow, true);

  },

  onLoadMain: function() {
    this.onLoad();
    this.isMain = true;
    if (this.refreshint) {
      this.intervalID = window.setInterval(this.autoExport.bind(this), this.refreshint * 1000 * 60);
    }
  },

  observe: function(subject, topic, data) {
      if (topic != "nsPref:changed") {
        return;
      }

      switch(data) {
        case "addressbook":
          this.aburi = this.prefs.getCharPref(data);
          this.refreshInformation();
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

        case "digits":
          this.digits = this.prefs.getIntPref("digits");
          break;

        case "refreshint":
          this.refreshint = this.prefs.getIntPref("refreshint");
          if (this.intervalID) window.clearInterval(this.intervalID);
          if (this.refreshint && this.isMain) {
            this.intervalID = window.setInterval(this.autoExport.bind(this), this.refreshint * 1000 * 60);
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
      this.console.logStringMessage("[Squalit] " + msg);
    }
  },

  export: function () {
    this.dbInit();
    var sAddressBook = this.abManager.getDirectory(this.aburi);
    this._exportBook(sAddressBook);
    this.dbConnection.asyncClose();
  },

  autoExport: function() {
    squalit.logger(3, "Running auto export");
    this.export();
  },

  exportSelectedCards: function () {
    var cards = GetSelectedAbCards();
    if (cards != null) {
      this.dbInit();
      for (x in cards) {
        this._exportCard(cards[x]);
      }
      this.dbConnection.asyncClose();
    }
  },

  exportSelectedDirectory: function() {
    var sABuri = GetSelectedDirectory();
    var addressBook = this.abManager.getDirectory(sABuri);
    if (addressBook != null) {
      squalit.logger(3, "Exporting from " + addressBook.dirName);
      this.dbInit();
      this._exportBook(addressBook);
      this.dbConnection.asyncClose();
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
          squalit.logger(5, dName + " " + numtypes[ntype] + ": " + num);
          this.dbUpdate(num, dName + " " + numtypes[ntype]);
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

  listbooks: function () {
    var allAddressBooks = this.abManager.directories;

    while (allAddressBooks.hasMoreElements()) {
      var addressBook = allAddressBooks.getNext()
                                    .QueryInterface(Components.interfaces.nsIAbDirectory);
      if (addressBook instanceof Components.interfaces.nsIAbDirectory) {
        squalit.logger(5, "Directory Name:" + addressBook.dirName);
        squalit.logger(5, "Directory URI:" + addressBook.URI);
      }
    }
  },

  dbInit: function() {
    squalit.logger(3, "Exporting to " +  this.dbFile.path);

    var dbService = Components.classes["@mozilla.org/storage/service;1"].
      getService(Components.interfaces.mozIStorageService);

    var dbConnection;

    if (!this.dbFile.exists())
      dbConnection = this._dbCreate(dbService, this.dbFile);
    else {
      dbConnection = dbService.openDatabase(this.dbFile);
    }
    this.dbConnection = dbConnection;
  },

  _dbCreate: function(aDBService, aDBFile) {
    var dbConnection = aDBService.openDatabase(aDBFile);
    this._dbCreateTables(dbConnection);
    return dbConnection;
  },

  _dbCreateTables: function(aDBConnection) {
    for(var name in this.dbSchema.tables)
      aDBConnection.createTable(name, this.dbSchema.tables[name]);
  },

  dbUpdate: function(sNum, sName) {
    var sql = this.dbConnection.createStatement("REPLACE INTO numbers VALUES (null, :tel, :name)");
    sql.params.tel = sNum;
    sql.params.name = sName;

    sql.executeAsync({
      handleError: function(aError) {
        squalit.logger(1, "Error: " + aError.message);
      },

      handleCompletion: function(aReason) {
        if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
          squalit.logger(1, "Query canceled or aborted!" + aReason.message);
      }
    });
  },

  sanitizenumber: function(num) {
    num = num.replace(/^\+/g, '00');
    num = num.replace(/[^0-9]/g,'');
    num = num.substr(-this.digits, this.digits);
    return num;
  },

};

