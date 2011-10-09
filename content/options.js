var squalitprefs = {
  onLoad: function() {
    this.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.squalit.");

    this.abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);
    this.aburi = this.prefs.getCharPref("addressbook");
    this.console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);


    var ablist = document.getElementById("abook_list");
    var books = this.listbooks();
    var abitem;

    for (uri in books) {
      squalitprefs.logger(5, "Adding addressbook: " + uri + "; Label: " + books[uri]);
      var cb = document.createElement("checkbox");
      cb.id = uri;
      var cbe = ablist.appendChild(cb);
      cbe.label = books[uri];
      cbe.command = "squalit_updateab";
      cbe.className = "sqalit_ab_cb";
      if ((this.aburi + ",").indexOf(uri + ",") > -1) { 
        squalitprefs.logger(5, "Setting checked " + cbe.id);
        cbe.checked = true;
      }
    }

  },
  
  logger: function (level, msg) {
    if( squalitprefs.prefs.getIntPref("loglevel") >= level ) {
      this.console.logStringMessage("[Squalit] " + msg);
    }
  },
  
  listbooks: function () {
    var allAddressBooks = this.abManager.directories;
    var abooks = {};
    while (allAddressBooks.hasMoreElements()) {
      var addressBook = allAddressBooks.getNext()
                                    .QueryInterface(Components.interfaces.nsIAbDirectory);
      if (addressBook instanceof Components.interfaces.nsIAbDirectory) {
        abooks[addressBook.URI] = addressBook.dirName;
      }
    }
    return abooks;
  },

  updateab: function (list) {
    var checkboxes = document.getElementsByClassName("sqalit_ab_cb");
    var urilist = new Array();
    for (idx in checkboxes) {
      if (true == checkboxes[idx].checked) {
        urilist.push(checkboxes[idx].id);
      }
    }
    squalitprefs.logger(5, "Setting addressbook to " + urilist.toString());
    squalitprefs.prefs.setCharPref("addressbook", urilist.toString() );
  },


  suffix: function (pref) {
    prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.squalit.");
    return prefs.getComplexValue(pref, Components.interfaces.nsIPrefLocalizedString).data;
  }

}