/*jslint node: true, vars: true */

"use strict";

var R = require("ramda");
var Rx = require("rx");


function hasDeps(mod) {
    return mod.deps && R.keys(mod.deps).length > 0;
}

var byId = R.comparator(function (a, b) {
    return a.id < b.id;
});

// Topological dependency sort, adapted from https://github.com/andreypopp/deps-topo-sort
module.exports = function topoSort(deps) {
    return deps.aggregate({}, function (index, row) {
        index[row.id] = row;
        return index;
    }).flatMap(function (index) {
        var seen = {};
        var topLevel = R.values(index);

        function visit(sorted, row) {
            if (!seen[row.id]) {
                seen[row.id] = true;
                if (hasDeps(row)) {
                    var rowDeps = R.map(R.props(index), R.values(row.deps));
                    R.reduce(visit, sorted, R.sort(byId, rowDeps));
                }
                sorted.push(row);
            }
            return sorted;
        }

        return Rx.Observable.fromArray(R.reduce(visit, [], R.sort(byId, topLevel)));
    });
};
