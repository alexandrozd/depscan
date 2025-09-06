import * as ts from 'typescript'
import { existsSync } from 'node:fs'
import path from 'path'

import { iDeprecationFinding } from './interfaces'


export class DeprecationScanner {
  private program: ts.Program
  private checker: ts.TypeChecker
  private findings: iDeprecationFinding[] = []

  scanProject = (): iDeprecationFinding[] => {
    // 1. look for tsconfig.json
    const tsConfigPath = this.findTsConfig()

    if (!tsConfigPath) {
      throw new Error('tsconfig.json not found')
    }

    // 2. read and parse tsconfig.json
    const config = this.readTsConfig(tsConfigPath)

    // 3. create TypeScript program
    this.program = ts.createProgram({
      rootNames: config.fileNames,
      options: config.options,
      projectReferences: config.projectReferences
    })

    this.checker = this.program.getTypeChecker()
    this.findings = []

    // 4. scan each source file (exclude node_modules)
    const sourceFiles = this.program.getSourceFiles().filter(
      (file) => !this.isInNodeModules(file.fileName)
    )

    for (const sourceFile of sourceFiles) {
      this.scanSourceFile(sourceFile)
    }

    return this.findings
  }

  private findTsConfig = (): string | undefined => {
    const maxLevels = 10

    for (let level = 0; level < maxLevels; level++) {
      const relativePath = '../'.repeat(level) + 'tsconfig.json'
      const configPath = path.resolve(process.cwd(), relativePath)

      if (existsSync(configPath)) {
        return configPath
      }

      if (path.dirname(configPath) === path.dirname(path.resolve(process.cwd(), '../'.repeat(level + 1)))) {
        break
      }
    }
  }

  private readTsConfig = (configPath: string): {
    fileNames: string[]
    options: ts.CompilerOptions
    projectReferences?: readonly ts.ProjectReference[]
  } => {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile)

    if (configFile.error) {
      throw new Error(`Error reading tsconfig: ${configFile.error.messageText}`)
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    )

    if (parsedConfig.errors.length) {
      throw new Error(`Error parsing tsconfig: ${parsedConfig.errors[0].messageText}`)
    }

    return {
      fileNames: parsedConfig.fileNames,
      options: parsedConfig.options,
      projectReferences: parsedConfig.projectReferences
    }
  }

  private isInNodeModules = (
    filePath: string
  ): boolean => {
    return filePath.includes('node_modules')
  }

  private scanSourceFile = (
    sourceFile: ts.SourceFile
  ) => {
    ts.forEachChild(sourceFile, (node) => {
      this.visitNode(node, sourceFile)
    })
  }

  private visitNode = (
    node: ts.Node,
    sourceFile: ts.SourceFile
  ) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      this.checkJsxElement(node, sourceFile)
    }

    ts.forEachChild(node, (child) => this.visitNode(child, sourceFile))
  }

  private checkJsxElement = (
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    sourceFile: ts.SourceFile
  ) => {
    try {
      const componentName = node.tagName.getText()

      // get component type
      const componentType = this.checker.getTypeAtLocation(node.tagName)

      if (!componentType) {
        console.warn(`Cannot get type for component: ${componentName}`)
        return
      }

      // get props type
      const propsType = this.getComponentPropsType(componentType)

      if (!propsType) {
        // console.warn(`Cannot get props type for component: ${componentName}`)
        return
      }

      // check each attribute
      this.checkAllAttributes(node, propsType, sourceFile, componentName)
    } catch (error) {
      console.warn('Error checking JSX element:', error)
    }
  }

  private getComponentPropsType = (
    componentType: ts.Type
  ): ts.Type | undefined => {
    try {
      // function components
      const callSignatures = componentType.getCallSignatures()

      if (callSignatures.length) {
        const firstSignature = callSignatures[0]

        if (firstSignature.parameters.length) {
          const firstParam = firstSignature.parameters[0]

          return this.checker.getTypeOfSymbol(firstParam)
        }
      }

      // class components
      const constructSignatures = componentType.getConstructSignatures()

      if (constructSignatures.length) {
        const firstSignature = constructSignatures[0]
        const instanceType = firstSignature.getReturnType()
        const propsProperty = instanceType.getProperty('props')

        if (propsProperty) {
          return this.checker.getTypeOfSymbol(propsProperty)
        }
      }
    } catch (error) {
      console.warn('Error getting component props type:', error)
    }
  }

  private checkAllAttributes = (
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    propsType: ts.Type,
    sourceFile: ts.SourceFile,
    componentName: string
  ) => {
    node.attributes.properties.forEach(attr => {
      if (ts.isJsxAttribute(attr)) {
        this.checkJsxAttribute(attr, propsType, sourceFile, componentName)
      }
    })
  }

  private checkJsxAttribute = (
    attr: ts.JsxAttribute,
    propsType: ts.Type,
    sourceFile: ts.SourceFile,
    component: string
  ) => {
    try {
      const propName = attr.name.getText()
      const position = sourceFile.getLineAndCharacterOfPosition(attr.getStart())

      // look for prop in props type
      const property = propsType.getProperty(propName)

      if (!property) {
        return
      }

      // check for @deprecated tag
      const tags = property.getJsDocTags()
      const deprecatedTag = tags.find(tag => tag.name === 'deprecated')

      if (deprecatedTag) {
        const message = this.getDeprecationMessage(deprecatedTag)

        this.findings.push({
          file: sourceFile.fileName,
          line: position.line + 1,
          character: position.character + 1,
          type: 'prop',
          name: propName,
          message,
          component
        })
      }

    } catch (error) {
      console.warn('Error checking JSX attribute:', error)
    }
  }

  private getDeprecationMessage = (
    deprecatedTag: ts.JSDocTagInfo
  ): string => {
    if (typeof deprecatedTag.text === 'string') {
      return deprecatedTag.text
    }

    if (Array.isArray(deprecatedTag.text)) {
      return deprecatedTag.text
        .map((part) => typeof part === 'string' ? part : part.text)
        .join('')
    }

    return 'Prop is deprecated'
  }

  printFindings = () => {
    if (!this.findings.length) {
      console.log('✅ No deprecated usage found!')
      return
    }

    console.log(`\n⚠️  Found ${this.findings.length} deprecated usages:\n`)

    this.findings.forEach((finding, index) => {
      const absolutePath = path.resolve(finding.file)
      const ideLink = `${absolutePath}:${finding.line}:${finding.character}`

      console.log(`${index + 1}. ${finding.type.toUpperCase()}: \x1b[33m${finding.name}\x1b[0m`)

      if (finding.component) {
        console.log(`   Component: \x1b[36m${finding.component}\x1b[0m`)
      }

      console.log(`   File: \x1b[34;4m${ideLink}\x1b[0m`)
      console.log(`   Message: \x1b[31m${finding.message}\x1b[0m`)
      console.log('---')
    })
  }
}
