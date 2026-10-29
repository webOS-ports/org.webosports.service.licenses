// Copyright (c) 2026 Herman van Hazendonk
// __info, __quit and __gc derived from mojoservice's controller_service.js,
// Copyright 2009-2011 Hewlett-Packard Development Company, L.P., licensed
// under the Apache License, Version 2.0.
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	org.webosports.service.licenses: the licenses of the installed packages.

	The launcher (run-js-service -> jsservicelauncher's bootstrap-node.js)
	requires this directory, as it has a package.json, and calls run().
	Nothing starts on require, so a test can start() it on a stand-in bus.
	The methods are in lib/licenses.js; lib/mojo.js gives the replies the
	mojoservice service gave.
*/

const {createBus} = require('./lib/bus');
const {method} = require('./lib/mojo');
const {createCommands, ROOT} = require('./lib/licenses');

const NAME = 'org.webosports.service.licenses';
// services.json's activityTimeout: mojoservice quit after 30 s with no command running.
const IDLE_MS = 30000;
const NAMES = ['listPackages', 'listLicensesForPackage', 'getLicenseTextForPackage'];

// mojoservice's own __info: services.json as it was, less the commands that are not public (none are).
const INFO = {
	description: 'License management service',
	services: [{
		name: NAME,
		description: 'License management service',
		commands: [
			{name: 'listPackages', assistant: 'ListPackagesAssistant', 'public': true},
			{name: 'listLicensesForPackage', assistant: 'ListLicensesForPackageAssistant', 'public': true},
			{name: 'getLicenseTextForPackage', assistant: 'GetLicenseTextForPackageAssistant', 'public': true}
		]
	}]
};

/*
	start({palmbus, ...}): the service on that bus. root is the licenses
	root (/usr/share/licenses by default).
*/
function start({palmbus, exit = code => process.exit(code), idleMs = IDLE_MS, log = console, root = ROOT} = {}) {
	const bus = createBus({palmbus, name: NAME, exit, idleMs, log});
	const commands = createCommands({root});
	const table = {};
	for (const name of NAMES) {
		table[name] = method(NAME, name, args => commands[name](args), {log, subscribe: bus.subscribe});
	}
	// mojoservice's own methods.
	table.__info = {raw: true, handler: () => ({returnValue: true, info: JSON.parse(JSON.stringify(INFO))})};
	table.__quit = {
		raw: true,
		handler: () => {
			setTimeout(() => {
				log.log(NAME + ': asked to __quit, exiting');
				bus.stop();
				try {
					bus.handle.unregister();
				} catch (e) {
					log.error(NAME + ': unregister failed: ' + ((e && e.message) || e));
				}
				exit(0);
			}, 100);
			return {returnValue: true};
		}
	};
	table.__gc = {
		raw: true,
		handler: () => {
			if (!global.gc) {
				return {errorText: 'GC not enabled', returnValue: false};
			}
			setImmediate(() => global.gc());
			return {status: 'Collecting garbage', returnValue: true};
		}
	};
	bus.serve(table);
	log.log(NAME + ': up (node ' + process.version + ')');
	return {bus, commands};
}

let running = null;
function run() {
	if (running) {
		return running;
	}
	process.title = NAME;
	// palmbus is the launcher's: it is there on the device and nowhere else.
	try {
		running = start({palmbus: require('palmbus')});
	} catch (e) {
		console.error(NAME + ': failed to start: ' + ((e && e.stack) || e));
		process.exit(1);
	}
	return running;
}

module.exports = {start, run, NAME, NAMES, INFO};

if (require.main === module) {
	run();
}
