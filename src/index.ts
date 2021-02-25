import Calculator from './calculator';

let cal = new Calculator();

export function add(a: number, b: number) {
    return cal.add(a, b);
}

export { Calculator };

console.log('Hello From Sample TS Lib!!!');
