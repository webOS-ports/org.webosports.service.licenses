org.webosports.service.licenses
===============================

Summary
-------
License management service for the webOS ports project

Description
-----------
The service lists and returns the licenses of the packages installed in the
system: the files Yocto puts in `/usr/share/licenses/<package>/`.

| Method | Arguments | Reply |
|---|---|---|
| `listPackages` | none | `packages`: the directories in `/usr/share/licenses` |
| `listLicensesForPackage` | `package` | `licenses`: the files in that package's directory |
| `getLicenseTextForPackage` | `package`, `license` | `license`: the file, as `{"type": "Buffer", "data": [<byte>, ...]}` |

`license` is the file's bytes, not text: the client turns them into a string.
mojoservice's own `__info`, `__quit` and `__gc` are answered as before.

The service is plain Node 22, for the launcher's plain-node path
(`run-js-service` requires the directory, as it has a `package.json`, and
calls `run()`). It used to run on mojoservice and Foundations.

| | |
|---|---|
| `service.js` | start-up: the bus, the methods, mojoservice's own methods |
| `lib/licenses.js` | the three methods |
| `lib/mojo.js` | the replies mojoservice gave (from com.palm.service.contacts.linker) |
| `lib/bus.js`, `lib/errors.js` | the luna bus through palmbus (from luneos-synergy-connectors, by way of org.webosports.messaging and the linker) |

The first Node version gives the same replies as the mojoservice service,
its bugs included. It reads the file system with the same calls on the same
paths, so an error is the one Node gave the old service: an `errorCode` of
-9999 and "MojoService: no errorCode supplied " before Node's message, as
mojoservice answered an error with no code of its own. The old service's
bugs, which the code, tests and commits refer to by these numbers:

- L1: `package` and `license` went into the path as they were given. A
  missing one was read as "undefined" (`ENOENT ...
  '/usr/share/licenses/undefined'`), a number or an array was made a string,
  and `../` left `/usr/share/licenses`: `{"package": "../../../etc",
  "license": "hostname"}` returned `/etc/hostname`, as it would any other
  file the service (root) can read. Fixed: each must be a name in its
  directory (a string, not empty, not `.` or `..`, no `/`), or the call
  fails with errorCode 400 and says which.
- L2: an entry that cannot be looked at, such as a link that leads nowhere,
  failed the whole `listPackages` or `listLicensesForPackage` instead of being
  left out. Fixed: it is left out.
- L3: the service's client permissions (`files/sysbus/*.perm.json`) gave it
  `activity.operation` but not `activity.query`, the API group activitymanager
  puts `monitor` in, so every call with an `$activity` failed with "Denied
  method call "monitor" for category "/"". Fixed: it has `activity.query`.

Not a bug, but worth knowing: a Buffer in JSON is a list of numbers, so a
license of 18649 bytes (the kernel's `generic_GPL-2.0-with-Linux-syscall-note`)
is a reply of 67530 characters. The reply is the API its clients read, so it
is kept.

These things deliberately differ from the old service:

- No activity is made for each call. mojoservice created one
  (`listPackages_0`, `getLicenseTextForPackage_1`, ...) in activitymanager
  for every call that brought none and completed it after the reply; a
  service killed in a call left it behind.
- The bus code's own `info` and `quit` are there besides mojoservice's
  `__info` and `__quit`: the installer asks a service to quit through them.

A call that brings an `$activity` takes it on as mojoservice did (monitored;
adopted when activitymanager calls back), and answers a failed monitor with
the reply mojoservice gave: `{"errorCode": <its code>, "response": <its reply>,
"returnValue": false}`.

Tests
-----
    tests/run.sh

This runs the unit tests (`node --test`) on a stand-in bus over a licenses
root made next to them for the run, then jshint (set `JSHINT` if it is not
on the path) and a parse of every module.

Copyright and License Information
=================================
The service was written for mojoservice by:

 Copyright (C) 2012 Simon Busch <morphis@gravedo.de>

under the GNU General Public License, version 2 or (at your option) any
later version. This Node 22 rewrite of it is:

 Copyright (C) 2012 Simon Busch <morphis@gravedo.de>
 Copyright (c) 2026 Herman van Hazendonk

and is licensed under the GNU General Public License, version 3 or (at your
option) any later version: see COPYING.

lib/mojo.js reproduces the replies of mojoservice and Foundations, and the
__info, __quit and __gc methods in service.js those of mojoservice; they say
so in their headers. That code is:

 Copyright (c) 2009-2012 Hewlett-Packard Development Company, L.P.

licensed under the Apache License, Version 2.0, which allows it to be part
of a GPL-3.0 work.
