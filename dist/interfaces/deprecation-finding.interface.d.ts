export interface iDeprecationFinding {
    file: string;
    line: number;
    character: number;
    type: 'prop';
    name: string;
    message: string;
    component?: string;
}
