declare module 'transformation-models' {
    export class TPS {
        constructor();
        addControlPoint(sourceX: number, sourceY: number, targetX: number, targetY: number): void;
        setControlPoints(sourcePoints: number[][], targetPoints: number[][]): void;
        calculateForwardTransformation(): void;
        transformForward(x: number, y: number): number[];
        transformInverse(x: number, y: number): number[];
    }
    
    export class Affine {
        constructor();
        addControlPoint(sourceX: number, sourceY: number, targetX: number, targetY: number): void;
        setControlPoints(sourcePoints: number[][], targetPoints: number[][]): void;
        calculateForwardTransformation(): void;
        transformForward(x: number, y: number): number[];
        transformInverse(x: number, y: number): number[];
    }
}
