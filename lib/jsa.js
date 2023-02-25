#!/usr/bin/env node
"use strict";

class JSA {
	
	/**
	 * @type {Exp[]}
	 * @memberof JSA
	 */
	code	= [ ];
	/**
	 * @type {Map<string, any>}
	 * @memberof JSA
	 */
	store	= new Map;
	idx		= 0;
	
	/**
	 * @param {Exp[]|JSA} code
	 */
	constructor(code) {
		if (code instanceof JSA) {
			this.store	= new Map(structuredClone(code.store.entries()));
			code		= code.code;
		}
		
		this.code	= Array.from(structuredClone(code || this.code));
		
		this._patch();
		this._setStore();
	} //ctor
	
	_patch() {
		if (!this.code.length || this.code[this.code.length - 1].op != "NOP")
			this.code.push(new Exp("NOP"));
		
		return this;
	} //_patch
	
	_setStore() {
		this.store.set("Math", Math);
		this.store.set("JSON", JSON);
		this.store.set("Date", Date);
		this.store.set("undef", undefined);
		this.store.set("null", null);
		
		return this;
	} //_setStore
	
	/**
	 * @param {string} code
	 * @returns {JSA}
	 */
	static parse(code) {
		const	jsa	= new JSA();
		
		jsa.code	= code.split(/(?<!\\)\r?\n/gmis)
		.map(c => c.trim().replaceAll(/(?<!\\)(#.*|,)$/gmis, "").trim()).filter(c => c)
		.map((c, i) => new Exp(c, i, jsa));
		
		jsa._patch();
		
		return jsa;
	} //parse
	
	/**
	 * @param {Uint8Array} code
	 * @returns {JSA}
	 */
	static parseBinary(code) {
		if (code[code.length - 1] != 0 || code[0] != 137)
			throw "Bad Executable";
		
		let	data	= [ ],
			ccode	= [ ],
			ocode	= [ ],
			regdat	= true,
			cdata	= "",
			exps	= [ ],
			jsa		= new JSA;
		
		for (let i = 2; i < code.length; i++) {
			if (!code[i] && code[i + 1] == 138) {
				data.push(cdata);
				i++;
				regdat	= false;
			} else if (regdat && code[i])
				cdata	+= String.fromCharCode(code[i]);
			else if (regdat && !code[i]) {
				data.push(cdata);
				cdata	= "";
			} else
				ccode.push(code[i]);
		}
		
		{
			let	append	= false;
			
			for (const c of ccode) {
				if (append)
					ocode[ocode.length - 1]	+= c;
				else	ocode.push(c);
				
				if (c == 0xff)	append	= true;
				else			append	= false;
			}
		}
		
		for (let i = 0; i < ocode.length;) {
			let	op		= Object.entries(Exp.opcodes).find((e, j) => ocode[i] == j),
					regs	= [ ];
			
			i++;
			
			for (let j = 0; j < op[1]; j++) {
				const	[ type, reg ]	= [ ocode[i], ocode[i + 1] ];
				
				i	+= 2;
				regs.push([type, reg]);
			}
			
			regs	= regs.map(r => {
				if (!r[0])			return `a${r[1]}`;
				else if (r[0] == 1)	return `"${data[r[1]]}`;
				else if (r[0] == 2)	return `${r[1]}`;
			}).join(", ");
			
			exps.push(new Exp(`${op[0]} ${regs}`, 0, jsa));
		}
		
		jsa.code	= exps;
		jsa._patch();
		
		return jsa;
	} //parseBinary
	
	/**
	 * @param {Buffer} buff
	 * @returns {JSA}
	 */
	static parseBuffer(buff) {
		if (buff && buff[0] == 137) {
			const	tarr	= new Uint8Array(buff.length);
			
			for (let i = 0; i < buff.length; ++i)
				tarr[i]	= buff[i];
			
			return JSA.parseBinary(tarr);
		}
		
		return JSA.parse(buff.toString());
	} //parseBuffer
	
	/**
	 * @returns {Uint8Array}
	 */
	compile() {
		this._patch();
		
		let	buff	= [ 137, 1 ],
			data	= [ ],
			store	= [ ],
			code	= [ ];
		
		for (const exp of this.code) {
			let	ocode	= exp.opcode,
				ccode	= [ ];
			
			while (ocode > 0xff) {
				ccode.push(0xff);
				ocode	-= 0xff;
			}
			
			ccode.push(ocode);
			
			let	regs	= exp.regs.map(r => {
				if (r.startsWith('"')) {
					r			= r.replace(/^"/i, "").replaceAll(/(\s+)/gmis, "\\s").replaceAll(/\\/gmis, "\\\\");
					
					let	idx	= data.findIndex(d => d == r),
						cr	= [ ];
					
					if (idx < 0) {
						data.push(r);
						
						idx	= data.length - 1;
					}
					
					while (idx > 0xff) {
						cr.push(0xff);
						idx	-= 0xff;
					}
					
					cr.push(idx);
					
					return [ 1 ].concat(cr);
				} else if (/^[\+\-]?\d+(\.\d+)?$/.test(r)) {
					r	= Number(r) || 0;
					
					let	cr	= [ ];
					
					while (r > 0xff) {
						cr.push(0xff);
						r	-= 0xff;
					}
					
					cr.push(r);
					
					return [ 2 ].concat(cr);
				} else {
					let	idx	= store.findIndex(d => d == r),
						cr	= [ ];
					
					if (idx < 0) {
						store.push(r);
						
						idx	= store.length - 1;
					}
					
					while (idx > 0xff) {
						cr.push(0xff);
						idx	-= 0xff;
					}
					
					cr.push(idx);
					
					return [ 0 ].concat(cr);
				}
			}).flat();
			
			code	= code.concat(ccode).concat(regs);
		}
		
		data	= data.map(d => {
			const	ret	= [ ];
			
			for (let i = 0; i < d.length; i++)
				for (let j = 0; !isNaN(d[i].charCodeAt(j)); j++)
					ret.push(d[i].charCodeAt(j));
			
			return ret.concat([ 0 ]);
		}).flat();
		buff	= buff.concat(data).concat([ 138 ]).concat(code);
		
		return new Uint8Array(buff);
	} //compile
	
	*execute(...d) {
		while (this.idx >= 0 && this.idx < this.code.length) {
			const	ret	= this.code[this.idx++].execute(this, ...d);
			
			d = (yield ret) ?? d;
		}
		
		this.idx	= 0;
		
		return this;
	} //execute*
	
	/**
	 * @param {string|number} key
	 * @returns {any}
	 */
	get(key) {
		return !key || typeof key == "number" ? key : (/^[\+\-]?\d+(\.\d+)?$/.test(key) ? Number(key) : (key.startsWith('"') ? key.replace(/^"/i, "") : this.store.get(key)));
	} //get
	
} //JSA

class Exp {
	
	static opcodes	= {
		"nop":		0, "break":	0, "call":	3, "label":		2, "jump":	1,
		"if":		2, "ifnot":	2, "set":	2, "add":		3, "sub":	3,
		"mul":		3, "div":	3, "mod":	3, "pow":		3, "shl":	3,
		"shr":		3, "ush":	3, "or":	3, "bor":		3, "xor":	3,
		"and":		3, "bnd":	3, "not":	2, "bnt":		2, "gt":	3,
		"gte":		3, "lt":	3, "lte":	3, "arr":		1, "arg":	3,
		"ars":		3, "arl":	2, "push":	2, "unshift":	2, "pop":	2,
		"shift":	2, "obj":	1, "obg":	3, "obs":		3, "obk":	2,
		"type":		2, "out":	1, "eval":	2,
	};
	
	op		= "NOP";
	regs	= [ ];
	
	/**
	 * @param {string} code
	 * @param {number} i
	 * @param {JSA} jsa
	 */
	constructor(code, i, jsa) {
		const	parts	= code.replaceAll(/(?<!\\),/gmis, ' ').split(/(?<!\\)\s+/gmis).map(p => p.replaceAll(/(?<!\\)\\/gmis, "").trim().replaceAll(/\\s/gmis, ' ').replaceAll(/\\t/gmis, '\t').replaceAll(/\\n/gmis, '\n')).filter(p => p);
		
		if (/^br(ea)?k$/i.test(parts[0])) {
			this.op			= "BREAK";
		} else if (/^call?$/i.test(parts[0])) {
			this.op			= "CALL";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts[2] || this.regs[0];
			this.regs[2]	= parts.slice(3).join(' ');
		} else if (/^eva?l$/i.test(parts[0])) {
			this.op			= "EVAL";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts[2] || this.regs[0];
		} else if (/^l(abel|a?bl?)?$/i.test(parts[0])) {
			this.op			= "LABEL";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts.slice(2).join(' ') || i.toString();
			jsa.store.set(this.regs[0], Number(this.regs[1]) || i);
		} else if (/^j(u?mp)?$/i.test(parts[0])) {
			this.op			= "JUMP";
			this.regs[0]	= parts.slice(1).join(' ') || "x";
		} else if (/^if$/i.test(parts[0])) {
			this.op			= "IF";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts.slice(2).join(' ') || (i + 2).toString();
		} else if (/^ifn(o?t)?$/i.test(parts[0])) {
			this.op			= "IFNOT";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts.slice(2).join(' ') || (i + 2).toString();
		} else if (/^set$/i.test(parts[0])) {
			this.op			= "SET";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts.slice(2).join(' ') || "0";
		} else if (/^add$/i.test(parts[0])) {
			this.op			= "ADD";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^sub$/i.test(parts[0])) {
			this.op			= "SUB";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^mul$/i.test(parts[0])) {
			this.op			= "MUL";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "-1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^div$/i.test(parts[0])) {
			this.op			= "DIV";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : this.regs[0]);
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : (parts[2] ? this.regs[0] : "1")) || this.regs[0];
		} else if (/^mod$/i.test(parts[0])) {
			this.op			= "MOD";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "2");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^pow$/i.test(parts[0])) {
			this.op			= "POW";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : this.regs[0]);
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^shl$/i.test(parts[0])) {
			this.op			= "SHL";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^shr$/i.test(parts[0])) {
			this.op			= "SHR";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^ush$/i.test(parts[0])) {
			this.op			= "USH";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^or$/i.test(parts[0])) {
			this.op			= "OR";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : this.regs[0]);
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^bor$/i.test(parts[0])) {
			this.op			= "BOR";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^xor$/i.test(parts[0])) {
			this.op			= "XOR";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : this.regs[0]);
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^and$/i.test(parts[0])) {
			this.op			= "AND";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : this.regs[0]);
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^ba?nd$/i.test(parts[0])) {
			this.op			= "BND";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "1");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^no?t$/i.test(parts[0])) {
			this.op			= "NOT";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts.slice(2).join(' ') || this.regs[0];
		} else if (/^bno?t$/i.test(parts[0])) {
			this.op			= "BNT";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts.slice(2).join(' ') || this.regs[0];
		} else if (/^gt$/i.test(parts[0])) {
			this.op			= "GT";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^gte$/i.test(parts[0])) {
			this.op			= "GTE";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^lt$/i.test(parts[0])) {
			this.op			= "LT";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^lte$/i.test(parts[0])) {
			this.op			= "LTE";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^arr?$/i.test(parts[0])) {
			this.op			= "ARR";
			this.regs[0]	= parts[1] || "x";
		} else if (/^obj$/i.test(parts[0])) {
			this.op			= "OBJ";
			this.regs[0]	= parts[1] || "x";
		} else if (/^arg$/i.test(parts[0])) {
			this.op			= "ARG";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^obg$/i.test(parts[0])) {
			this.op			= "OBG";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^ars$/i.test(parts[0])) {
			this.op			= "ARS";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^obs$/i.test(parts[0])) {
			this.op			= "OBS";
			this.regs[0]	= parts[1] || "x";
			this.regs[2]	= parts.slice(3).join(' ') || (parts[2] ? parts[2] : "0");
			this.regs[1]	= (parts.slice(3).join(' ') ? parts[2] : this.regs[0]) || this.regs[0];
		} else if (/^arl$/i.test(parts[0])) {
			this.op			= "ARL";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts[2] || this.regs[0];
		} else if (/^obk$/i.test(parts[0])) {
			this.op			= "OBK";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts[2] || this.regs[0];
		} else if (/^pu?sh$/i.test(parts[0])) {
			this.op			= "PUSH";
			this.regs[0]	= parts[1] || "0";
			this.regs[1]	= parts[2] || "x";
		} else if (/^unsh?$/i.test(parts[0])) {
			this.op			= "UNSHIFT";
			this.regs[0]	= parts[1] || "0";
			this.regs[1]	= parts[2] || "x";
		} else if (/^pop$/i.test(parts[0])) {
			this.op			= "POP";
			this.regs[0]	= parts[1] || "0";
			this.regs[1]	= parts[2] || "x";
		} else if (/^shft?$/i.test(parts[0])) {
			this.op			= "SHIFT";
			this.regs[0]	= parts[1] || "0";
			this.regs[1]	= parts[2] || "x";
		} else if (/^type?$/i.test(parts[0])) {
			this.op			= "TYPE";
			this.regs[0]	= parts[1] || "x";
			this.regs[1]	= parts[2] || this.regs[0];
		} else if (/^out?$/i.test(parts[0])) {
			this.op			= "OUT";
			this.regs[0]	= parts[1] || "x";
		} else {
			this.op			= "NOP";
		}
	} //ctor
	
	/**
	 * @readonly
	 * @memberof Exp
	 * @returns {number}
	 */
	get opcode() {
		return Object.keys(Exp.opcodes).findIndex(o => o == this.op.toLowerCase());
	} //opcode
	
	/**
	 * @param {JSA} i
	 * @param  {...any} d
	 */
	execute(i, ...arg) {
		let	v	= undefined;
		
		i.store.set("arg", arg);
		
		switch(this.op.toUpperCase()) {
			case "OUT": {
				v	= i.get(this.regs[0]);
				
				break;
			}
			case "TYPE": {
				i.store.set(this.regs[0], v = typeof i.get(this.regs[1]));
				
				break;
			}
			case "SHIFT": {
				i.store.set(this.regs[0], v = (i.get(this.regs[1]) || [ ]).shift());
				
				break;
			}
			case "POP": {
				i.store.set(this.regs[0], v = (i.get(this.regs[1]) || [ ]).pop());
				
				break;
			}
			case "UNSHIFT": {
				(i.get(this.regs[1]) || [ ]).unshift(v = i.get(this.regs[0]));
				
				break;
			}
			case "PUSH": {
				(i.get(this.regs[1]) || [ ]).push(v = i.get(this.regs[0]));
				
				break;
			}
			case "OBK": {
				i.store.set(this.regs[0], v = Object.keys(i.get(this.regs[1]) || { }));
				
				break;
			}
			case "ARL": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]).length || 0);
				
				break;
			}
			case "OBS":
			case "ARS": {
				v	= (i.get(this.regs[1]) || { })[i.get(this.regs[2])]	= i.get(this.regs[0]);
				
				break;
			}
			case "OBG":
			case "ARG": {
				i.store.set(this.regs[0], v = (i.get(this.regs[1]) || { })[i.get(this.regs[2])]);
				
				break;
			}
			case "OBJ": {
				i.store.set(this.regs[0], v = { });
				
				break;
			}
			case "ARR": {
				i.store.set(this.regs[0], v = [ ]);
				
				break;
			}
			case "LTE": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) <= i.get(this.regs[2]));
				
				break;
			}
			case "LT": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) < i.get(this.regs[2]));
				
				break;
			}
			case "GTE": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) >= i.get(this.regs[2]));
				
				break;
			}
			case "GT": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) > i.get(this.regs[2]));
				
				break;
			}
			case "BNT": {
				i.store.set(this.regs[0], v = ~i.get(this.regs[1]));
				
				break;
			}
			case "NOT": {
				i.store.set(this.regs[0], v = !i.get(this.regs[1]));
				
				break;
			}
			case "XOR": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) ^ i.get(this.regs[2]));
				
				break;
			}
			case "BND": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) & i.get(this.regs[2]));
				
				break;
			}
			case "BOR": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) | i.get(this.regs[2]));
				
				break;
			}
			case "AND": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) && i.get(this.regs[2]));
				
				break;
			}
			case "OR": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) || i.get(this.regs[2]));
				
				break;
			}
			case "USH": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) >>> i.get(this.regs[2]));
				
				break;
			}
			case "SHR": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) >> i.get(this.regs[2]));
				
				break;
			}
			case "SHL": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) << i.get(this.regs[2]));
				
				break;
			}
			case "POW": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) ** i.get(this.regs[2]));
				
				break;
			}
			case "MOD": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) % i.get(this.regs[2]));
				
				break;
			}
			case "DIV": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) / i.get(this.regs[2]));
				
				break;
			}
			case "MUL": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) * i.get(this.regs[2]));
				
				break;
			}
			case "SUB": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) - i.get(this.regs[2]));
				
				break;
			}
			case "ADD": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]) + i.get(this.regs[2]));
				
				break;
			}
			case "SET": {
				i.store.set(this.regs[0], v = i.get(this.regs[1]));
				
				break;
			}
			case "IFNOT": {
				if (!i.get(this.regs[0]))
					v	= i.idx	= i.get(this.regs[1]);
				
				break;
			}
			case "IF": {
				if (i.get(this.regs[0]))
					v	= i.idx	= i.get(this.regs[1]);
				
				break;
			}
			case "JUMP": {
				v	= i.idx	= Number(i.get(this.regs[0])) || 0
				
				break;
			}
			case "LABEL": {
				i.store.set(this.regs[0], v = Number(i.get(this.regs[1])) || 0);
				
				break;
			}
			case "CALL": {
				try {
					const	strip	= this.regs[1].replace(/^"/i, "");
					
					i.store.set(this.regs[0], v = i.get(strip).call(i.get(strip), i.get(this.regs[2])));
				} catch(err) {
					throw "CALL_NOT_FUNC";
				}
				
				break;
			}
			case "EVAL": {
				i.store.set(this.regs[0], v = eval(i.get(this.regs[1])));
				
				break;
			}
			case "BREAK":
			case "NOP":
			default: {
				
			}
		}
		
		return v;
	} //execute
	
} //Exp

if (typeof module != "undefined") {
	module.exports	= {
		JSA, Exp,
	};
}
