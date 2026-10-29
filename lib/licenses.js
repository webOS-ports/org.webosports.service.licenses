// Copyright (C) 2012 Simon Busch <morphis@gravedo.de>
// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-2.0-or-later

'use strict';

/*
	The three methods: the packages that have licenses in the licenses root
	(/usr/share/licenses, where Yocto puts each package's license files),
	the license files of one package, and one file's contents.

	They read the file system as the mojoservice service did, call for call
	and path for path, so the replies, and the errors Node gives for a path
	that is not there, are the same. The old service's bugs are kept here;
	README.md lists them.
*/

const fs = require('fs');

const ROOT = '/usr/share/licenses';

// L2: what an entry is, or null for one that cannot be looked at (a link that leads nowhere), left out.
function statOf(file) {
	try {
		return fs.statSync(file);
	} catch (e) {
		return null;
	}
}

function createCommands({root = ROOT} = {}) {
	return {
		listPackages() {
			const contents = fs.readdirSync(root);
			const packages = [];
			for (const name of contents) {
				const st = statOf(root + '/' + name);
				if (st && st.isDirectory()) {
					packages.push(name);
				}
			}
			return {returnValue: true, packages};
		},

		// L1: args.package is put in the path as it is, "../" and all.
		listLicensesForPackage(args) {
			const packageLicenseRoot = root + '/' + args.package;
			const contents = fs.readdirSync(packageLicenseRoot);
			const licenses = [];
			for (const name of contents) {
				const st = statOf(packageLicenseRoot + '/' + name);
				if (st && st.isFile()) {
					licenses.push(name);
				}
			}
			return {returnValue: true, licenses};
		},

		/*
			The file as a Buffer, which the reply's JSON turns into
			{type: "Buffer", data: [<byte>, ...]}: the client makes it a string.
		*/
		getLicenseTextForPackage(args) {
			const licenseFile = root + '/' + args.package + '/' + args.license;
			return {returnValue: true, license: fs.readFileSync(licenseFile)};
		}
	};
}

module.exports = {createCommands, ROOT};
