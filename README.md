# JSA

An esolang pseudoassembly implemented in JS.

* Strings start with " (ex. `"this is a string`).
* You should use strings only as last operand.
* By negating a GT you get a LTE etc.
* Whitespace is `\\s`.

## Usage

```js
jsa = JSA.parse(text) # or JSA.parseBinary(TypedArray)

for (const c of jsa.execute("args")) {
    console.log(c);
}
```

or you can use the NodeJS binary

```bash
jsa compile file [output]  - Compile (.jsa -> .jsae)
jsa run file               - Execute program (.jsa or .jsae)
```

## Opcodes (jsa)

```asm
* #                            - comment
* NOP - NOP                    - nothing...
* BRK - BRK                    - break execution
* CAL - CAL x, [a=x, [params]] - Syscall [system command names are passed as strings]
* EVAL - EVAL x, code          - Evaluate JS code, `"arg` gives env params
* LAB - LAB x, [a=line]        - label x = a
* JMP - JMP x                  - jmp x
* IF  - IF  x, [a]             - if(x) jmp a
* IFN - IFN x, [a]             - if(!x) jmp a
* SET - SET x, a               - x = a
* ADD - ADD x, [a=x[, b=1]]    - x = a + b   | x = x + a
* SUB - SUB x, [a=x[, b=1]]    - x = a - b   | x = x - a
* MUL - MUL x, [a=x[, b=-1]]   - x = a * b   | x = x * a
* DIV - DIV x, a[, b=x]        - x = a / b
* MOD - MOD x, a[, b]          - x = a % b   | x = x % a
* POW - POW x, a[, b]          - x = a ** b  | x = x ** a
* SHL - SHL x, [a=x, [b=1]]    - x = a << b  | x = x << a
* SHR - SHR x, [a=x, [b=1]]    - x = a >> b  | x = x >> a
* USH - USH x, [a=x, [b=1]]    - x = a >>> b | x = x >>> a
* OR  - OR  x, [a=x, [b=x]]    - x = a || b  | x = x || a
* BOR - BOR x, a=x, [b]        - x = a | b   | x = x | a
* XOR - XOR x, [a=x, [b=x]]    - x = a ^ b   | x = x ^ a
* AND - AND x, a=x, [b]        - x = a && b  | x = x && a
* BND - BND x, [a=x, [b=x]]    - x = a & b   | x = x & a
* NOT - NOT x, [a=x]           - x = !a
* BNT - BNT x, [a=x]           - x = ~a
* GT  - GT  x, [a=x, [b]]      - x = a > b   | x = x > a
* GTE - GTE x, [a=x, [b]]      - x = a >= b  | x = x >= a
* LT  - LT  x, [a=x, [b]]      - x = a < b   | x = x < a
* LTE - LTE x, [a=x, [b]]      - x = a <= b  | x = x <= a
* ARR - ARR x                  - x = [ ]
* ARG - ARG x, a=x, [b]        - x = a[b]    | x = x[a]
* ARS - ARS x, a, b            - a[b] = x
* ARL - ARL x, a=x             - x = a.length
* PSH - PSH x, a               - a.push(x)
* UNS - UNS x, a               - a.unshift(x)
* POP - POP x, a               - x = a.pop()
* SHF - SHF x, a               - x = a.shift()
* OBJ - OBJ x                  - x = { }
* OBG - OBG x, a=x, [b]        - x = a[b]    | x = x[a]
* OBS - OBS x, a, b            - a[b] = x
* OBK - OBK x, a=x             - x = a.keys()
* TYP - TYP x, [a=x]           - x = typeof x
* OUT - OUT x                  - console.log(x)
```

## Executable Format (jsae)

```asm
137 - magic number
1|0 - fixed length or extensible syntax
...data{  }
138 - magic number
...code{ OPC [DST[, OP2[, OP3]]] } where DST,OP2,OP3 are { 0|1|2|3 0-255 } where 0 is registers and 1 is datastore and 2 is immediate and 3 is system
NOP
```

* 255 defines extension.
