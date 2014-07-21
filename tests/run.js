/*jslint node: true */
"use strict";

var faucet = require("faucet");
var path = require("path");
var test = require("tape");

test.createStream().pipe(faucet()).pipe(process.stdout);

process.argv.slice(2).forEach(function (p) {
    require(path.resolve(p));
});
