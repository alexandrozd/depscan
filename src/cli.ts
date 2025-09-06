#!/usr/bin/env node
import { DeprecationScanner } from './deprescan'

function main() {
  try {
    console.log('🔍 Starting deprecation scan...')
    const scanner = new DeprecationScanner()
    const findings = scanner.scanProject()

    scanner.printFindings()

    if (findings.length) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Scanner error:', error)
    process.exit(1)
  }
}

export { main }

if (require.main === module) {
  main()
}