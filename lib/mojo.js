// Copyright (c) 2026 Herman van Hazendonk
// Derived from mojoservice, Copyright 2009-2011 Hewlett-Packard Development
// Company, L.P., and Foundations' comms/palmcall.js, control/activity.js and
// structure/err.js, Copyright (c) 2009-2012 Hewlett-Packard Development
// Company, L.P., licensed under the Apache License, Version 2.0.
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
	The replies the service gave when it ran on mojoservice, kept as they
	were for its callers. From com.palm.service.contacts.linker's lib/mojo.js
	(app-services), as it was in that service's first Node version; the
	differences are marked [licenses].

	- an object result with returnValue:true added, and {returnValue:true}
	  for a result that is falsy
	- an error as {errorText, errorCode, exception, returnValue:false}: with
	  no errorCode of its own, -9999 and "MojoService: no errorCode
	  supplied " before its text
	- a command still running after its timeout: error 504,
	  "commandTimeout in <service>/<method>"
	- a payload that is not JSON: {returnValue:false, errorCode:-9999,
	  errorText: "MojoService: no errorCode supplied "} [licenses]
*/

const DEFAULT_TIMEOUT_S = 60;
const AM = 'palm://com.palm.activitymanager';

// A callback from activitymanager: the legacy name, the OSE one, or its proxy for the creator.
function fromActivityManager(sender) {
	return sender === 'com.palm.activitymanager' || sender === 'com.webos.service.activitymanager' ||
		/_com\.webos\.service\.activitymanager_proxy$/.test(sender || '');
}

function reply(result) {
	if (!result) {
		return {returnValue: true};
	}
	if (typeof result === 'object') {
		result.returnValue = true;
	}
	return result;
}

function exception(e) {
	const out = {
		errorText: e && e.message,
		errorCode: e && e.errorCode,
		exception: e && e.stack ? e.stack : String(e),
		returnValue: false
	};
	if (out.errorCode === undefined) {
		out.errorCode = -9999;
		out.errorText = 'MojoService: no errorCode supplied ' + (out.errorText || '');
	}
	return out;
}

function timeoutError(service, command) {
	const e = new Error('commandTimeout in ' + service + '/' + command);
	e.errorCode = 504;
	return e;
}

/*
	[licenses] The arguments as mojoservice read them from the payload:
	JSON.parse, and {} for a falsy value (null, 0, false, ""). -> {args} or,
	for a payload that is not JSON, {instead: the reply}: mojoservice sent
	the SyntaxError itself, whose message and stack do not serialize.
*/
function parseArgs(text) {
	let args;
	try {
		args = JSON.parse(text);
	} catch (e) {
		return {instead: {returnValue: false, errorCode: -9999, errorText: 'MojoService: no errorCode supplied '}};
	}
	return {args: args || {}};
}

/*
	[licenses] A failed monitor, as mojoservice answered it: the Foundations
	error it got from PalmCall, serialized. Its message does not serialize;
	errorCode (the reply's, or -1), innerError (the reply's exception, when
	there is one) and response (the reply) do.
*/
function monitorFailure(r) {
	const out = {errorCode: (r && r.errorCode) || -1};
	if (r && r.exception !== undefined) {
		out.innerError = r.exception;
	}
	out.response = r;
	out.returnValue = false;
	return out;
}

/*
	A command given an $activity takes it on first, as mojoservice did:
	activitymanager calling back, adopt it and answer at once; anyone else
	passing one, monitor it. -> the subscription to end when the command is
	done, or a reply to give instead of running.
*/
async function takeActivity(subscribe, params, ctx) {
	const a = params.$activity;
	const adopt = fromActivityManager(ctx.sender);
	const args = {activityId: a.activityId, subscribe: true};
	if (adopt && a.callback && a.callback.serial) {
		args.serial = a.callback.serial;
	}
	const uri = AM + '/' + (adopt ? 'adopt' : 'monitor');
	try {
		const held = await subscribe(uri.replace(/^palm:/, 'luna:'), args);
		if (adopt && ctx.replyNow) {
			ctx.replyNow({returnValue: true});
		}
		return {held};
	} catch (e) {
		if (!adopt && e && e.reply) {
			return {instead: monitorFailure(e.reply)};
		}
		const err = new Error(uri + ' ' + JSON.stringify(args) + ': ' +
			((e && e.errorText) || (e && e.message) || 'Unknown PalmCall failure'));
		err.errorCode = typeof (e && e.errorCode) === 'number' ? e.errorCode : -1;
		return {instead: adopt ? reply({status: 'adopt failed', error: String(err)}) : exception(err)};
	}
}

/*
	A bus method ({handler, raw, rawPayload, timeoutMs}) that replies as
	mojoservice did: run(args) is the command; it gets timeoutS seconds.
	subscribe (the bus's) takes on an $activity the call brings
	(takeActivity).
*/
function method(service, name, run, {timeoutS = DEFAULT_TIMEOUT_S, log = console, subscribe} = {}) {
	return {
		raw: true,
		rawPayload: true,
		timeoutMs: (timeoutS + 5) * 1000,
		handler: async (text, ctx = {}) => {
			const parsed = parseArgs(text);
			if (parsed.instead) {
				log.error(service + ': ' + name + ': the payload is not JSON');
				return parsed.instead;
			}
			const args = parsed.args;
			let taken = {};
			// [licenses] mojoservice took on any $activity that is truthy, with an activityId or not.
			if (subscribe && args.$activity) {
				taken = await takeActivity(subscribe, args, ctx);
				if (taken.instead) {
					log.error(service + ': ' + name + ': ' + JSON.stringify(taken.instead));
					return taken.instead;
				}
			}
			let timer;
			const late = new Promise((resolve, reject) => {
				timer = setTimeout(() => reject(timeoutError(service, name)), timeoutS * 1000);
				if (timer.unref) {
					timer.unref();
				}
			});
			try {
				return reply(await Promise.race([Promise.resolve().then(() => run(args)), late]));
			} catch (e) {
				log.error(service + ': ' + name + ' failed: ' + ((e && e.stack) || e));
				return exception(e);
			} finally {
				clearTimeout(timer);
				if (taken.held) {
					taken.held.cancel();
				}
			}
		}
	};
}

module.exports = {method, reply, exception, parseArgs, monitorFailure, timeoutError, fromActivityManager,
	DEFAULT_TIMEOUT_S};
