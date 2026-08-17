#!/usr/bin/env node
/* nyanify command line wrapper.
 *
 *   echo "hello there" | node cli.js --level 4
 *   node cli.js --level 2 "hello there"
 */
"use strict";

var nyanify = require("./nyanify.js");

var args = process.argv.slice(2);
var level = 2;
var rest = [];

for (var i = 0; i < args.length; i++) {
  if (args[i] === "--level" || args[i] === "-l") {
    level = parseInt(args[++i], 10);
  } else if (/^--level=/.test(args[i])) {
    level = parseInt(args[i].split("=")[1], 10);
  } else if (args[i] === "--help" || args[i] === "-h") {
    process.stdout.write(
      "nyanify — turn text into cat nonsense\n\n" +
      "  echo TEXT | nyanify [--level 1-4]\n" +
      "  nyanify [--level 1-4] TEXT\n\n" +
      nyanify.levels.map(function (L) {
        return "  " + L.level + "  " + L.name + " — " + L.note + "\n";
      }).join("") + "\n");
    process.exit(0);
  } else {
    rest.push(args[i]);
  }
}

if (isNaN(level)) {
  process.stderr.write("nyanify: --level needs a number from 1 to 4\n");
  process.exit(2);
}

function run(text) {
  process.stdout.write(nyanify(text, level));
}

if (rest.length) {
  run(rest.join(" ") + "\n");
} else if (process.stdin.isTTY) {
  process.stderr.write("nyanify: give me text as an argument or on stdin (--help for more)\n");
  process.exit(2);
} else {
  var buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function (d) { buf += d; });
  process.stdin.on("end", function () { run(buf); });
}
