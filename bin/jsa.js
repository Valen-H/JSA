#!/usr/bin/env node
"use strict";

const	jsa	= require("../"),
		fs	= require("fs");

/*
jsa                  - help
jsa compile in [out] - input > output
jsa run in [args]    - run input
*/

if (process.argv.length <= 3) {
	console.info(`Usage:\n\n\tjsa compile file [output]\t- Compile (.jsa -> .jsae)\n\tjsa run file\t\t\t- Execute program (.jsa or .jsae)`);
} else if (/c(om(pile)?)?/i.test(process.argv[2])) {
	const	out	= jsa.JSA.parseBuffer(fs.readFileSync(process.argv[3])).compile();
	
	fs.writeFileSync(process.argv[4] || process.argv[3] + 'e', out);
} else if (/r(un)?/i.test(process.argv[2])) {
	const	j	= jsa.JSA.parseBuffer(fs.readFileSync(process.argv[3]));
	
	for (const e of j.execute(process.argv.slice(4))) {
		if (j.code[j.idx - 1] && j.code[j.idx - 1].op.toUpperCase() == "OUT")
			console.debug(e);
	}
}
