// Copyright (c) 2026 Herman van Hazendonk
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	The service on a stand-in bus (palmbus.js), over a licenses root made for
	each run next to this file and removed after it. The replies expected
	here are the ones the mojoservice service gave on the qemux86-64 VM for
	the same calls.
*/

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {createPalmbus} = require('./palmbus');
const {start, NAME} = require('../service');

const quiet = {log() {}, warn() {}, error() {}, info() {}};
const DENIED = {returnValue: false, errorCode: -1, errorText: 'Denied method call "monitor" for category "/"'};

let ROOT, OUTSIDE;
function fixture() {
	const base = fs.mkdtempSync(path.join(__dirname, 'fixture-'));
	ROOT = path.join(base, 'licenses');
	OUTSIDE = path.join(base, 'outside');
	for (const d of ['pkg-a/sub', 'pkg-b', 'empty-pkg', 'broken']) {
		fs.mkdirSync(path.join(ROOT, d), {recursive: true});
	}
	fs.writeFileSync(path.join(ROOT, 'pkg-a', 'COPYING'), 'GPL text\n');
	fs.writeFileSync(path.join(ROOT, 'pkg-a', 'bytes'), Buffer.from([0, 1, 127, 128, 255]));
	fs.writeFileSync(path.join(ROOT, 'pkg-a', 'empty'), '');
	fs.symlinkSync('COPYING', path.join(ROOT, 'pkg-a', 'link-file'));
	fs.symlinkSync('sub', path.join(ROOT, 'pkg-a', 'link-dir'));
	fs.writeFileSync(path.join(ROOT, 'pkg-b', 'MIT'), 'MIT text\n');
	fs.writeFileSync(path.join(ROOT, 'broken', 'ok'), 'ok\n');
	fs.symlinkSync('nowhere', path.join(ROOT, 'broken', 'dangling'));
	fs.writeFileSync(path.join(ROOT, 'stray-file'), 'not a package\n');
	fs.symlinkSync('pkg-b', path.join(ROOT, 'link-pkg'));
	fs.mkdirSync(OUTSIDE);
	fs.writeFileSync(path.join(OUTSIDE, 'secret'), 'secret\n');
	return base;
}

function boot({monitor = DENIED, root} = {}) {
	const calls = [];
	const exits = [];
	const palmbus = createPalmbus(async (uri, args) => {
		calls.push({uri, args});
		if (uri === 'luna://com.palm.activitymanager/monitor') {
			return monitor;
		}
		return {returnValue: false, errorCode: -1, errorText: 'no such service'};
	});
	const svc = start({palmbus, log: quiet, idleMs: 0, exit: code => exits.push(code), root: root || ROOT});
	const ask = async (method, payload, caller) => JSON.parse(await palmbus.request(NAME, method, payload, caller));
	return {svc, palmbus, calls, exits, ask};
}

const bytes = text => ({type: 'Buffer', data: Array.from(Buffer.from(text))});
const noStack = r => {
	const out = Object.assign({}, r);
	if (typeof out.exception === 'string') {
		out.exception = out.exception.split('\n')[0];
	}
	return out;
};

describe('licenses', () => {
	let base, s;
	before(() => {
		base = fixture();
		s = boot();
	});
	after(() => {
		s.svc.bus.stop();
		fs.rmSync(base, {recursive: true, force: true});
	});

	it('registers the three methods, mojoservice\'s own and the bus\'s', () => {
		const h = s.palmbus.services[NAME];
		assert.deepStrictEqual(h.methods.sort(), ['/__gc', '/__info', '/__quit', '/getLicenseTextForPackage',
			'/info', '/listLicensesForPackage', '/listPackages', '/quit']);
	});

	describe('listPackages', () => {
		it('lists the directories, links to one included, in name order', async () => {
			assert.deepStrictEqual(await s.ask('listPackages', {}),
				{returnValue: true, packages: ['broken', 'empty-pkg', 'link-pkg', 'pkg-a', 'pkg-b']});
		});
		it('puts returnValue first, as the old service did', async () => {
			assert.deepStrictEqual(Object.keys(await s.ask('listPackages', {})), ['returnValue', 'packages']);
		});
		it('takes any payload that is JSON', async () => {
			for (const text of ['[]', '5', '"s"', 'null', '0', '{"x":1}']) {
				assert.strictEqual((await s.ask('listPackages', text)).packages.length, 5, text);
			}
		});
		it('answers a payload that is not JSON as mojoservice did', async () => {
			const r = await s.ask('listPackages', 'abc');
			assert.deepStrictEqual(r, {returnValue: false, errorCode: -9999, errorText: 'MojoService: no errorCode supplied '});
			assert.deepStrictEqual(Object.keys(r), ['returnValue', 'errorCode', 'errorText']);
		});
		it('L2: leaves out a link that leads nowhere', async () => {
			fs.symlinkSync('nowhere', path.join(ROOT, 'dangling-pkg'));
			try {
				assert.deepStrictEqual((await s.ask('listPackages', {})).packages,
					['broken', 'empty-pkg', 'link-pkg', 'pkg-a', 'pkg-b']);
			} finally {
				fs.unlinkSync(path.join(ROOT, 'dangling-pkg'));
			}
		});
		it('fails with -9999 when the root is not there', async () => {
			const b = boot({root: path.join(base, 'none')});
			try {
				const r = noStack(await b.ask('listPackages', {}));
				assert.deepStrictEqual(r, {
					errorText: 'MojoService: no errorCode supplied ENOENT: no such file or directory, scandir \'' +
						path.join(base, 'none') + '\'',
					errorCode: -9999,
					exception: 'Error: ENOENT: no such file or directory, scandir \'' + path.join(base, 'none') + '\'',
					returnValue: false
				});
			} finally {
				b.svc.bus.stop();
			}
		});
	});

	describe('listLicensesForPackage', () => {
		it('lists the files, links to a file included, not directories', async () => {
			assert.deepStrictEqual(await s.ask('listLicensesForPackage', {package: 'pkg-a'}),
				{returnValue: true, licenses: ['COPYING', 'bytes', 'empty', 'link-file']});
		});
		it('an empty package has none', async () => {
			assert.deepStrictEqual(await s.ask('listLicensesForPackage', {package: 'empty-pkg'}),
				{returnValue: true, licenses: []});
		});
		it('fails a package that is not there, naming the path', async () => {
			const r = noStack(await s.ask('listLicensesForPackage', {package: 'nope'}));
			assert.strictEqual(r.errorCode, -9999);
			assert.strictEqual(r.errorText, 'MojoService: no errorCode supplied ENOENT: no such file or directory, scandir \'' +
				ROOT + '/nope\'');
			assert.strictEqual(r.returnValue, false);
			assert.deepStrictEqual(Object.keys(r), ['errorText', 'errorCode', 'exception', 'returnValue']);
		});
		it('L1: takes only a name for the package, and says so with 400', async () => {
			for (const args of [{}, {package: ''}, {package: '.'}, {package: '..'}, {package: '../outside'},
				{package: 'pkg-a/'}, {package: './pkg-a'}, {package: ['pkg-a']}, {package: 5}, {package: null},
				{package: {a: 1}}, {package: 'pkg-a\u0000'}]) {
				const r = noStack(await s.ask('listLicensesForPackage', args));
				assert.deepStrictEqual(r, {
					errorText: '"package" must be the name of a directory in ' + ROOT,
					errorCode: 400,
					exception: 'Error: "package" must be the name of a directory in ' + ROOT,
					returnValue: false
				}, JSON.stringify(args));
			}
		});
		it('L2: leaves out a link that leads nowhere', async () => {
			assert.deepStrictEqual(await s.ask('listLicensesForPackage', {package: 'broken'}),
				{returnValue: true, licenses: ['ok']});
		});
		it('takes a name with dots in it', async () => {
			fs.mkdirSync(path.join(ROOT, '..pkg.1'));
			try {
				assert.deepStrictEqual(await s.ask('listLicensesForPackage', {package: '..pkg.1'}),
					{returnValue: true, licenses: []});
			} finally {
				fs.rmdirSync(path.join(ROOT, '..pkg.1'));
			}
		});
	});

	describe('getLicenseTextForPackage', () => {
		it('sends the file as the bytes of a Buffer', async () => {
			assert.deepStrictEqual(await s.ask('getLicenseTextForPackage', {package: 'pkg-a', license: 'COPYING'}),
				{returnValue: true, license: bytes('GPL text\n')});
			assert.deepStrictEqual((await s.ask('getLicenseTextForPackage', {package: 'pkg-a', license: 'bytes'})).license,
				{type: 'Buffer', data: [0, 1, 127, 128, 255]});
			assert.deepStrictEqual((await s.ask('getLicenseTextForPackage', {package: 'pkg-a', license: 'empty'})).license,
				{type: 'Buffer', data: []});
		});
		it('follows a link to a file', async () => {
			assert.deepStrictEqual((await s.ask('getLicenseTextForPackage', {package: 'pkg-a', license: 'link-file'})).license,
				bytes('GPL text\n'));
		});
		it('fails a directory with EISDIR', async () => {
			const r = await s.ask('getLicenseTextForPackage', {package: 'pkg-a', license: 'sub'});
			assert.strictEqual(r.errorText, 'MojoService: no errorCode supplied EISDIR: illegal operation on a directory, read');
			assert.strictEqual(r.errorCode, -9999);
		});
		it('fails a file that is not there, naming the path', async () => {
			const r = await s.ask('getLicenseTextForPackage', {package: 'pkg-a', license: 'nope'});
			assert.strictEqual(r.errorText, 'MojoService: no errorCode supplied ENOENT: no such file or directory, open \'' +
				ROOT + '/pkg-a/nope\'');
		});
		it('L1: takes only names, and reads nothing outside the root', async () => {
			const pkg = '"package" must be the name of a directory in ' + ROOT;
			const lic = '"license" must be the name of a file in ' + ROOT + '/pkg-a';
			for (const [args, text] of [
				[{package: '../outside', license: 'secret'}, pkg],
				[{license: 'COPYING'}, pkg],
				[{package: ['pkg-a'], license: 'COPYING'}, pkg],
				[{package: 'pkg-a', license: '../../outside/secret'}, lic],
				[{package: 'pkg-a'}, lic],
				[{package: 'pkg-a', license: ''}, lic],
				[{package: 'pkg-a', license: '..'}, lic],
				[{package: 'pkg-a', license: 'sub/'}, lic],
				[{package: 'pkg-a', license: ['COPYING']}, lic]]) {
				const r = await s.ask('getLicenseTextForPackage', args);
				assert.strictEqual(r.errorCode, 400, JSON.stringify(args));
				assert.strictEqual(r.errorText, text, JSON.stringify(args));
				assert.strictEqual(r.license, undefined);
			}
		});
	});

	describe('$activity', () => {
		it('monitors one an app passes, and answers a refused monitor as mojoservice did', async () => {
			const r = await s.ask('listPackages', {$activity: {activityId: 987654321}});
			assert.deepStrictEqual(r, {errorCode: -1, response: DENIED, returnValue: false});
			assert.deepStrictEqual(Object.keys(r), ['errorCode', 'response', 'returnValue']);
			assert.deepStrictEqual(s.calls.at(-1),
				{uri: 'luna://com.palm.activitymanager/monitor', args: {activityId: 987654321, subscribe: true}});
		});
		it('monitors one with no activityId too', async () => {
			const n = s.calls.length;
			assert.strictEqual((await s.ask('listPackages', {$activity: true})).returnValue, false);
			assert.deepStrictEqual(s.calls.slice(n), [{uri: 'luna://com.palm.activitymanager/monitor', args: {subscribe: true}}]);
		});
		it('runs the command once the monitor is in', async () => {
			const b = boot({monitor: {returnValue: true, event: 'start'}});
			try {
				assert.strictEqual((await b.ask('listPackages', {$activity: {activityId: 5}})).packages.length, 5);
			} finally {
				b.svc.bus.stop();
			}
		});
		it('creates no activity for a call that brings none', async () => {
			const n = s.calls.length;
			await s.ask('listPackages', {});
			await s.ask('listLicensesForPackage', {package: 'pkg-a'});
			assert.strictEqual(s.calls.length, n);
		});
	});

	describe('mojoservice\'s own methods', () => {
		it('__info gives services.json as it was', async () => {
			assert.strictEqual(JSON.stringify(await s.ask('__info', {})),
				'{"returnValue":true,"info":{"description":"License management service","services":[{"name":' +
				'"org.webosports.service.licenses","description":"License management service","commands":[' +
				'{"name":"listPackages","assistant":"ListPackagesAssistant","public":true},' +
				'{"name":"listLicensesForPackage","assistant":"ListLicensesForPackageAssistant","public":true},' +
				'{"name":"getLicenseTextForPackage","assistant":"GetLicenseTextForPackageAssistant","public":true}]}]}}');
		});
		it('__gc says GC is not enabled', async () => {
			assert.strictEqual(JSON.stringify(await s.ask('__gc', {})), '{"errorText":"GC not enabled","returnValue":false}');
		});
		it('__quit answers, then leaves the bus and exits', async () => {
			const b = boot();
			assert.deepStrictEqual(await b.ask('__quit', {}), {returnValue: true});
			// mojoservice quit 100 ms after the reply, so that it goes out.
			await new Promise(r => setTimeout(r, 50));
			assert.deepStrictEqual(b.exits, []);
			await new Promise(r => setTimeout(r, 100));
			assert.deepStrictEqual(b.exits, [0]);
			assert.strictEqual(b.palmbus.services[NAME].unregistered, true);
		});
	});
});
