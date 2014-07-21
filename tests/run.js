/*jslint node: true */
"use strict";

var faucet = require("faucet");
var glob = require("glob");
var path = require("path");
var test = require("tape");

test.createStream().pipe(faucet()).pipe(process.stdout);

glob.sync(process.argv[2]).forEach(function (p) {
    require(path.resolve(p));
});
