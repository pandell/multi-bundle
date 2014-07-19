/*jslint node: true */

"use strict";

var R = require("ramda");

// Greatest common element for a list of lists
module.exports = function gce(lists, index, last) {
    // get unique items from all row.path at [index]
    var uniques = R.uniq(R.map(R.nth(index || 0), lists));

    return (uniques.length !== 1 || uniques[0] === undefined)
        ? (last || null)
        : gce(lists, (index || 0) + 1, uniques[0]);
};
