/*jslint node: true, vars: true */

"use strict";

var exec = require("child_process").exec;
var gulp = require("gulp");
var jshint = require("gulp-jshint");
var jslint = require("gulp-jslint-simple");
var monitorCtrlC = require("monitorctrlc");
var taskFromStreams = require("gulp-taskfromstreams");

var srcFiles = "{.,./lib}/*.js*";
var testFiles = "tests/*.js";

gulp.task("lint", taskFromStreams(function () {
    return [
        gulp.src([srcFiles, testFiles]),
        jshint(),
        jslint.run(),
        jslint.report({ emitErrorAtEnd: true })
    ];
}));

gulp.task("test", ["lint"], function (cb) {
    exec("node run-tests.js '" + testFiles + "'", function (err, stdout, stderr) {
        process.stdout.write(stdout);
        process.stderr.write(stderr);
        cb(err ? "Test failure" : null);
    });
});

gulp.task("watch", function () {
    monitorCtrlC();
    gulp.watch([srcFiles, testFiles], ["test"]);
    gulp.start("test");
});
