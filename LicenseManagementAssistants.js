/*
 *  Copyright (C) 2012 Simon Busch <morphis@gravedo.de>
 *
 *  This program is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU General Public License
 *  as published by the Free Software Foundation; either version 2
 *  of the License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 */

if(typeof require === 'undefined') {
   require = IMPORTS.require;
}

if(typeof licensesRoot === 'undefined') {
   licensesRoot = '/usr/share/licenses';
}


fs = require('fs');

var ListPackagesAssistant = function() { }
var ListLicensesForPackageAssistant = function() { }
var GetLicenseTextForPackageAssistant = function() { }

ListPackagesAssistant.prototype.run = function(future) {
	
	var contents = fs.readdirSync(licensesRoot);

	var packages = [];

	for (var i = 0; i < contents.length; i++) {
	    var fileInfo = fs.statSync(licensesRoot + "/" + contents[i]);
	    if (fileInfo.isDirectory()) {
	        packages.push(contents[i]);
	    } 
	}
	
    future.result = {
        "returnValue": true,
        "packages": packages
    };
}

ListLicensesForPackageAssistant.prototype.run = function(future) {
	var args = this.controller.args;

	var packageLicenseRoot = licensesRoot + "/" + args.package;
	var contents = fs.readdirSync(packageLicenseRoot);

	var licenses = [];

	for (var i = 0; i < contents.length; i++) {
	    var fileInfo = fs.statSync(packageLicenseRoot + "/" + contents[i]);
	    if (fileInfo.isFile()) {
	        licenses.push(contents[i]);
	    } 
	}

    future.result = {
        "returnValue": true,
        "licenses": licenses
    };
}


GetLicenseTextForPackageAssistant.prototype.run = function(future) {
	var args = this.controller.args;

	var licenseFile = licensesRoot + "/" + args.package + "/" + args.license;

	// This returns a byte array. If we encode this to a string, we need to escape special characters
	// to be able to JSON encode it. So we pass data as a byte array and covert it to a string in the client
	var license = fs.readFileSync(licenseFile);

    future.result = {
        "returnValue": true,
        "license": license
    };
}

