import { value } from './value';

class Counter {
  increment() {
    return value + 1;
  }
}

function run() {
  return new Counter().increment();
}
