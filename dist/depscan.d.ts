import { iDeprecationFinding } from './interfaces';
export declare class DeprecationScanner {
    private program;
    private checker;
    private findings;
    scanProject: () => iDeprecationFinding[];
    private findTsConfig;
    private readTsConfig;
    private isInNodeModules;
    private scanSourceFile;
    private visitNode;
    private checkJsxElement;
    private getComponentPropsType;
    private checkAllAttributes;
    private checkJsxAttribute;
    private getDeprecationMessage;
    printFindings: () => void;
}
