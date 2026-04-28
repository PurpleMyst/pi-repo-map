import { helper } from './helper';

export class UserService {
  constructor(private readonly id: string) {}

  greet(): string {
    return `hello ${this.id}`;
  }

  static from(id: string): UserService {
    return new UserService(id);
  }
}

export interface Printable {
  print(): string;
}

export function topLevel(): string {
  return helper();
}

export const answer = 42;
