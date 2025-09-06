#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const deprescan_1 = require("./deprescan");
function main() {
    try {
        console.log('🔍 Starting deprecation scan...');
        const scanner = new deprescan_1.DeprecationScanner();
        const findings = scanner.scanProject();
        scanner.printFindings();
        if (findings.length) {
            process.exit(1);
        }
    }
    catch (error) {
        console.error('Scanner error:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
