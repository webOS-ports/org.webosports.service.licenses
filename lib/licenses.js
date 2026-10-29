// Copyright (C) 2012 Simon Busch <morphis@gravedo.de>
// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	The three methods: the packages that have licenses in the licenses root
	(/usr/share/licenses, where Yocto puts each package's license files),
	the license files of one package, and one file's contents.

	They read the file system as the mojoservice service did, call for call
	and path for path, so the replies, and the errors Node gives for a path
	that is not there, are the same. README.md lists the old service's
	bugs; the ones mended are marked here by their numbers.
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

/*
	L1: a package or license is a name in its directory: a string, not
	empty, not "." or "..", with no "/" (or NUL) in it. The old service put
	whatever it was given in the path, so "../" read any file root can read.
	Anything else fails with 400, the code mojoservice gave arguments that
	failed a method's schema.
*/
function nameIn(value, what, dir) {
	if (typeof value !== 'string' || value === '' || value === '.' || value === '..' || /[/\0]/.test(value)) {
		const e = new Error('"' + what + '" must be the name of a ' + (what === 'package' ? 'directory' : 'file') +
			' in ' + dir);
		e.errorCode = 400;
		throw e;
	}
	return value;
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

		listLicensesForPackage(args) {
			const packageLicenseRoot = root + '/' + nameIn(args.package, 'package', root);
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
			const dir = root + '/' + nameIn(args.package, 'package', root);
			const licenseFile = dir + '/' + nameIn(args.license, 'license', dir);
			return {returnValue: true, license: fs.readFileSync(licenseFile)};
		}
	};
}

module.exports = {createCommands, ROOT};
