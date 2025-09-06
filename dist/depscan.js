"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeprecationScanner = void 0;
const ts = __importStar(require("typescript"));
const node_fs_1 = require("node:fs");
const path_1 = __importDefault(require("path"));
class DeprecationScanner {
    constructor() {
        this.findings = [];
        this.scanProject = () => {
            // 1. look for tsconfig.json
            const tsConfigPath = this.findTsConfig();
            if (!tsConfigPath) {
                throw new Error('tsconfig.json not found');
            }
            // 2. read and parse tsconfig.json
            const config = this.readTsConfig(tsConfigPath);
            // 3. create TypeScript program
            this.program = ts.createProgram({
                rootNames: config.fileNames,
                options: config.options,
                projectReferences: config.projectReferences
            });
            this.checker = this.program.getTypeChecker();
            this.findings = [];
            // 4. scan each source file (exclude node_modules)
            const sourceFiles = this.program.getSourceFiles().filter((file) => !this.isInNodeModules(file.fileName));
            for (const sourceFile of sourceFiles) {
                this.scanSourceFile(sourceFile);
            }
            return this.findings;
        };
        this.findTsConfig = () => {
            const maxLevels = 10;
            for (let level = 0; level < maxLevels; level++) {
                const relativePath = '../'.repeat(level) + 'tsconfig.json';
                const configPath = path_1.default.resolve(process.cwd(), relativePath);
                if ((0, node_fs_1.existsSync)(configPath)) {
                    return configPath;
                }
                if (path_1.default.dirname(configPath) === path_1.default.dirname(path_1.default.resolve(process.cwd(), '../'.repeat(level + 1)))) {
                    break;
                }
            }
        };
        this.readTsConfig = (configPath) => {
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
            if (configFile.error) {
                throw new Error(`Error reading tsconfig: ${configFile.error.messageText}`);
            }
            const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path_1.default.dirname(configPath));
            if (parsedConfig.errors.length) {
                throw new Error(`Error parsing tsconfig: ${parsedConfig.errors[0].messageText}`);
            }
            return {
                fileNames: parsedConfig.fileNames,
                options: parsedConfig.options,
                projectReferences: parsedConfig.projectReferences
            };
        };
        this.isInNodeModules = (filePath) => {
            return filePath.includes('node_modules');
        };
        this.scanSourceFile = (sourceFile) => {
            ts.forEachChild(sourceFile, (node) => {
                this.visitNode(node, sourceFile);
            });
        };
        this.visitNode = (node, sourceFile) => {
            if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
                this.checkJsxElement(node, sourceFile);
            }
            ts.forEachChild(node, (child) => this.visitNode(child, sourceFile));
        };
        this.checkJsxElement = (node, sourceFile) => {
            try {
                const componentName = node.tagName.getText();
                // get component type
                const componentType = this.checker.getTypeAtLocation(node.tagName);
                if (!componentType) {
                    console.warn(`Cannot get type for component: ${componentName}`);
                    return;
                }
                // get props type
                const propsType = this.getComponentPropsType(componentType);
                if (!propsType) {
                    // console.warn(`Cannot get props type for component: ${componentName}`)
                    return;
                }
                // check each attribute
                this.checkAllAttributes(node, propsType, sourceFile, componentName);
            }
            catch (error) {
                console.warn('Error checking JSX element:', error);
            }
        };
        this.getComponentPropsType = (componentType) => {
            try {
                // function components
                const callSignatures = componentType.getCallSignatures();
                if (callSignatures.length) {
                    const firstSignature = callSignatures[0];
                    if (firstSignature.parameters.length) {
                        const firstParam = firstSignature.parameters[0];
                        return this.checker.getTypeOfSymbol(firstParam);
                    }
                }
                // class components
                const constructSignatures = componentType.getConstructSignatures();
                if (constructSignatures.length) {
                    const firstSignature = constructSignatures[0];
                    const instanceType = firstSignature.getReturnType();
                    const propsProperty = instanceType.getProperty('props');
                    if (propsProperty) {
                        return this.checker.getTypeOfSymbol(propsProperty);
                    }
                }
            }
            catch (error) {
                console.warn('Error getting component props type:', error);
            }
        };
        this.checkAllAttributes = (node, propsType, sourceFile, componentName) => {
            node.attributes.properties.forEach(attr => {
                if (ts.isJsxAttribute(attr)) {
                    this.checkJsxAttribute(attr, propsType, sourceFile, componentName);
                }
            });
        };
        this.checkJsxAttribute = (attr, propsType, sourceFile, component) => {
            try {
                const propName = attr.name.getText();
                const position = sourceFile.getLineAndCharacterOfPosition(attr.getStart());
                // look for prop in props type
                const property = propsType.getProperty(propName);
                if (!property) {
                    return;
                }
                // check for @deprecated tag
                const tags = property.getJsDocTags();
                const deprecatedTag = tags.find(tag => tag.name === 'deprecated');
                if (deprecatedTag) {
                    const message = this.getDeprecationMessage(deprecatedTag);
                    this.findings.push({
                        file: sourceFile.fileName,
                        line: position.line + 1,
                        character: position.character + 1,
                        type: 'prop',
                        name: propName,
                        message,
                        component
                    });
                }
            }
            catch (error) {
                console.warn('Error checking JSX attribute:', error);
            }
        };
        this.getDeprecationMessage = (deprecatedTag) => {
            if (typeof deprecatedTag.text === 'string') {
                return deprecatedTag.text;
            }
            if (Array.isArray(deprecatedTag.text)) {
                return deprecatedTag.text
                    .map((part) => typeof part === 'string' ? part : part.text)
                    .join('');
            }
            return 'Prop is deprecated';
        };
        this.printFindings = () => {
            if (!this.findings.length) {
                console.log('✅ No deprecated usage found!');
                return;
            }
            console.log(`\n⚠️  Found ${this.findings.length} deprecated usages:\n`);
            this.findings.forEach((finding, index) => {
                const absolutePath = path_1.default.resolve(finding.file);
                const ideLink = `${absolutePath}:${finding.line}:${finding.character}`;
                console.log(`${index + 1}. ${finding.type.toUpperCase()}: \x1b[33m${finding.name}\x1b[0m`);
                if (finding.component) {
                    console.log(`   Component: \x1b[36m${finding.component}\x1b[0m`);
                }
                console.log(`   File: \x1b[34;4m${ideLink}\x1b[0m`);
                console.log(`   Message: \x1b[31m${finding.message}\x1b[0m`);
                console.log('---');
            });
        };
    }
}
exports.DeprecationScanner = DeprecationScanner;
