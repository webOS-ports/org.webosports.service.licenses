// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-2.0-or-later

'use strict';

/*
	The service's client permissions (files/sysbus/*.perm.json) against the
	activitymanager methods it calls. The hub checks each outbound call
	against the API groups the callee's api-permissions file puts the method
	in; without the group, activitymanager answers "Denied method call" and
	logs LS_REQUIRES_SECURITY ("Service security groups don't allow method
	call").

	The method -> group table is com.webos.service.activitymanager.api.json
	as installed on the qemux86-64 VM, for the methods this service calls.
	On a device (or with LICENSES_AM_API naming a copy of that file) the
	real file is read instead, and the table is checked against it.
*/

const {describe, it} = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const AM_API = process.env.LICENSES_AM_API ||
	'/usr/share/luna-service2/api-permissions.d/com.webos.service.activitymanager.api.json';
const KNOWN = {monitor: 'activity.query', adopt: 'activity.operation'};
// The activitymanager methods lib/mojo.js calls for an $activity.
const CALLED = ['monitor', 'adopt'];

const perm = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'files', 'sysbus',
	'org.webosports.service.licenses.perm.json'), 'utf8'))['org.webosports.service.licenses'];

function groupsOf(api, method) {
	return Object.keys(api).filter(g => api[g].includes('com.webos.service.activitymanager/' + method));
}

describe('ACG', () => {
	it('lib/mojo.js calls only the activitymanager methods listed here', () => {
		const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mojo.js'), 'utf8');
		assert.match(src, /\(adopt \? 'adopt' : 'monitor'\)/);
	});
	for (const m of CALLED) {
		it('grants the group activitymanager puts ' + m + ' in (' + KNOWN[m] + ')', () => {
			assert.ok(perm.includes(KNOWN[m]), 'perm.json lacks ' + KNOWN[m] + ' for ' + m);
		});
	}
	it('the table is the device\'s', {skip: fs.existsSync(AM_API) ? false : 'no ' + AM_API + ' (set LICENSES_AM_API)'}, () => {
		const api = JSON.parse(fs.readFileSync(AM_API, 'utf8'));
		for (const m of CALLED) {
			assert.ok(groupsOf(api, m).includes(KNOWN[m]), m + ' is in ' + JSON.stringify(groupsOf(api, m)));
		}
	});
});
